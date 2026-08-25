-- Healing Partners — cemetery compliance & authorization
-- Run this EIGHTH, after access.sql, in the Supabase SQL editor. Safe to re-run.
--
-- Spec: remember-them/specs/cemetery-compliance.md
--
-- Two signed instruments gate the release of production files:
--   CCA    — the Partner's Authorized Approver attests to cemetery rules
--   PROOF  — the family's Authorizing Party attests to content and authority
--
-- Both are append-only. A signature is evidence; evidence that can be edited
-- is not evidence. There is no update or delete policy on the signature table
-- for anyone, including the founder.

-- ============================================================
-- Jurisdiction and units
-- ============================================================
-- ISO 3166-2 as data, never as branching logic: US-OR, CA-ON, CA-QC.
-- Every dimension is stored in whole millimetres and displayed in the unit the
-- cemetery's own rules used. Rounding on the way in is how a stone ends up a
-- quarter inch over.

alter table funeral_homes add column if not exists jurisdiction text;
alter table funeral_homes add column if not exists dealer_licence_no text;
alter table funeral_homes add column if not exists dealer_licence_expires date;
alter table funeral_homes add column if not exists locale text not null default 'en-US';

comment on column funeral_homes.dealer_licence_no is
  'Required where the jurisdiction licenses monument dealers (Ontario and others). '
  'A lapsed licence blocks signing.';

-- ============================================================
-- Authorized Approvers  (Partner side)
-- ============================================================
-- Designated in advance, per Sec. 3.3 — never "whoever was logged in".
-- Revocation is never retroactive, so rows are deactivated, never deleted:
-- a signature stands with the approver as they were at that moment.

