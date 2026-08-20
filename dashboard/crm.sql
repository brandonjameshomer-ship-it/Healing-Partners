-- Healing Partners — who you have talked to, and what was said
-- Run this FIFTH, after subscriptions.sql.
--
-- This is the part of the business that happens before Stripe ever sees anyone:
-- the funeral homes you have called, what they said, and what you promised to do
-- next. It is deliberately separate from `funeral_homes`, which holds customers.
-- A prospect is not a customer, and merging the two makes both harder to read.

-- ============================================================
-- Prospects
-- ============================================================

create table if not exists prospects (
  id              uuid primary key default gen_random_uuid(),

  name            text not null,
  contact_name    text,
  role            text,                    -- "owner", "manager", "FSC"
  email           text,
  phone           text,
  city            text,
  state           text,
  locations       int,                     -- 1-3 is the target
  website         text,

  -- Where they are, in the order it actually happens.
  stage           text not null default 'to_contact'
                  check (stage in ('to_contact','contacted','conversation',
                                   'demo_booked','demo_done','trialing',
                                   'subscribed','declined','dormant')),

  source          text,                    -- how you found them
  declined_reason text,

  -- The single most useful field in any sales list: what you said you would do,
  -- and when. Everything else is history; this is the only forward-looking part.
  next_action     text,
  next_action_on  date,

  -- Set when they convert, so the pipeline and the revenue can be tied together.
  funeral_home_id uuid references funeral_homes(id) on delete set null,
  subscription_id uuid references subscriptions(id) on delete set null,

  first_contacted date,
  last_contacted  date,

  -- Email permission, tracked per prospect. See emails.sql for how this is
  -- enforced before anything is sent.
  email_opt_out   boolean not null default false,
  opt_out_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists prospects_stage_idx  on prospects (stage);
create index if not exists prospects_action_idx on prospects (next_action_on)
  where next_action_on is not null;

create or replace function touch_prospect() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists prospects_touch on prospects;
create trigger prospects_touch before update on prospects
  for each row execute function touch_prospect();

-- ============================================================
-- Notes
-- ============================================================
-- Append-only by design. A note you can edit later is a note you cannot trust
-- when you are trying to remember what someone actually said in March.

create table if not exists prospect_notes (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references prospects(id) on delete cascade,

  kind         text not null default 'note'
               check (kind in ('note','call','email','meeting','demo','stage_change')),
  body         text not null,

  -- The stage this note moved them to, if it moved them at all.
  stage_to     text,

  author       uuid default auth.uid(),
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists notes_prospect_idx on prospect_notes (prospect_id, occurred_at desc);

-- Adding a note is the only supported way to move someone through the pipeline,
-- so the history and the current state can never disagree.
create or replace function log_contact(
  p_prospect uuid,
  p_body     text,
  p_kind     text default 'note',
  p_stage    text default null,
  p_next     text default null,
  p_next_on  date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare n_id uuid;
begin
  if not is_founder() then
    raise exception 'Only Healing Partners can log contact';
  end if;

  insert into prospect_notes (prospect_id, body, kind, stage_to)
  values (p_prospect, p_body, p_kind, p_stage)
  returning id into n_id;

  update prospects
     set stage           = coalesce(p_stage, stage),
         next_action     = coalesce(p_next, next_action),
         next_action_on  = coalesce(p_next_on, next_action_on),
         last_contacted  = current_date,
         first_contacted = coalesce(first_contacted, current_date)
   where id = p_prospect;

  return n_id;
end; $$;

grant execute on function log_contact(uuid,text,text,text,text,date) to authenticated;

-- ============================================================
-- Access — founder only, all of it
-- ============================================================
-- Your sales pipeline is not a funeral home's business. No owner or counselor
-- policy exists here, deliberately.

alter table prospects      enable row level security;
alter table prospect_notes enable row level security;

drop policy if exists prospects_founder on prospects;
create policy prospects_founder on prospects for all to authenticated
  using (is_founder()) with check (is_founder());

drop policy if exists notes_founder on prospect_notes;
create policy notes_founder on prospect_notes for select to authenticated
  using (is_founder());
drop policy if exists notes_founder_add on prospect_notes;
create policy notes_founder_add on prospect_notes for insert to authenticated
  with check (is_founder());

-- ============================================================
-- What you look at
-- ============================================================

-- Today's list. If this is empty you have nothing you promised anyone.
create or replace view prospects_due
with (security_invoker = true) as
select p.id, p.name, p.contact_name, p.phone, p.email, p.stage,
       p.next_action, p.next_action_on,
       (current_date - p.next_action_on) as days_overdue
from prospects p
where is_founder()
  and p.next_action_on is not null
  and p.next_action_on <= current_date
  and p.stage not in ('subscribed','declined')
order by p.next_action_on;

-- Gone quiet. Contacted, interested enough not to say no, and then nothing.
-- This is where most deals are actually lost.
create or replace view prospects_stalled
with (security_invoker = true) as
select p.id, p.name, p.contact_name, p.email, p.stage, p.last_contacted,
       (current_date - p.last_contacted) as days_quiet
from prospects p
where is_founder()
  and p.stage in ('contacted','conversation','demo_booked','demo_done')
  and p.last_contacted is not null
  and p.last_contacted < current_date - 14
  and (p.next_action_on is null or p.next_action_on < current_date - 7)
order by p.last_contacted;

create or replace view pipeline_summary
with (security_invoker = true) as
select stage, count(*) as n
from prospects
where is_founder()
group by stage;
