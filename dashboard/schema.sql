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
  -- Who pays for a 3D/VR upgrade at this home: they bill it, or the family pays
  -- Healing Partners direct.
  vr_billing    text not null default 'home' check (vr_billing in ('home','family')),
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

-- Commission rate is a function of that home's own volume in the calendar month.
-- Exhibit B of the Partner User Agreement: 1-5 -> 15%, 6-20 -> 12%, 21+ -> 10%.
-- These bands do not overlap. The earlier 6-19 / 20+ reading charged a home with
-- exactly 20 memorials 10% when it owes 12%.
--
-- This is the Standard Schedule only. Exhibit B has a second, lower schedule for
-- Partners carrying qualifying insurance (Sec. 7); pricing.sql replaces this
-- function with the two-argument version that knows about it. Run pricing.sql.
create or replace function commission_rate(order_count int)
returns numeric language sql immutable as $$
  select case when order_count >= 21 then 0.10
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

-- Suppliers. Remember Them works with several monument companies, not one, and
-- each has its own price sheet, markup, finish codes, alphabets and lead times.
-- The design is captured in neutral terms and translated per supplier.
create table if not exists suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  address        text,
  phone          text,
  fax            text,
  email          text,
  website        text,
  logo_url       text,
  contact_main   text,
  contact_alt    text,

  markup         numeric not null default 2.5,   -- wholesale -> retail
  -- Their own vocabulary, so the order form speaks their language.
  finish_codes   jsonb,   -- {"P2":"polish front and back", ...}
  granite_cats   jsonb,   -- {"Cat 1":["Georgia Gray", ...], ...}
  alphabets      jsonb,   -- their typeface catalogue names
  borders        jsonb,   -- their border catalogue names
  min_stroke_in  numeric, -- thinnest line they will cut
  cut_depth_in   jsonb,   -- {"min":0.0625,"max":0.1875}
  lead_time_note text,
  proofs_included boolean not null default false,  -- AFM: true. Others: ask.

  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table orders add column if not exists supplier_id uuid references suppliers(id);

-- Row level security. Nothing is readable until a policy allows it, which is
-- why an empty table right after setup is correct rather than broken.
alter table orders        enable row level security;
alter table funeral_homes enable row level security;
alter table suppliers     enable row level security;

-- Start simple: any signed-in user can read and write. Tighten to per-home
-- access once funeral home staff have their own logins.
create policy "signed in can read orders"    on orders
  for select to authenticated using (true);
create policy "signed in can write orders"   on orders
  for insert to authenticated with check (true);
create policy "signed in can update orders"  on orders
  for update to authenticated using (true);

create policy "signed in can read homes"     on funeral_homes
  for select to authenticated using (true);
create policy "signed in can write homes"    on funeral_homes
  for all to authenticated using (true) with check (true);

create policy "signed in can read suppliers" on suppliers
  for select to authenticated using (true);
create policy "signed in can write suppliers" on suppliers
  for all to authenticated using (true) with check (true);

-- Seed the supplier you already have.
insert into suppliers (name, address, phone, fax, email, contact_main, markup, proofs_included,
                       finish_codes, lead_time_note)
values ('Affordable Family Memorials',
        '6615 SE Harold St, Portland, OR 97206',
        '503-515-7640', '503-772-3691', 'afmemorials@comcast.net',
        'Angie & Jason Pope', 2.5, true,
        '{"P2":"polish front and back of tablet","P3":"back, front and top","P5":"all polish"}'::jsonb,
        'Standard granite 3-4 months. India/China 7-10 months. Bronze ~10 weeks, in parallel.')
on conflict do nothing;
