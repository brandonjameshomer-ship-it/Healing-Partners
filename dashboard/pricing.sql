-- Healing Partners — Partner pricing and Exhibit A service terms
-- Run this FIFTH, after schema.sql, access.sql, payments.sql and subscriptions.sql.
--
-- Everything here comes from the Remember Them Partner User Agreement. Where a
-- clause governs a column, the clause is named. If the agreement changes, this
-- file is what has to change with it.
--
-- Two things this corrects in schema.sql, both of which move money:
--
--   1. commission_rate() used bands 1-5 / 6-19 / 20+. Exhibit B says
--      1-5 / 6-20 / 21+. A home with exactly 20 memorials was being charged
--      10% when it owes 12%.
--   2. There was only one schedule. Exhibit B has two, and which one applies
--      depends on whether the Partner carries qualifying insurance (Sec. 7).
--      Partners entitled to the Covered rates were being overcharged by a
--      third.

-- ============================================================
-- Partner pricing (Sec. 5, Sec. 6.8, Sec. 7)
-- ============================================================

alter table funeral_homes
  -- Sec. 6.8: "Partner independently establishes the price charged to its
  -- customers." The 2.5x markup is Healing Partners' SUGGESTED retail, not a
  -- rule we may impose, so it lives here per Partner and defaults to the
  -- suggestion rather than being hardcoded anywhere in the app.
  add column if not exists markup numeric not null default 2.5
    check (markup >= 1),

  -- Sec. 5.1: two subscription options, not one price.
  --   discounted -> $150/mo, six-month initial term, automatic payment required
  --   standard    -> $350/mo, month-to-month, no recapture
  add column if not exists plan text not null default 'discounted'
    check (plan in ('discounted','standard')),

  -- Sec. 5.2: ($350 - $150) x discounted months actually provided, owed only if
  -- the Partner leaves the discounted plan early of its own accord.
  add column if not exists discounted_months_served int not null default 0
    check (discounted_months_served >= 0),

  -- Sec. 7: professional liability / E&O at >= $1M per claim and $2M aggregate
  -- earns the Covered Schedule. Sec. 7.4 is explicit that a lapse is NOT a
  -- breach -- it only moves the Partner back to the Standard Schedule from the
  -- following calendar month. Nothing here may treat a lapse as a fault.
  add column if not exists insured boolean not null default false,
  add column if not exists insurance_expires_at date,
  add column if not exists insurance_carrier text,
  add column if not exists insurance_broker text,

  -- Exhibit A-4 service particulars. Deliberately NULL by default: these are
  -- negotiated per Partner and are still blank in the template agreement.
  -- A NULL here means "not agreed yet", which is different from zero, and the
  -- UI must say so rather than invent a number.
  add column if not exists users_included int check (users_included > 0),
  add column if not exists additional_user_fee numeric check (additional_user_fee >= 0),
  add column if not exists turnaround_days int check (turnaround_days > 0),
  add column if not exists rush_days int check (rush_days > 0),
  add column if not exists rush_fee numeric check (rush_fee >= 0),
  add column if not exists revisions_included int check (revisions_included >= 0),
  add column if not exists revision_fee numeric check (revision_fee >= 0),
  add column if not exists deliverable_formats text;

comment on column funeral_homes.markup is
  'Partner-set wholesale->retail multiplier. Sec. 6.8 makes this the Partner''s '
  'decision; 2.5 is the Healing Partners suggestion, not a requirement.';

-- The monthly subscription figure follows from the plan, so it should not be
-- possible to store a third number by hand.
create or replace function plan_price(p text)
returns numeric language sql immutable as $$
  select case when p = 'standard' then 350 else 150 end;
$$;

update funeral_homes set subscription = plan_price(plan)
 where subscription is distinct from plan_price(plan);

create or replace function sync_subscription() returns trigger
language plpgsql as $$
begin
  new.subscription := plan_price(new.plan);
  return new;
end; $$;

drop trigger if exists homes_sync_subscription on funeral_homes;
create trigger homes_sync_subscription before insert or update on funeral_homes
  for each row execute function sync_subscription();

-- Sec. 5.2. Zero unless the Partner leaves a discounted term early, and never
-- owed when the Partner leaves because of Healing Partners' uncured breach --
-- which is a judgement call, so this returns the arithmetic only.
create or replace function discount_recapture(home funeral_homes)
returns numeric language sql immutable as $$
  select case when home.plan = 'discounted'
              then (350 - 150) * home.discounted_months_served
              else 0 end;
$$;

-- ============================================================
-- Commission (Exhibit B)
-- ============================================================

