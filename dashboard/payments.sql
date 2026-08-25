-- Healing Partners — payment state and audit trail
-- Run this THIRD, after schema.sql and access.sql. Safe to re-run.
--
-- Principle: the browser never asserts that money arrived. It can say a family
-- was sent to Stripe; only a verified webhook can say a payment succeeded.

-- ============================================================
-- VR lifecycle
-- ============================================================
-- A boolean cannot express the difference between "they want it", "they were
-- sent to checkout", and "the money arrived". Those need different handling and
-- different words on screen, so they get different states.

alter table designs add column if not exists vr_status text not null default 'none'
  check (vr_status in ('none','selected','included','pending','paid','refunded','completed'));
alter table designs add column if not exists vr_selected_at  timestamptz;
alter table designs add column if not exists vr_completed_at timestamptz;

--   none       nothing chosen
--   selected   family wants it, billing not yet determined
--   included   funeral home is billing it — appears on their invoice
--   pending    sent to Stripe, not yet confirmed
--   paid       webhook confirmed the money arrived
--   refunded   returned
--   completed  the model has been built and delivered

-- Money must be non-negative, and a paid row must actually have a payment.
alter table designs drop constraint if exists designs_vr_price_nonneg;
alter table designs add  constraint designs_vr_price_nonneg check (vr_price is null or vr_price >= 0);

alter table designs drop constraint if exists designs_vr_paid_coherent;
alter table designs add  constraint designs_vr_paid_coherent check (
  (vr_status <> 'paid')
  or (vr_paid_at is not null and vr_payment_ref is not null and vr_price is not null)
);

alter table designs drop constraint if exists designs_vr_completed_coherent;
alter table designs add  constraint designs_vr_completed_coherent check (
  vr_completed_at is null or vr_status in ('paid','completed','included')
);

-- Keep the old boolean in step with the status so nothing that reads it breaks.
create or replace function sync_vr_upgrade() returns trigger
language plpgsql as $$
begin
  new.vr_upgrade := new.vr_status in ('selected','included','pending','paid','completed');
  return new;
end; $$;

drop trigger if exists designs_vr_sync on designs;
create trigger designs_vr_sync before insert or update of vr_status on designs
  for each row execute function sync_vr_upgrade();

-- Cached AI tags. The story itself is never copied here — only the structured
-- tags derived from it, so widening access to tags never widens access to what
-- a family wrote.
alter table memorials add column if not exists story_tags jsonb;

-- ============================================================
-- Audit trail
-- ============================================================
-- Every money event, append-only. When someone says "I paid for this last
-- week, what happened?", this answers it in one query.

create table if not exists payment_events (
  id              uuid primary key default gen_random_uuid(),
  design_id       uuid references designs(id) on delete set null,
  memorial_id     uuid references memorials(id) on delete set null,

  event_type      text not null
                  check (event_type in ('vr_selected','checkout_created','payment_succeeded',
                                        'payment_failed','payment_cancelled','refunded',
                                        'vr_completed','note')),

  -- Stripe's own event id. UNIQUE is the idempotency guarantee: Stripe retries
  -- webhooks, and a duplicate delivery must not be processed twice.
  stripe_event_id text unique,
  stripe_ref      text,          -- checkout session or payment intent
  amount          numeric check (amount is null or amount >= 0),
  currency        text default 'usd',
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists payment_events_design_idx   on payment_events (design_id, created_at desc);
create index if not exists payment_events_memorial_idx on payment_events (memorial_id, created_at desc);

-- Append-only: no update or delete policy is granted to anyone, including the
-- founder. An audit trail that can be edited is not an audit trail.
alter table payment_events enable row level security;

drop policy if exists pe_founder_read on payment_events;
create policy pe_founder_read on payment_events for select to authenticated
  using (is_founder());
drop policy if exists pe_staff_read on payment_events;
create policy pe_staff_read on payment_events for select to authenticated
  using (my_role() in ('owner','counselor')
         and exists (select 1 from memorials m
                     where m.id = payment_events.memorial_id
                       and m.funeral_home_id = my_home()));

-- ============================================================
-- Recording a payment — the only supported path
-- ============================================================
-- Called by the Stripe webhook function with the service role. Idempotent: a
-- repeated stripe_event_id returns false and changes nothing.

create or replace function record_payment(
  p_stripe_event_id text,
  p_memorial_id     uuid,
  p_stripe_ref      text,
  p_amount          numeric,
  p_event_type      text default 'payment_succeeded',
  p_metadata        jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare d_id uuid;
begin
  -- Already seen this Stripe event? Do nothing, successfully.
  if exists (select 1 from payment_events where stripe_event_id = p_stripe_event_id) then
    return false;
  end if;

  select id into d_id from designs
   where memorial_id = p_memorial_id
   order by created_at desc limit 1;

  insert into payment_events (design_id, memorial_id, event_type, stripe_event_id,
                              stripe_ref, amount, metadata)
  values (d_id, p_memorial_id, p_event_type, p_stripe_event_id,
          p_stripe_ref, p_amount, p_metadata);

  if p_event_type = 'payment_succeeded' and d_id is not null then
    update designs
       set vr_status     = 'paid',
           vr_price      = coalesce(vr_price, p_amount),   -- keep the price actually charged
           vr_paid_at    = now(),
           vr_payment_ref= p_stripe_ref
     where id = d_id;
  elsif p_event_type = 'refunded' and d_id is not null then
    update designs set vr_status = 'refunded' where id = d_id;
  end if;

  return true;
end; $$;

revoke all on function record_payment(text,uuid,text,numeric,text,jsonb) from public, anon, authenticated;

-- ============================================================
-- Reporting
-- ============================================================
-- Three numbers that must never be added together: marker sales, commission,
-- and VR revenue.

create or replace view monthly_vr_revenue
with (security_invoker = true) as
select date_trunc('month', d.vr_paid_at) as month,
       coalesce(f.name, 'Direct')        as funeral_home,
       count(*)                          as upgrades,
       sum(d.vr_price)                   as gross      -- Healing Partners', in full
from designs d
join memorials m on m.id = d.memorial_id
left join funeral_homes f on f.id = m.funeral_home_id
where d.vr_status in ('paid','completed')
  and d.vr_paid_at is not null
  and is_founder()
group by 1, 2
order by 1 desc, 2;

-- Stuck in checkout for over an hour: they started paying and something broke.
create or replace view vr_stuck_pending
with (security_invoker = true) as
select d.id as design_id, m.full_name, m.id as memorial_id, d.vr_selected_at,
       (now() - d.vr_selected_at) as waiting
from designs d
join memorials m on m.id = d.memorial_id
where d.vr_status = 'pending'
  and d.vr_selected_at < now() - interval '1 hour'
  and is_founder()
order by d.vr_selected_at;
