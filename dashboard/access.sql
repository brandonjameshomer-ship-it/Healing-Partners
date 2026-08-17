-- Healing Partners — access control
-- Run this AFTER schema.sql, in the Supabase SQL editor.
--
-- Four tiers:
--   1  founder    Brandon Homer, bhomer@healingpartners.us — everything
--   2  owner      Funeral home owner / authorised rep — their whole location
--   3  counselor  FSC / salesperson — only the orders they created
--   4  family     Family member — only their own person's designs
--
-- Enforced in the database, not the page. A user who bypasses the interface
-- entirely still cannot read a row they have no policy for.

-- ============================================================
-- Who is who
-- ============================================================

create table if not exists user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  role            text not null default 'family'
                  check (role in ('founder','owner','counselor','family')),
  funeral_home_id uuid references funeral_homes(id) on delete set null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on column user_profiles.funeral_home_id is
  'Required for owner and counselor. Null for founder and family.';

-- New sign-ups become 'family' with no funeral home. Staff are promoted
-- deliberately — nobody grants themselves access by registering.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into user_profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name',
          case when lower(new.email) = 'bhomer@healingpartners.us'
               then 'founder' else 'family' end)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- ============================================================
-- Helpers. STABLE + security definer so policies stay cheap and
-- don't recurse back through RLS.
-- ============================================================

create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from user_profiles
                   where id = auth.uid() and active), 'none');
$$;

create or replace function my_home() returns uuid
language sql stable security definer set search_path = public as $$
  select funeral_home_id from user_profiles where id = auth.uid() and active;
$$;

create or replace function is_founder() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() = 'founder';
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('founder','owner','counselor');
$$;

-- ============================================================
-- Memorials and designs — what a family actually touches
-- ============================================================