-- Replaced rather than edited: the old two-argument-less signature is wrong in
-- both its bands and its silence about insurance.
drop view if exists monthly_commission;
drop function if exists commission_rate(int);

-- Exhibit B. Counts reset monthly (Sec. 6.2) and the month's tier applies to
-- every qualifying memorial in that month.
--
--            Memorials/month   Standard   Covered
--                      1-5        15%       10%
--                     6-20        12%        8%
--                      21+        10%        7%
create or replace function commission_rate(order_count int, is_insured boolean default false)
returns numeric language sql immutable as $$
  select case
    when is_insured then case when order_count >= 21 then 0.07
                              when order_count >= 6  then 0.08
                              else 0.10 end
    else                 case when order_count >= 21 then 0.10
                              when order_count >= 6  then 0.12
                              else 0.15 end
  end;
$$;

-- Sec. 1.8: Memorial Sale Price excludes tax, cemetery opening/closing/setting/
-- foundation/permit fees, and documented third-party shipping billed at cost.
-- Commission is charged on that figure, never on the gross invoice.
alter table orders
  add column if not exists tax numeric not null default 0 check (tax >= 0),
  add column if not exists cemetery_fees numeric not null default 0 check (cemetery_fees >= 0),
  add column if not exists shipping_at_cost numeric not null default 0 check (shipping_at_cost >= 0);

create or replace function memorial_sale_price(o orders)
returns numeric language sql immutable as $$
  select greatest(o.retail - o.tax - o.cemetery_fees - o.shipping_at_cost, 0);
$$;

-- Suggested retail from a supplier's wholesale, at this Partner's own markup.
-- Falls back to the supplier's default, then to 2.5, so a missing setting
-- degrades to the suggestion rather than to zero.
create or replace function suggested_retail(wholesale numeric, home_id uuid, supplier_id uuid)
returns numeric language sql stable as $$
  select round(wholesale * coalesce(
    (select f.markup   from funeral_homes f where f.id = home_id),
    (select s.markup   from suppliers s     where s.id = supplier_id),
    2.5), 2);
$$;

-- ============================================================
-- Rollup, rebuilt on the corrected rate
-- ============================================================

create or replace view monthly_commission as
with counted as (
  select o.funeral_home_id,
         date_trunc('month', o.started_at)   as month,
         count(*)                            as orders,
         sum(memorial_sale_price(o))         as sale_price,
         sum(o.retail)                       as gross
  from orders o
  where o.status in ('submitted','proof','approved','production','set')
  group by 1, 2
)
select c.month,
       f.name                                          as funeral_home,
       f.plan,
       f.insured,
       c.orders,
       commission_rate(c.orders::int, f.insured)       as rate,
       c.gross,
       c.sale_price,
       round(c.sale_price * commission_rate(c.orders::int, f.insured), 2) as commission,
       f.subscription,
       round(c.sale_price * commission_rate(c.orders::int, f.insured) + f.subscription, 2)
                                                       as total_owed,
       -- Sec. 6.4: reported and remitted by the 15th of the following month.
       (date_trunc('month', c.month) + interval '1 month' + interval '14 days')::date
                                                       as commission_due_on
from counted c
join funeral_homes f on f.id = c.funeral_home_id
order by c.month desc, f.name;

-- What the Covered Schedule is worth to a Partner, so the insurance
-- conversation can be had with a number rather than a claim.
create or replace view insurance_saving as
select m.month, m.funeral_home, m.orders, m.sale_price,
       round(m.sale_price * commission_rate(m.orders::int, false), 2) as standard_commission,
       round(m.sale_price * commission_rate(m.orders::int, true),  2) as covered_commission,
       round(m.sale_price * (commission_rate(m.orders::int, false)
                           - commission_rate(m.orders::int, true)), 2) as saving
from monthly_commission m;

-- Partners who cannot yet be onboarded because Exhibit A-4 is still blank.
-- Sec. 3.6 meters revisions, so a NULL revisions_included means the app has no
-- basis to tell anyone whether a revision is included or chargeable.
create or replace view partners_incomplete_terms as
select id, name,
       array_remove(array[
         case when users_included      is null then 'users included'        end,
         case when turnaround_days     is null then 'turnaround target'     end,
         case when revisions_included  is null then 'revision rounds'       end,
         case when revision_fee        is null then 'additional revision fee' end,
         case when deliverable_formats is null then 'deliverable formats'   end
       ], null) as missing
from funeral_homes
where active
  and (users_included is null or turnaround_days is null or revisions_included is null
       or revision_fee is null or deliverable_formats is null);
