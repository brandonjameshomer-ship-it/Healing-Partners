-- Healing Partners — subscription state for the $150/month plan
-- Run this FOURTH, after schema.sql, access.sql and payments.sql.
--
-- Same principle as payments.sql: the browser never asserts that someone is a
-- paying customer. Only a signature-verified Stripe webhook can say that.
--
-- The problem this table exists to solve:
--
--   Someone clicks "Start your 3-day free trial" on the landing page and pays
--   Stripe. At that moment there is NO funeral home row to attach it to — they
--   are a stranger with a card. The subscription therefore arrives orphaned and
--   has to stay visible until a human links it to a real funeral home.
--
--   A subscription nobody noticed is a customer paying you who never got set up.
--   `subscriptions_unclaimed` below is the queue that prevents that.

-- ============================================================
-- The subscription
-- ============================================================

create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),

  -- NULL until someone claims it. This is the normal state for a new trial,
  -- not an error condition.
  funeral_home_id        uuid references funeral_homes(id) on delete set null,

  stripe_customer_id     text,
  stripe_subscription_id text unique,

  -- Stripe's own vocabulary, kept verbatim rather than translated. When you are
  -- looking at this next to the Stripe dashboard at 11pm, matching words matter
  -- more than nicer ones.
  status                 text not null default 'incomplete'
                         check (status in ('incomplete','incomplete_expired','trialing',
                                           'active','past_due','canceled','unpaid','paused')),

  -- What they typed at checkout. The only identity we have before claiming.
  email                  text,
  contact_name           text,
  home_name              text,

  amount                 numeric check (amount is null or amount >= 0),
  currency               text not null default 'usd',
  interval               text not null default 'month',

  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  canceled_at            timestamptz,
  cancel_at_period_end   boolean not null default false,

  livemode               boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subs_home_idx     on subscriptions (funeral_home_id);
create index if not exists subs_status_idx   on subscriptions (status);
create index if not exists subs_customer_idx on subscriptions (stripe_customer_id);

-- One live subscription per funeral home. A home paying twice is a billing bug,
-- and the database should refuse it rather than report it later.
create unique index if not exists subs_one_active_per_home
  on subscriptions (funeral_home_id)
  where funeral_home_id is not null and status in ('trialing','active','past_due');

create or replace function touch_subscription() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists subs_touch on subscriptions;
create trigger subs_touch before update on subscriptions
  for each row execute function touch_subscription();

-- ============================================================
-- Audit trail
-- ============================================================
-- Append-only, and unique on Stripe's event id. Stripe retries deliveries;
-- a repeat must change nothing.

create table if not exists subscription_events (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id) on delete set null,

  event_type      text not null
                  check (event_type in ('trial_started','trial_ending','activated',
                                        'invoice_paid','payment_failed','past_due',
                                        'canceled','resumed','updated','note')),

  stripe_event_id text unique,
  stripe_ref      text,
  amount          numeric check (amount is null or amount >= 0),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists sub_events_idx on subscription_events (subscription_id, created_at desc);

-- ============================================================
-- Access
-- ============================================================
-- Founder sees everything. An owner sees their own home's subscription and
-- nothing else — never another home's, and never an unclaimed one.

alter table subscriptions       enable row level security;
alter table subscription_events enable row level security;

drop policy if exists subs_founder on subscriptions;
create policy subs_founder on subscriptions for all to authenticated
  using (is_founder()) with check (is_founder());

drop policy if exists subs_owner_read on subscriptions;
create policy subs_owner_read on subscriptions for select to authenticated
  using (my_role() = 'owner' and funeral_home_id is not null
         and funeral_home_id = my_home());

drop policy if exists sub_events_founder on subscription_events;
create policy sub_events_founder on subscription_events for select to authenticated
  using (is_founder());

-- No update or delete policy exists for subscription_events, for anyone,
-- including the founder. An audit trail that can be edited is not one.

-- ============================================================
-- Recording — the only supported write path
-- ============================================================
-- Called by the Stripe webhook with the service role. Idempotent on
-- p_stripe_event_id: a duplicate delivery returns false and changes nothing.