create table if not exists authorized_approvers (
  id              uuid primary key default gen_random_uuid(),
  funeral_home_id uuid not null references funeral_homes(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  full_name       text not null,
  role_title      text,
  email           text,
  designated_by   uuid references auth.users(id),
  designated_at   timestamptz not null default now(),
  revoked_at      timestamptz,
  active          boolean generated always as (revoked_at is null) stored
);

create index if not exists aa_home_idx on authorized_approvers (funeral_home_id) where revoked_at is null;

create or replace function is_authorized_approver(home uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from authorized_approvers
                 where funeral_home_id = home
                   and user_id = auth.uid()
                   and revoked_at is null);
$$;

-- ============================================================
-- Cemetery record
-- ============================================================
-- Rules vary by SECTION far more often than operators expect, so the section
-- is part of the key, not a note on it.

create table if not exists cemetery_records (
  id              uuid primary key default gen_random_uuid(),
  memorial_id     uuid not null references memorials(id) on delete cascade,
  funeral_home_id uuid not null references funeral_homes(id) on delete restrict,

  cemetery_name   text not null,
  cemetery_address text,
  jurisdiction    text not null,              -- ISO 3166-2
  section         text,
  block           text,
  lot             text,
  space           text,

  -- How the Partner came by the rules. 'verbal' is allowed but recorded as
  -- such, because in a dispute the difference is the whole argument.
  rules_source    text check (rules_source in ('document','correspondence','verbal')),
  rules_obtained_on date,
  rules_document_url text,
  rules_document_sha256 text,
  rules_unit      text not null default 'in' check (rules_unit in ('in','mm')),

  permitted_categories text[] not null default '{}',   -- against the eight
  max_length_mm   int check (max_length_mm > 0),
  max_width_mm    int check (max_width_mm  > 0),
  max_height_mm   int check (max_height_mm > 0),

  material_restrictions text,
  colour_restrictions   text,
  permitted_features    text[] not null default '{}',

  foundation_requirement text,
  foundation_by   text check (foundation_by in ('cemetery','partner','fabricator')),
  permit_required boolean not null default false,
  permit_obtained_on date,
  pre_approval_required boolean not null default false,
  pre_approval_url text,
  setting_fee     numeric check (setting_fee >= 0),

  -- Ground frozen roughly November-April across Canada and the northern US.
  -- A family told "twelve weeks" in October is being misled.
  seasonal_window_note text,
  -- VA / Veterans Affairs Canada markers have fixed specs permitting no
  -- deviation, which removes most of the design space. Flag it early.
  government_marker_programme text,

  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (memorial_id)
);

-- ============================================================
-- Family authorization  (declared, never adjudicated)
-- ============================================================
-- The priority order for who may order a memorial differs across every state
-- and province, and changes. The platform encodes NONE of it. It records what
-- the signer declares. The categories below cover the field because the
-- statutes draw from the same small set even where they rank it differently.

create table if not exists family_authorizations (
  id              uuid primary key default gen_random_uuid(),
  memorial_id     uuid not null references memorials(id) on delete cascade,

  authority_basis text not null check (authority_basis in (
    'designated_agent',        -- decedent's written designation / will / POA
    'personal_representative', -- executor, administrator, estate trustee
    'spouse',                  -- incl. civil union, domestic, common-law
    'adult_child',
    'parent_or_guardian',
    'sibling',
    'next_of_kin',
    'court_order',
    'public_authority'
  )),
  basis_note      text,

  -- Concurrence is where disputes actually start. Many statutes require a
  -- majority of a class; many bar proceeding over a KNOWN objection whatever
  -- the majority says.
  same_class_total      int not null default 0 check (same_class_total >= 0),
  same_class_concurring int not null default 0 check (same_class_concurring >= 0),
  known_objection       boolean not null default false,

  -- Authority and payment are frequently different people, and that difference
  -- is a common source of dispute. Keep them apart.
  authorizing_party_name  text not null,
  authorizing_party_email text,
  responsible_party_name  text,
  responsible_party_email text,

  declared_by     uuid references auth.users(id),
  declared_at     timestamptz not null default now(),
  constraint concurring_within_class check (same_class_concurring <= same_class_total),
  unique (memorial_id)
);

-- ============================================================
-- Signatures — append only
-- ============================================================
-- rendered_pdf is the field that decides arguments: exactly what was on the
-- screen at signing, not a row saying a box was ticked.

create table if not exists compliance_signatures (
  id              uuid primary key default gen_random_uuid(),
  memorial_id     uuid not null references memorials(id) on delete restrict,
  design_id       uuid references designs(id) on delete restrict,
  funeral_home_id uuid not null references funeral_homes(id) on delete restrict,

  instrument      text not null check (instrument in ('cca','proof_approval')),

  signer_user_id  uuid references auth.users(id),
  typed_name      text not null,
  signer_role     text,
  auth_method     text,                          -- password, magic link, anon+token, provider

  signed_at_utc   timestamptz not null default now(),
  signed_at_local timestamptz,
  timezone        text,                          -- IANA
  ip_address      inet,
  user_agent      text,

  -- A signature is only evidence of what was on the screen at the time.
  template_id     text not null,
  template_version int not null,
  locale          text not null,

  proof_version   int,
  proof_sha256    text,
  cemetery_rules_sha256 text,
  rendered_pdf_url text,
  rendered_pdf_sha256 text,

  responses       jsonb not null default '{}'::jsonb,   -- per-item answers
  consented_electronic boolean not null default false,
  paper_copy_offered   boolean not null default false,
  copy_delivered_at    timestamptz
);

create index if not exists sig_memorial_idx on compliance_signatures (memorial_id, instrument);

-- ============================================================
-- The gate
-- ============================================================
-- Returns the reasons production files may NOT be released. Empty array means
-- released. This does not assert compliance — it declines to proceed while its
-- own record is incomplete or self-contradictory.

create or replace function release_blockers(m_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  b text[] := '{}';
  c cemetery_records%rowtype;
  fa family_authorizations%rowtype;
  d designs%rowtype;
  cat text;
begin
  select * into c  from cemetery_records      where memorial_id = m_id;
  select * into fa from family_authorizations where memorial_id = m_id;
  select * into d  from designs where memorial_id = m_id order by version desc limit 1;

  if d.id is null then
    return array['No design.'];
  end if;

  if c.id is null then
    b := b || 'Cemetery rules have not been recorded.';
  else
    if c.rules_obtained_on is null then
      b := b || 'No date recorded for when the cemetery rules were obtained.';
    end if;

    cat := d.spec->>'category';
    if cat is not null and array_length(c.permitted_categories, 1) is not null
       and not (cat = any (c.permitted_categories)) then
      b := b || format('This section does not permit a %s memorial.', cat);
    end if;

    -- Compared against the maximum the PARTNER entered. We are not checking
    -- the cemetery's rules; we are refusing to record an attestation that our
    -- own data contradicts.
    if c.max_length_mm is not null and (d.spec->>'length_mm')::int > c.max_length_mm then
      b := b || 'The design is longer than the maximum recorded for this section.';
    end if;
    if c.max_width_mm is not null and (d.spec->>'width_mm')::int > c.max_width_mm then
      b := b || 'The design is wider than the maximum recorded for this section.';
    end if;
    if c.max_height_mm is not null and (d.spec->>'height_mm')::int > c.max_height_mm then
      b := b || 'The design is taller than the maximum recorded for this section.';
    end if;

    if c.permit_required and c.permit_obtained_on is null then
      b := b || 'A cemetery permit is required and has not been recorded as obtained.';
    end if;
    if c.pre_approval_required and c.pre_approval_url is null then
      b := b || 'This cemetery requires pre-approval of the design.';
    end if;

    if not exists (select 1 from authorized_approvers
                   where funeral_home_id = c.funeral_home_id and revoked_at is null) then
      b := b || 'No Authorized Approver has been designated for this Partner.';
    end if;

    if exists (select 1 from funeral_homes f
               where f.id = c.funeral_home_id
                 and f.dealer_licence_expires is not null
                 and f.dealer_licence_expires < current_date) then
      b := b || 'The Partner''s dealer licence has expired.';
    end if;
  end if;

  if fa.id is null then
    b := b || 'No one has declared authority to order this memorial.';
  elsif fa.known_objection then
    -- Halts. Does not warn. A memorial ordered over a known objection is the
    -- most expensive mistake available in this industry.
    b := b || 'Someone with an equal or greater right to decide is known to object.';
  end if;

  if not exists (select 1 from compliance_signatures
                 where memorial_id = m_id and instrument = 'proof_approval') then
    b := b || 'The family has not approved the proof.';
  end if;
  if not exists (select 1 from compliance_signatures
                 where memorial_id = m_id and instrument = 'cca') then
    b := b || 'The Cemetery Compliance Acknowledgement has not been signed.';
  end if;

  return b;
end; $$;

-- ============================================================
-- Policies
-- ============================================================

alter table authorized_approvers   enable row level security;
alter table cemetery_records       enable row level security;
alter table family_authorizations  enable row level security;
alter table compliance_signatures  enable row level security;

-- Approvers: staff at that home read; owner and founder maintain.
drop policy if exists aa_read on authorized_approvers;
create policy aa_read on authorized_approvers for select to authenticated
  using (is_founder() or funeral_home_id = my_home());
drop policy if exists aa_owner on authorized_approvers;
create policy aa_owner on authorized_approvers for all to authenticated
  using  (is_founder() or (my_role() = 'owner' and funeral_home_id = my_home()))
  with check (is_founder() or (my_role() = 'owner' and funeral_home_id = my_home()));

-- Cemetery record: the Partner's to fill in. Families may read it — the
-- section and the rules affect what they are choosing between — but never edit.
drop policy if exists cr_read on cemetery_records;
create policy cr_read on cemetery_records for select to authenticated
  using (can_see_memorial(memorial_id));
drop policy if exists cr_write on cemetery_records;
create policy cr_write on cemetery_records for insert to authenticated
  with check (is_staff() and funeral_home_id = my_home() and created_by = auth.uid());
drop policy if exists cr_update on cemetery_records;
create policy cr_update on cemetery_records for update to authenticated
  using  (is_staff() and funeral_home_id = my_home())
  with check (is_staff() and funeral_home_id = my_home());

-- Family authorization: declared by whoever is signing, staff or family.
drop policy if exists fa_read on family_authorizations;
create policy fa_read on family_authorizations for select to authenticated
  using (can_see_memorial(memorial_id));
drop policy if exists fa_write on family_authorizations;
create policy fa_write on family_authorizations for insert to authenticated
  with check (can_see_memorial(memorial_id) and declared_by = auth.uid());
drop policy if exists fa_update on family_authorizations;
create policy fa_update on family_authorizations for update to authenticated
  using  (can_see_memorial(memorial_id))
  with check (can_see_memorial(memorial_id));

-- Signatures: readable by those who can see the memorial, insertable by the
-- signer themselves. NO update. NO delete. Not for owners, not for the founder.
drop policy if exists sig_read on compliance_signatures;
create policy sig_read on compliance_signatures for select to authenticated
  using (can_see_memorial(memorial_id) or is_founder());
drop policy if exists sig_insert on compliance_signatures;
create policy sig_insert on compliance_signatures for insert to authenticated
  with check (
    signer_user_id = auth.uid()
    and (
      (instrument = 'cca' and is_authorized_approver(funeral_home_id))
      or (instrument = 'proof_approval' and can_see_memorial(memorial_id))
    )
  );

-- Belt and braces: no grant can make these mutable.
revoke update, delete on compliance_signatures from anon, authenticated;