create table if not exists memorials (
  id              uuid primary key default gen_random_uuid(),
  funeral_home_id uuid references funeral_homes(id) on delete set null,
  full_name       text not null,          -- exactly as it will be engraved
  born            text,
  died            text,
  share_token     text unique default encode(gen_random_bytes(12),'hex'),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

comment on column memorials.share_token is
  'Given to relatives so they can join without being invited by email.';

-- Several relatives may work on the same memorial.
create table if not exists memorial_access (
  memorial_id uuid not null references memorials(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  primary key (memorial_id, user_id)
);

create table if not exists designs (
  id          uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references memorials(id) on delete cascade,
  version     int  not null default 1,
  label       text,
  spec        jsonb not null default '{}'::jsonb,   -- supplier-neutral
  retail      numeric check (retail >= 0),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists designs_memorial_idx on designs (memorial_id, version);

alter table orders add column if not exists memorial_id uuid references memorials(id);
alter table orders add column if not exists design_id   uuid references designs(id);
alter table orders add column if not exists created_by  uuid references auth.users(id);

-- Can the current user see this memorial?
create or replace function can_see_memorial(m_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    is_founder()
    or (my_role() = 'owner'
        and exists (select 1 from memorials m
                    where m.id = m_id and m.funeral_home_id = my_home()))
    or (my_role() = 'counselor'
        and exists (select 1 from memorials m
                    where m.id = m_id and m.funeral_home_id = my_home()))
    or exists (select 1 from memorial_access a
               where a.memorial_id = m_id and a.user_id = auth.uid());
$$;

-- ============================================================
-- Policies
-- ============================================================

alter table user_profiles   enable row level security;
alter table funeral_homes   enable row level security;
alter table suppliers       enable row level security;
alter table orders          enable row level security;
alter table memorials       enable row level security;
alter table memorial_access enable row level security;
alter table designs         enable row level security;

-- Replace the permissive starter policies from schema.sql
drop policy if exists "signed in can read orders"     on orders;
drop policy if exists "signed in can write orders"    on orders;
drop policy if exists "signed in can update orders"   on orders;
drop policy if exists "signed in can read homes"      on funeral_homes;
drop policy if exists "signed in can write homes"     on funeral_homes;
drop policy if exists "signed in can read suppliers"  on suppliers;
drop policy if exists "signed in can write suppliers" on suppliers;

-- ---- user_profiles ----
create policy up_self   on user_profiles for select to authenticated
  using (id = auth.uid());
create policy up_owner  on user_profiles for select to authenticated
  using (my_role() = 'owner' and funeral_home_id = my_home());
create policy up_founder on user_profiles for all to authenticated
  using (is_founder()) with check (is_founder());
-- An owner adds and removes their own staff, but cannot mint a founder.
create policy up_owner_manage on user_profiles for all to authenticated
  using  (my_role() = 'owner' and funeral_home_id = my_home() and role <> 'founder')
  with check (my_role() = 'owner' and funeral_home_id = my_home()
              and role in ('owner','counselor'));

-- ---- funeral_homes ----
create policy fh_founder on funeral_homes for all to authenticated
  using (is_founder()) with check (is_founder());
create policy fh_staff   on funeral_homes for select to authenticated
  using (id = my_home());
create policy fh_owner_edit on funeral_homes for update to authenticated
  using (my_role() = 'owner' and id = my_home())
  with check (my_role() = 'owner' and id = my_home());

-- ---- suppliers ---- staff read, founder maintains
create policy sup_read    on suppliers for select to authenticated using (is_staff());
create policy sup_founder on suppliers for all    to authenticated
  using (is_founder()) with check (is_founder());

-- ---- memorials ----
create policy mem_read on memorials for select to authenticated
  using (can_see_memorial(id));
create policy mem_insert on memorials for insert to authenticated
  with check (
    is_founder()
    or (is_staff() and funeral_home_id = my_home())
    or (my_role() = 'family' and created_by = auth.uid())
  );
create policy mem_update on memorials for update to authenticated
  using (can_see_memorial(id)) with check (can_see_memorial(id));

-- ---- memorial_access ---- how a relative joins
create policy ma_read on memorial_access for select to authenticated
  using (user_id = auth.uid() or can_see_memorial(memorial_id));
create policy ma_insert on memorial_access for insert to authenticated
  with check (user_id = auth.uid() or can_see_memorial(memorial_id));
create policy ma_delete on memorial_access for delete to authenticated
  using (user_id = auth.uid() or is_founder()
         or (my_role() = 'owner' and can_see_memorial(memorial_id)));

-- Join with a share token, without needing an invitation.
create or replace function join_memorial(token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m_id uuid;
begin
  select id into m_id from memorials where share_token = token;
  if m_id is null then raise exception 'No memorial for that link'; end if;
  insert into memorial_access (memorial_id, user_id)
  values (m_id, auth.uid()) on conflict do nothing;
  return m_id;
end; $$;

-- ---- designs ---- families create and compare versions
create policy des_read   on designs for select to authenticated
  using (can_see_memorial(memorial_id));
create policy des_insert on designs for insert to authenticated
  with check (can_see_memorial(memorial_id));
create policy des_update on designs for update to authenticated
  using (can_see_memorial(memorial_id) and (created_by = auth.uid() or is_staff()))
  with check (can_see_memorial(memorial_id));

-- ---- orders ----
-- Tier 4 gets NO access. A family sees designs and the retail price on them,
-- never the order row, and never anything commission-related.
create policy ord_founder on orders for all to authenticated
  using (is_founder()) with check (is_founder());
create policy ord_owner   on orders for all to authenticated
  using  (my_role() = 'owner' and funeral_home_id = my_home())
  with check (my_role() = 'owner' and funeral_home_id = my_home());
-- A counselor sees only what they created.
create policy ord_counselor_read on orders for select to authenticated
  using (my_role() = 'counselor' and funeral_home_id = my_home()
         and created_by = auth.uid());
create policy ord_counselor_write on orders for insert to authenticated
  with check (my_role() = 'counselor' and funeral_home_id = my_home()
              and created_by = auth.uid());
create policy ord_counselor_update on orders for update to authenticated
  using  (my_role() = 'counselor' and funeral_home_id = my_home()
          and created_by = auth.uid())
  with check (my_role() = 'counselor' and funeral_home_id = my_home());

-- ============================================================
-- Commission — founder and owner only
-- ============================================================
-- Commission is never stored on a row; it is computed here. Counselors and
-- families therefore cannot reach it even by querying the orders table.

drop view if exists monthly_commission;
create view monthly_commission
with (security_invoker = true) as
with counted as (
  select funeral_home_id,
         date_trunc('month', started_at) as month,
         count(*) as orders,
         sum(retail) as retail
  from orders
  where status in ('submitted','proof','approved','production','set')
  group by 1,2
)
select c.month, f.name as funeral_home, c.orders,
       commission_rate(c.orders::int) as rate,
       c.retail,
       round(c.retail * commission_rate(c.orders::int), 2) as commission,
       f.subscription,
       round(c.retail * commission_rate(c.orders::int) + f.subscription, 2) as total_owed
from counted c
join funeral_homes f on f.id = c.funeral_home_id
where is_founder() or (my_role() = 'owner' and f.id = my_home())
order by c.month desc, f.name;

-- ============================================================
-- Who sees what
-- ============================================================
--                     founder   owner        counselor      family
--  all funeral homes    yes      own only     own only        no
--  all orders           yes      own home     own orders      no
--  commission           yes      own home     NO              NO
--  suppliers            edit     read         read            no
--  memorials            yes      own home     own home        own only
--  designs              yes      own home     own home        own only
--  manage staff         yes      own home     no              no
