-- Healing Partners — orders schema for Supabase (Postgres)
-- Run this in the Supabase SQL editor, then replace `Store` in dashboard/index.html
-- with the four Supabase calls noted there. Nothing else on the page changes.

create table if not exists funeral_homes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  phone         text,
  email         text,
  website       text,
  logo_url      text,
  contact_main  text,
  contact_alt   text,
  optional_1    text,
  optional_2    text,
  optional_3    text,
  optional_4    text,
  subscription  numeric not null default 150,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  funeral_home_id uuid not null references funeral_homes(id) on delete restrict,
  family_name     text not null,
  memorial        text not null,

  -- Money. Retail is what the family pays; commission is charged on retail.
  -- Wholesale is stored for reconciliation against the supplier invoice.
  retail          numeric not null check (retail >= 0),
  wholesale       numeric check (wholesale >= 0),

  status          text not null default 'started'
                  check (status in ('started','submitted','proof','approved','production','set')),

  -- Reconciliation trail. supplier_ack_at is the independent check that an
  -- order actually reached the monument company.
  submitted_at    timestamptz,
  supplier_ack_at timestamptz,
  supplier_ref    text,

  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists orders_home_started_idx on orders (funeral_home_id, started_at desc);
create index if not exists orders_status_idx       on orders (status);

-- Commission rate is a function of that home's own volume in the month.
-- 1-5 -> 15%, 6-19 -> 12%, 20+ -> 10%.
create or replace function commission_rate(order_count int)
returns numeric language sql immutable as $$
  select case when order_count >= 20 then 0.10
              when order_count >= 6  then 0.12
              else 0.15 end;
$$;

-- Monthly rollup. 'started' is deliberately excluded — a design that was never
-- submitted is not an order, and the gap between the two is the leak to watch.
create or replace view monthly_commission as
with counted as (
  select funeral_home_id,
         date_trunc('month', started_at) as month,
         count(*)                        as orders,
         sum(retail)                     as retail
  from orders
  where status in ('submitted','proof','approved','production','set')
  group by 1, 2
)
select c.month,
       f.name                                    as funeral_home,
       c.orders,
       commission_rate(c.orders::int)            as rate,
       c.retail,
       round(c.retail * commission_rate(c.orders::int), 2) as commission,
       f.subscription,
       round(c.retail * commission_rate(c.orders::int) + f.subscription, 2) as total_owed
from counted c
join funeral_homes f on f.id = c.funeral_home_id
order by c.month desc, f.name;

-- Designs started but never submitted, older than a week.
create or replace view stale_designs as
select o.id, f.name as funeral_home, o.family_name, o.started_at,
       (now()::date - o.started_at::date) as days_open
from orders o
join funeral_homes f on f.id = o.funeral_home_id
where o.status = 'started'
  and o.started_at < now() - interval '7 days'
order by o.started_at;

-- Row level security. Healing Partners sees everything; a funeral home user
-- sees only their own rows. Enable before any real data goes in.
alter table orders        enable row level security;
alter table funeral_homes enable row level security;
