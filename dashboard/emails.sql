-- Healing Partners — automated email: renewal notice and lapse sequence
-- Run this SIXTH, after crm.sql.
--
-- Two rules shape everything here.
--
-- 1. TRANSACTIONAL AND MARKETING ARE DIFFERENT THINGS.
--    "Your card was declined" is transactional — it concerns money already owed
--    under an agreement they entered, and US law (CAN-SPAM, 15 U.S.C. 7702)
--    treats it differently from advertising. "We miss you, come back" is
--    marketing, and an unsubscribe must stop it dead. Both carry an unsubscribe
--    link anyway; only marketing is suppressed by it. Mixing the two categories
--    is the mistake that turns a billing notice into a violation.
--
-- 2. THIS INDUSTRY IS SMALL AND EVERYONE TALKS.
--    A funeral director who gets a debt-collector email will tell the next
--    director they see. The copy below is deliberately gentle for that reason,
--    and gets *less* pushy over time rather than more.

-- ============================================================
-- Suppression list — checked before every marketing send
-- ============================================================

create table if not exists email_suppressions (
  email        text primary key,
  reason       text not null default 'unsubscribed'
               check (reason in ('unsubscribed','bounced','complained','manual')),
  source       text,
  created_at   timestamptz not null default now()
);

-- Public-facing: the unsubscribe link calls this with no login. It can only
-- ever ADD a suppression, never read the list or remove anything.
create or replace function unsubscribe_email(p_token uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare addr text;
begin
  select recipient into addr from email_log where unsubscribe_token = p_token limit 1;
  if addr is null then return null; end if;

  insert into email_suppressions (email, reason, source)
  values (lower(addr), 'unsubscribed', 'link')
  on conflict (email) do nothing;

  update prospects
     set email_opt_out = true, opt_out_at = now()
   where lower(email) = lower(addr);

  return addr;
end; $$;

grant execute on function unsubscribe_email(uuid) to anon, authenticated;

alter table email_suppressions enable row level security;
drop policy if exists supp_founder on email_suppressions;
create policy supp_founder on email_suppressions for all to authenticated
  using (is_founder()) with check (is_founder());

-- ============================================================
-- Templates — data, not code
-- ============================================================
-- Editable from the dashboard without a deploy. {{placeholders}} are filled by
-- the send function.

create table if not exists email_templates (
  key          text primary key,
  category     text not null check (category in ('transactional','marketing')),
  subject      text not null,
  body         text not null,
  -- Days after the triggering event. Negative means before it.
  offset_days  int,
  trigger      text not null check (trigger in ('renewal','lapse','manual')),
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);

alter table email_templates enable row level security;
drop policy if exists tpl_founder on email_templates;
create policy tpl_founder on email_templates for all to authenticated
  using (is_founder()) with check (is_founder());

-- ============================================================
-- Log — append-only, and the thing that stops double-sends
-- ============================================================

create table if not exists email_log (
  id                 uuid primary key default gen_random_uuid(),
  template_key       text references email_templates(key) on delete set null,
  recipient          text not null,
  subscription_id    uuid references subscriptions(id) on delete set null,
  prospect_id        uuid references prospects(id) on delete set null,

  subject            text,
  status             text not null default 'queued'
                     check (status in ('queued','sent','failed','skipped')),
  skip_reason        text,
  provider_id        text,
  error              text,

  -- One token per email. Clicking unsubscribe in any message opts the address
  -- out of everything, which is what a recipient expects it to mean.
  unsubscribe_token  uuid not null default gen_random_uuid(),

  sent_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists email_log_token_idx  on email_log (unsubscribe_token);
create index if not exists email_log_recip_idx  on email_log (lower(recipient), created_at desc);

-- The guarantee that nobody gets the same message twice. If the sender crashes
-- halfway and runs again, this index refuses the duplicate rather than
-- apologising for it afterwards.
create unique index if not exists email_once_per_subscription
  on email_log (subscription_id, template_key)
  where subscription_id is not null;

alter table email_log enable row level security;
drop policy if exists log_founder on email_log;
create policy log_founder on email_log for select to authenticated using (is_founder());

-- ============================================================
-- What is due right now
-- ============================================================
-- Called by the scheduled send function. Returns one row per email that should
-- go out, already filtered for suppression and for anything already sent.

create or replace function emails_due()
returns table (
  template_key text,
  category     text,
  subject      text,
  body         text,
  recipient    text,
  sub_id       uuid,
  home_name    text,
  contact_name text,
  amount       numeric,
  due_date     date
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  -- ---- renewal notice: N days BEFORE the next charge ----
  select t.key, t.category, t.subject, t.body,
         coalesce(f.email, s.email), s.id,
         coalesce(f.name, s.home_name, 'your funeral home'),
         coalesce(s.contact_name, ''), s.amount,
         s.current_period_end::date
  from subscriptions s
  join email_templates t on t.trigger = 'renewal' and t.active
  left join funeral_homes f on f.id = s.funeral_home_id
  where s.status = 'active'
    and s.current_period_end is not null
    and s.current_period_end::date = current_date + (-t.offset_days)
    and coalesce(f.email, s.email) is not null
    and not exists (select 1 from email_log l
                     where l.subscription_id = s.id and l.template_key = t.key
                       and l.created_at > now() - interval '20 days')

  union all

  -- ---- lapse sequence: N days AFTER the payment failed ----
  select t.key, t.category, t.subject, t.body,
         coalesce(f.email, s.email), s.id,
         coalesce(f.name, s.home_name, 'your funeral home'),
         coalesce(s.contact_name, ''), s.amount,
         s.current_period_end::date
  from subscriptions s
  join email_templates t on t.trigger = 'lapse' and t.active
  left join funeral_homes f on f.id = s.funeral_home_id
  where s.status in ('past_due','unpaid','canceled')
    and s.current_period_end is not null
    and s.current_period_end::date = current_date - t.offset_days
    and coalesce(f.email, s.email) is not null
    -- Marketing stops at the suppression list. Transactional billing notices
    -- do not, because they concern money owed under an existing agreement.
    and (t.category = 'transactional'
         or not exists (select 1 from email_suppressions e
                         where e.email = lower(coalesce(f.email, s.email))))
    and not exists (select 1 from email_log l
                     where l.subscription_id = s.id and l.template_key = t.key);
end; $$;

revoke all on function emails_due() from public, anon, authenticated;
