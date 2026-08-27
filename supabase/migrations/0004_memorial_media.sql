-- 0004_memorial_media.sql
--
-- WHERE THE BYTES ACTUALLY LIVE
--
-- Not here. Supabase holds the *record* of a file; Cloudflare R2 holds the
-- file. A photograph of someone's mother is 4-20MB, a rendered proof PDF more,
-- and a funeral home will upload dozens per memorial. Putting those in Postgres
-- — or in Supabase Storage on the free tier's 1GB — runs out of room in a
-- fortnight and makes every backup enormous. R2 has no egress charge, which
-- matters because the same portrait gets re-fetched every time a family opens
-- the designer.
--
-- So a row here is a pointer: object_key is the path inside the R2 bucket, and
-- nothing in this database ever holds image bytes.
--
-- NOTHING IN R2 IS PUBLIC. The bucket stays private and every read is a
-- short-lived signed URL minted by the media-sign edge function, which checks
-- can_see_memorial() first. A family photograph must not be guessable by URL.

-- ============================================================
-- The table
-- ============================================================

create table if not exists memorial_media (
  id            uuid primary key default gen_random_uuid(),
  memorial_id   uuid not null references memorials(id) on delete cascade,
  design_id     uuid references designs(id) on delete set null,

  -- 'photo'    a family upload — the portrait, an old snapshot, a sketch
  -- 'proof'    a generated proof the family is asked to approve
  -- 'render'   a preview image produced by the designer
  -- 'document' cemetery rules, a permit, a signed authorisation
  kind          text not null default 'photo'
                check (kind in ('photo','proof','render','document')),

  object_key    text not null unique,   -- path inside the R2 bucket
  content_type  text not null,
  original_name text,                   -- what the family called it, for display only
  caption       text,

  -- declared_* is what the browser said before uploading. byte_size and
  -- sha256 are what we measured afterwards. They are kept apart on purpose:
  -- a presigned PUT cannot enforce a size limit, so the claim and the fact
  -- have to be separately recorded and then compared.
  declared_size bigint,
  byte_size     bigint,
  sha256        text,

  -- 'pending' means a URL was issued and nothing has been confirmed at the
  -- other end. Only 'stored' rows should ever be shown to anyone.
  status        text not null default 'pending'
                check (status in ('pending','stored','failed','deleted')),

  uploaded_by   uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  deleted_at    timestamptz
);

create index if not exists media_memorial_idx on memorial_media (memorial_id, kind);
create index if not exists media_design_idx   on memorial_media (design_id);

comment on column memorial_media.object_key is
  'Path inside the R2 bucket. Never a URL — the host and bucket are configuration, not data.';
comment on column memorial_media.sha256 is
  'Measured after upload. Partner User Agreement 3.4 requires a proof file hash on the approval record; this is where it comes from.';

-- Older installs that ran an earlier version of this file.
alter table memorial_media add column if not exists design_id uuid references designs(id) on delete set null;
alter table memorial_media add column if not exists sha256    text;
alter table memorial_media add column if not exists deleted_at timestamptz;

-- ============================================================
-- Policies — the same rule as designs, for the same reason
-- ============================================================
-- Whoever may see the memorial may see its media. Staff at another funeral
-- home may not, and no unauthenticated request reaches any of it.

alter table memorial_media enable row level security;

drop policy if exists med_read on memorial_media;
create policy med_read on memorial_media for select to authenticated
  using (can_see_memorial(memorial_id));

drop policy if exists med_insert on memorial_media;
create policy med_insert on memorial_media for insert to authenticated
  with check (can_see_memorial(memorial_id));

-- Anyone on the memorial may caption or confirm. Only the uploader or staff
-- may retire a file, so one relative cannot delete another's photographs.
drop policy if exists med_update on memorial_media;
create policy med_update on memorial_media for update to authenticated
  using (can_see_memorial(memorial_id) and (uploaded_by = auth.uid() or is_staff()))
  with check (can_see_memorial(memorial_id));

-- No delete policy at all, deliberately. Files are retired by setting
-- status = 'deleted', never removed. A proof the family approved is evidence
-- under Partner User Agreement 3.4 and must survive someone tidying up.

-- ============================================================
-- What the family sees
-- ============================================================
-- Confirmed files only. A 'pending' row is a URL that was issued and may never
-- have been used; showing it produces a broken image at the worst moment.

