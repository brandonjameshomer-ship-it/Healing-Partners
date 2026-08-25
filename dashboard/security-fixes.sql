-- Healing Partners — security fixes
-- Run AFTER access.sql. Safe to re-run.
--
-- Each block states the hole it closes. Nothing here changes what a legitimate
-- user can do; it removes paths that were never intended.

-- ============================================================
-- 1. Self-granted access to any memorial            (CRITICAL)
-- ============================================================
-- The old ma_insert policy read:
--     with check (user_id = auth.uid() or can_see_memorial(memorial_id))
-- The first clause let ANY signed-in user — including an anonymous QR session —
-- insert a row granting THEMSELVES access to any memorial_id, with no share
-- token at all. join_memorial() exists to gate exactly this, and the policy
-- walked around it. UUIDs are unguessable, so this required knowing an id; ids
-- leak through URLs, referrers, forwarded emails and support tickets, and the
-- payload is a family's stories.
--
-- Fix: relatives join through join_memorial(token), which is security definer
-- and validates the token. Staff may still add people directly.

drop policy if exists ma_insert on memorial_access;
create policy ma_insert on memorial_access for insert to authenticated
  with check (
    is_founder()
    or (my_role() in ('owner','counselor')
        and exists (select 1 from memorials m
                    where m.id = memorial_id and m.funeral_home_id = my_home()))
  );

-- ============================================================
-- 2. Share tokens never expired                     (MEDIUM)
-- ============================================================
-- A link printed on an arrangement-room handout stayed live forever. Give it a
-- default life and let join_memorial enforce it. Existing memorials get a
-- generous window rather than being cut off mid-arrangement.

alter table memorials add column if not exists share_token_expires_at timestamptz;
update memorials set share_token_expires_at = created_at + interval '180 days'
 where share_token_expires_at is null;
alter table memorials alter column share_token_expires_at
  set default (now() + interval '180 days');

create or replace function join_memorial(token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m_id uuid; exp timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Start a session before joining';
  end if;
  select id, share_token_expires_at into m_id, exp
    from memorials where share_token = token;
  if m_id is null then
    raise exception 'That link is not valid';
  end if;
  if exp is not null and exp < now() then
    -- Say it has expired rather than that it is invalid: the family did nothing
    -- wrong and the funeral home can issue a new one.
    raise exception 'That link has expired. Ask the funeral home for a new one.';
  end if;
  insert into memorial_access (memorial_id, user_id)
  values (m_id, auth.uid()) on conflict do nothing;
  return m_id;
end; $$;

-- rotate_share_token must reset the clock too.
create or replace function rotate_share_token(m_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not (is_founder() or (my_role() in ('owner','counselor')
          and exists (select 1 from memorials m
                      where m.id = m_id and m.funeral_home_id = my_home()))) then
    raise exception 'Not allowed';
  end if;
  t := encode(gen_random_bytes(12),'hex');
  update memorials
     set share_token = t,
         share_token_expires_at = now() + interval '180 days'
   where id = m_id;
  return t;
end; $$;

-- ============================================================
-- 3. A relative could move a memorial to another Partner  (MEDIUM)
-- ============================================================
-- mem_update allowed anyone who can see a memorial to update it, including
-- funeral_home_id and share_token. RLS cannot compare old and new across
-- columns, so this is a trigger.

create or replace function guard_memorial_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    if new.funeral_home_id is distinct from old.funeral_home_id then
      raise exception 'Only funeral home staff can move a memorial.';
    end if;
    if new.share_token is distinct from old.share_token
       or new.share_token_expires_at is distinct from old.share_token_expires_at then
      raise exception 'Share links are managed by the funeral home.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists memorials_guard on memorials;
create trigger memorials_guard before update on memorials
  for each row execute function guard_memorial_columns();

-- ============================================================
-- 4. Forgeable authorship on designs                (MEDIUM)
-- ============================================================
-- des_insert never required created_by to be the caller, so a design could be
-- attributed to someone else. That is cosmetic today and evidential the moment
-- proof approval signatures reference it.

drop policy if exists des_insert on designs;
create policy des_insert on designs for insert to authenticated
  with check (can_see_memorial(memorial_id) and created_by = auth.uid());

-- Same reasoning for who declared a story tag or a cemetery record.
create or replace function stamp_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  return new;
end; $$;

-- ============================================================
-- 5. Founder promotion by email string              (LOW, but sharp)
-- ============================================================
-- handle_new_user() promoted any sign-up whose email equalled the founder
-- address. That is only safe while email confirmation is enabled in Supabase
-- Auth and the address is already taken. Neither should be load-bearing.
--
-- New rule: the trigger NEVER mints a founder. Seed it once, by hand, below.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into user_profiles (id, email, full_name, role)
  values (new.id,
          coalesce(new.email, 'anon-' || left(new.id::text, 8)),
          new.raw_user_meta_data->>'full_name',
          'family')
  on conflict (id) do nothing;
  return new;
end; $$;

-- Seed the founder once. Run this AFTER signing in as bhomer@healingpartners.us
-- at least once, so the auth.users row exists.
--   update user_profiles set role = 'founder'
--    where email = 'bhomer@healingpartners.us';

-- ============================================================
-- 6. An owner could mint another owner              (LOW)
-- ============================================================
-- Stated intent is that tier 2 manages tier 3. Hold it to that.

drop policy if exists up_owner_add on user_profiles;
create policy up_owner_add on user_profiles for insert to authenticated
  with check (my_role() = 'owner' and funeral_home_id = my_home()
              and role = 'counselor');

drop policy if exists up_owner_edit on user_profiles;
create policy up_owner_edit on user_profiles for update to authenticated
  using  (my_role() = 'owner' and funeral_home_id = my_home() and role = 'counselor')
  with check (my_role() = 'owner' and funeral_home_id = my_home()
              and role = 'counselor');
