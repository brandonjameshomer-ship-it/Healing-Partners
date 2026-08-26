-- 0003_commission_schedules.sql
--
-- Replaces the superseded commission bands. The old commission_rate() used
-- 1-5 / 5-20 / 20+, which overlapped at 5 and 20 and billed a home with exactly
-- 20 memorials at 10% instead of 12%. Exhibit A now sets two non-overlapping
-- schedules, the second for Partners carrying professional liability / E&O
-- cover of $1M per claim and $2M aggregate:
--
--   memorials/month   standard   covered
--   1-5                 15%        10%
--   6-20                12%         8%
--   21+                 10%         7%
--
-- Counts reset monthly and the month's tier applies to every memorial in that
-- month, so the rate is settled when the month closes, not when an order accrues.

-- Dropped rather than replaced: adding a defaulted argument would leave the old
-- single-argument version in place and make commission_rate(5) ambiguous.
drop function if exists public.commission_rate(integer);

create or replace function public.commission_rate(memorial_count integer, covered boolean default false)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case
    when memorial_count >= 21 then case when covered then 0.07 else 0.10 end
    when memorial_count >= 6  then case when covered then 0.08 else 0.12 end
    when memorial_count >= 1  then case when covered then 0.10 else 0.15 end
    else 0
  end;
$$;

comment on function public.commission_rate(integer, boolean) is
  'Commission rate for a Partner''s memorial count in one calendar month, per Exhibit A. Bands are 1-5 / 6-20 / 21+ and do not overlap.';

-- Insurance evidence decides which schedule a Partner earns.
alter table public.funeral_homes
  add column if not exists insurance_carrier      text,
  add column if not exists insurance_policy_no    text,
  add column if not exists insurance_per_claim    numeric check (insurance_per_claim >= 0),
  add column if not exists insurance_aggregate    numeric check (insurance_aggregate >= 0),
  add column if not exists insurance_expires_on   date,
  add column if not exists insurance_verified_at  timestamptz,
  add column if not exists insurance_verified_by  uuid references auth.users(id);

comment on column public.funeral_homes.insurance_verified_at is
  'When Healing Partners saw the certificate of insurance. Unverified cover does not earn the Covered schedule.';

-- Derived, not stored: cover lapses with the calendar.
create or replace function public.home_commission_schedule(p_home uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when h.insurance_verified_at is not null
     and h.insurance_expires_on >= current_date
     and coalesce(h.insurance_per_claim, 0) >= 1000000
     and coalesce(h.insurance_aggregate, 0) >= 2000000
    then 'covered'
    else 'standard'
  end
  from public.funeral_homes h
  where h.id = p_home;
$$;

grant execute on function public.home_commission_schedule(uuid) to authenticated;

-- Commission basis and accrual, per order.
alter table public.orders
  add column if not exists memorial_sale_price  numeric check (memorial_sale_price >= 0),
  add column if not exists excluded_fees        numeric not null default 0 check (excluded_fees >= 0),
  add column if not exists commission_period    date,
  add column if not exists commission_rate      numeric check (commission_rate >= 0 and commission_rate <= 1),
  add column if not exists commission_amount    numeric check (commission_amount >= 0),
  add column if not exists commission_accrued_at  timestamptz,
  add column if not exists commission_remitted_at timestamptz;

comment on column public.orders.memorial_sale_price is
  'What the Partner charges its customer, excluding taxes, cemetery opening/closing/setting/foundation/permit fees, and documented third-party shipping billed at cost. This, not wholesale, is the commission basis.';

comment on column public.orders.excluded_fees is
  'Sum of the pass-through amounts removed from the sale price to reach memorial_sale_price. Kept for the audit trail.';

comment on column public.orders.commission_period is
  'First day of the calendar month the memorial counts toward. Set on accrual and never moved, so a late status change cannot shift a memorial into a cheaper month.';

-- Accrual: the agreement ties this to delivery of the first final Deliverable
-- after proof approval, which in this schema is the move into 'approved'.
create or replace function public.orders_accrue_commission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and new.commission_accrued_at is null then
    new.memorial_sale_price  := coalesce(new.memorial_sale_price, new.retail);
    new.commission_period    := date_trunc('month', now())::date;
    new.commission_accrued_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ord_commission_accrue on public.orders;
create trigger ord_commission_accrue
  before insert or update on public.orders
  for each row execute function public.orders_accrue_commission();

-- Closing a month fixes one rate across every memorial in it. Already remitted
-- orders are left alone so a reopened month cannot rewrite a settled invoice.
create or replace function public.close_commission_month(p_home uuid, p_month date)
returns table (
  memorial_count integer,
  schedule       text,
  rate           numeric,
  basis          numeric,
  commission     numeric
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_count integer;
  v_sched text;
  v_rate  numeric;
begin
  if not is_founder() then
    raise exception 'only the founder may close a commission month';
  end if;

  select count(*) into v_count
    from public.orders o
   where o.funeral_home_id = p_home
     and o.commission_period = v_month
     and o.commission_accrued_at is not null;

  if v_count = 0 then
    return;
  end if;

  v_sched := public.home_commission_schedule(p_home);
  v_rate  := public.commission_rate(v_count, v_sched = 'covered');

  update public.orders o
     set commission_rate   = v_rate,
         commission_amount = round(coalesce(o.memorial_sale_price, o.retail) * v_rate, 2)
   where o.funeral_home_id = p_home
     and o.commission_period = v_month
     and o.commission_accrued_at is not null
     and o.commission_remitted_at is null;

  return query
    select v_count,
           v_sched,
           v_rate,
           sum(coalesce(o.memorial_sale_price, o.retail)),
           sum(o.commission_amount)
      from public.orders o
     where o.funeral_home_id = p_home
       and o.commission_period = v_month
       and o.commission_accrued_at is not null;
end;
$$;

grant execute on function public.close_commission_month(uuid, date) to authenticated;

-- Reporting view for the monthly statement. security_invoker keeps each
-- Partner inside its own rows rather than running as the view owner.
create or replace view public.commission_statement as
  select o.funeral_home_id,
         o.commission_period,
         count(*)::integer                                    as memorial_count,
         sum(coalesce(o.memorial_sale_price, o.retail))       as basis,
         max(o.commission_rate)                               as rate,
         sum(o.commission_amount)                             as commission_due,
         count(*) filter (where o.commission_remitted_at is null)::integer as unremitted,
         (o.commission_period + interval '1 month' + interval '14 days')::date as remit_by
    from public.orders o
   where o.commission_accrued_at is not null
   group by o.funeral_home_id, o.commission_period;

alter view public.commission_statement set (security_invoker = on);

comment on view public.commission_statement is
  'Monthly commission statement per Partner. remit_by is the 15th of the following month, per Exhibit A.';

grant select on public.commission_statement to authenticated;