create or replace view memorial_photos
with (security_invoker = true) as
select id, memorial_id, design_id, object_key, content_type,
       original_name, caption, byte_size, created_at
from memorial_media
where kind = 'photo' and status = 'stored' and deleted_at is null
order by created_at;

-- ============================================================
-- Retention
-- ============================================================
-- Partner User Agreement 9.1: export during the term and for 30 days after,
-- deletion within 90 days of termination. This lists the object keys that are
-- due to leave R2, so the sweep has something authoritative to work from
-- rather than walking the bucket and guessing.

create or replace function media_due_for_deletion(grace_days int default 90)
returns table (id uuid, object_key text, reason text)
language sql stable security definer set search_path = public as $$
  select m.id, m.object_key,
         case when m.status = 'deleted' then 'retired by a user'
              else 'funeral home terminated' end
  from memorial_media m
  left join memorials mm on mm.id = m.memorial_id
  left join funeral_homes f on f.id = mm.funeral_home_id
  where is_founder()
    and (
      (m.status = 'deleted' and m.deleted_at < now() - make_interval(days => grace_days))
      or (m.status = 'pending' and m.created_at < now() - interval '1 day')
    );
$$;

comment on function media_due_for_deletion is
  'Founder only. Pending rows older than a day are abandoned uploads — a URL was issued and never used.';

-- ============================================================
-- Proof approvals point at an object, not at a URL
-- ============================================================
-- 0002 gave proof_approvals a proof_file_url. A signed R2 URL expires in
-- fifteen minutes, so storing one as evidence produces a dead link on the
-- day anybody needs to check what the family actually approved.
--
-- proof_media_id is the durable reference. The URL column stays for the
-- Exhibit C route, where the file may genuinely live somewhere else.

alter table public.proof_approvals
  add column if not exists proof_media_id uuid references memorial_media(id);

comment on column public.proof_approvals.proof_media_id is
  'The stored proof file. Preferred over proof_file_url, which cannot hold a signed URL: those expire.';

-- The guard in 0002 makes every evidential field immutable. The new column
-- has to join that list, or an approval could be re-pointed at a different
-- file after the fact — which is the whole thing the guard exists to stop.
create or replace function public.proof_approvals_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'proof approvals are permanent evidence and cannot be deleted (agreement s3.4)';
  end if;

  if new.id is distinct from old.id
     or new.design_id is distinct from old.design_id
     or new.memorial_id is distinct from old.memorial_id
     or new.order_id is distinct from old.order_id
     or new.method is distinct from old.method
     or new.approver_id is distinct from old.approver_id
     or new.approver_name is distinct from old.approver_name
     or new.approver_email is distinct from old.approver_email
     or new.approver_title is distinct from old.approver_title
     or new.approver_relationship is distinct from old.approver_relationship
     or new.proof_version is distinct from old.proof_version
     or new.proof_file_hash is distinct from old.proof_file_hash
     or new.proof_file_url is distinct from old.proof_file_url
     or new.proof_media_id is distinct from old.proof_media_id
     or new.attestation_confirmed is distinct from old.attestation_confirmed
     or new.checklist is distinct from old.checklist
     or new.ip_address is distinct from old.ip_address
     or new.user_agent is distinct from old.user_agent
     or new.approved_at is distinct from old.approved_at
     or new.created_at is distinct from old.created_at then
    raise exception 'proof approval fields are immutable; record a revocation instead';
  end if;

  if old.revoked_at is not null then
    raise exception 'proof approval % is already revoked', old.id;
  end if;

  return new;
end;
$$;

-- A proof file an approval points at cannot be retired, whatever the media
-- policies say. Belt and braces over the same rule.
--
-- UPDATE only, deliberately. Row level security already grants nobody a delete,
-- so a guard on DELETE would catch only one caller: the cascade from
-- memorials. Blocking that would make a memorial undeletable and put s9's
-- 90-day deletion obligation out of reach.
create or replace function public.memorial_media_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'deleted' and old.status <> 'deleted' and exists (
       select 1 from public.proof_approvals
       where proof_media_id = old.id and revoked_at is null) then
    raise exception 'that file is the proof an approval rests on (agreement s3.4)';
  end if;
  return new;
end; $$;

drop trigger if exists med_guard on memorial_media;
create trigger med_guard
  before update on memorial_media
  for each row execute function public.memorial_media_guard();