create or replace function record_subscription(
  p_stripe_event_id  text,
  p_subscription_id  text,
  p_customer_id      text,
  p_status           text,
  p_event_type       text,
  p_email            text        default null,
  p_home_name        text        default null,
  p_contact_name     text        default null,
  p_amount           numeric     default null,
  p_trial_ends_at    timestamptz default null,
  p_period_end       timestamptz default null,
  p_cancel_at_end    boolean     default null,
  p_livemode         boolean     default false,
  p_metadata         jsonb       default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  if p_stripe_event_id is not null
     and exists (select 1 from subscription_events where stripe_event_id = p_stripe_event_id)
  then
    return false;                      -- already handled
  end if;

  -- Upsert on Stripe's subscription id, which is the stable identity. COALESCE
  -- throughout: a later event carrying fewer fields must not blank out what an
  -- earlier one told us.
  insert into subscriptions (
    stripe_subscription_id, stripe_customer_id, status, email, home_name,
    contact_name, amount, trial_ends_at, current_period_end,
    cancel_at_period_end, canceled_at, livemode
  ) values (
    p_subscription_id, p_customer_id, coalesce(p_status,'incomplete'), p_email, p_home_name,
    p_contact_name, p_amount, p_trial_ends_at, p_period_end,
    coalesce(p_cancel_at_end,false),
    case when p_status = 'canceled' then now() end, p_livemode
  )
  on conflict (stripe_subscription_id) do update set
    stripe_customer_id   = coalesce(excluded.stripe_customer_id,   subscriptions.stripe_customer_id),
    status               = coalesce(excluded.status,               subscriptions.status),
    email                = coalesce(excluded.email,                subscriptions.email),
    home_name            = coalesce(excluded.home_name,            subscriptions.home_name),
    contact_name         = coalesce(excluded.contact_name,         subscriptions.contact_name),
    amount               = coalesce(excluded.amount,               subscriptions.amount),
    trial_ends_at        = coalesce(excluded.trial_ends_at,        subscriptions.trial_ends_at),
    current_period_end   = coalesce(excluded.current_period_end,   subscriptions.current_period_end),
    cancel_at_period_end = coalesce(excluded.cancel_at_period_end, subscriptions.cancel_at_period_end),
    canceled_at          = case when excluded.status = 'canceled'
                                then coalesce(subscriptions.canceled_at, now())
                                else subscriptions.canceled_at end
  returning id into s_id;

  insert into subscription_events (subscription_id, event_type, stripe_event_id,
                                   stripe_ref, amount, metadata)
  values (s_id, p_event_type, p_stripe_event_id, p_subscription_id, p_amount, p_metadata);

  -- A linked home follows its subscription. Losing access is a billing
  -- consequence, so it happens here rather than being remembered by a person.
  if s_id is not null then
    update funeral_homes f
       set active = (p_status in ('trialing','active','past_due'))
      from subscriptions s
     where s.id = s_id
       and f.id = s.funeral_home_id;
  end if;

  return true;
end; $$;

revoke all on function record_subscription(text,text,text,text,text,text,text,text,numeric,
                                           timestamptz,timestamptz,boolean,boolean,jsonb)
  from public, anon, authenticated;

-- ============================================================
-- Claiming an orphan
-- ============================================================
-- The human step: a stranger paid, you spoke to them, you created their funeral
-- home row. This ties the two together. Founder only.

create or replace function claim_subscription(p_subscription uuid, p_home uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_founder() then
    raise exception 'Only Healing Partners can link a subscription to a funeral home';
  end if;

  update subscriptions
     set funeral_home_id = p_home
   where id = p_subscription
     and funeral_home_id is null;    -- never silently move an existing link

  if not found then return false; end if;

  insert into subscription_events (subscription_id, event_type, metadata)
  values (p_subscription, 'note',
          jsonb_build_object('action','claimed','funeral_home_id',p_home));

  update funeral_homes f
     set active = (s.status in ('trialing','active','past_due'))
    from subscriptions s
   where s.id = p_subscription and f.id = p_home;

  return true;
end; $$;

grant execute on function claim_subscription(uuid,uuid) to authenticated;

-- ============================================================
-- What you look at
-- ============================================================

-- THE ONBOARDING QUEUE. Someone paid and is not set up yet. If this view is
-- not empty, there is a person waiting on you.
create or replace view subscriptions_unclaimed
with (security_invoker = true) as
select s.id, s.email, s.home_name, s.contact_name, s.status,
       s.trial_ends_at, s.created_at,
       (now() - s.created_at) as waiting
from subscriptions s
where s.funeral_home_id is null
  and s.status in ('trialing','active','past_due')
  and is_founder()
order by s.created_at;

-- Needs a phone call today: card declined, or a trial about to convert.
create or replace view subscriptions_attention
with (security_invoker = true) as
select s.id,
       coalesce(f.name, s.home_name, s.email, 'Unknown') as who,
       s.status,
       case
         when s.status = 'past_due'                              then 'Card declined'
         when s.status = 'unpaid'                                then 'Unpaid — access suspended'
         when s.cancel_at_period_end                             then 'Cancelling at period end'
         when s.status = 'trialing'
              and s.trial_ends_at < now() + interval '24 hours'  then 'Trial ends within a day'
         when s.funeral_home_id is null                          then 'Paid but not set up'
       end as issue,
       s.trial_ends_at, s.current_period_end, s.email
from subscriptions s
left join funeral_homes f on f.id = s.funeral_home_id
where is_founder()
  and (s.status in ('past_due','unpaid')
       or s.cancel_at_period_end
       or (s.status = 'trialing' and s.trial_ends_at < now() + interval '24 hours')
       or (s.funeral_home_id is null and s.status in ('trialing','active')))
order by
  case s.status when 'past_due' then 1 when 'unpaid' then 2 else 3 end,
  s.trial_ends_at nulls last;

-- Recurring revenue. Trials are counted separately and NOT as revenue — they
-- have not paid yet, and treating them as income is how you talk yourself into
-- a number that isn't real.
create or replace view subscription_summary
with (security_invoker = true) as
select
  count(*) filter (where status = 'active')                        as paying,
  count(*) filter (where status = 'trialing')                      as on_trial,
  count(*) filter (where status in ('past_due','unpaid'))          as at_risk,
  count(*) filter (where funeral_home_id is null
                     and status in ('trialing','active'))          as unclaimed,
  coalesce(sum(amount) filter (where status = 'active'), 0)        as mrr,
  coalesce(sum(amount) filter (where status = 'trialing'), 0)      as mrr_if_trials_convert
from subscriptions
where is_founder();
