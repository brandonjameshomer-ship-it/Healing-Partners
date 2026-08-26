-- 0002_proof_approvals.sql
--
-- Partner User Agreement s3.3: proof approval counts only when an Authorized
-- Approver uses the designated approval function and confirms the attestation,
-- or signs the Exhibit C form. An email, a text, a phone call, "looks good", or
-- silence explicitly does not count.
--
-- s3.4: the platform must record approver identity, timestamp, proof version
-- and file hash. That makes this table evidence, so it is append-only.

create table if not exists public.proof_approvals (
  id                    uuid primary key default gen_random_uuid(),
  design_id             uuid not null references public.designs(id),
  memorial_id           uuid not null references public.memorials(id),
  order_id              uuid references public.orders(id),

  -- s3.3 recognises exactly two routes to a valid approval.
  method                text not null default 'platform'
                          check (method in ('platform','exhibit_c')),

  -- s3.4 approver identity. approver_id is null for an Exhibit C signature from
  -- someone without a platform account; the typed name is always required.
  approver_id           uuid references auth.users(id),
  approver_name         text not null check (length(btrim(approver_name)) > 0),
  approver_email        text,
  approver_title        text,
  approver_relationship text,

  -- s3.4 proof identity. sha256 of the exact file the approver was shown.
  proof_version         integer not null check (proof_version > 0),
  proof_file_hash       text not null check (proof_file_hash ~ '^[0-9a-f]{64}$'),
  proof_file_url        text,

  -- The attestation is the approval. A row cannot exist without it, which is
  -- what keeps "looks good" out of the record.
  attestation_confirmed boolean not null default false check (attestation_confirmed),

  -- Exhibit C checklist: names, dates, inscription text and punctuation,
  -- dimensions, materials and finishes, placement of photographs and emblems,
  -- cemetery requirements, authority of the person ordering.
  checklist             jsonb not null default '{}'::jsonb,

  ip_address            inet,
  user_agent            text,
  approved_at           timestamptz not null default now(),

  -- An approval is never edited or deleted, only revoked.
  revoked_at            timestamptz,
  revoked_by            uuid references auth.users(id),
  revoked_reason        text,
  created_at            timestamptz not null default now(),

  constraint pa_revocation_complete check (
    (revoked_at is null and revoked_by is null and revoked_reason is null)
    or (revoked_at is not null and revoked_reason is not null)
  )
);

comment on table public.proof_approvals is
  'Formal record of proof approval under Partner User Agreement s3.3-s3.4. Append-only: rows may be revoked but never edited or deleted.';

-- One live approval per proof version. A revoked one does not block a re-approval.
create unique index if not exists pa_one_live_per_version
  on public.proof_approvals (design_id, proof_version)
  where revoked_at is null;

create index if not exists pa_by_design on public.proof_approvals (design_id);
create index if not exists pa_by_memorial on public.proof_approvals (memorial_id);
create index if not exists pa_by_order on public.proof_approvals (order_id);

-- Evidence guard. Enforced in the database rather than the app so that the
-- service role cannot quietly rewrite an approval either.
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

drop trigger if exists pa_guard on public.proof_approvals;
create trigger pa_guard
  before update or delete on public.proof_approvals
  for each row execute function public.proof_approvals_guard();

-- Revocation is the only sanctioned write after insert, and it is staff-only.
create or replace function public.revoke_proof_approval(p_id uuid, p_reason text)
returns public.proof_approvals
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.proof_approvals;
begin
  if coalesce(length(btrim(p_reason)), 0) = 0 then
    raise exception 'a revocation reason is required';
  end if;

  select * into v_row from public.proof_approvals where id = p_id;
  if not found then
    raise exception 'proof approval % not found', p_id;
  end if;
  if not (is_founder() or (is_staff() and can_see_memorial(v_row.memorial_id))) then
    raise exception 'only Partner staff may revoke a proof approval';
  end if;

  update public.proof_approvals
     set revoked_at = now(), revoked_by = auth.uid(), revoked_reason = p_reason
   where id = p_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.revoke_proof_approval(uuid, text) to authenticated;

-- s3.3 in force: an order cannot move into or past approval without a live
-- approval on its design.
create or replace function public.orders_require_proof_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('approved','production','set')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then

    if new.design_id is null then
      raise exception 'order % cannot reach status % without a design', new.id, new.status;
    end if;

    if not exists (
      select 1 from public.proof_approvals pa
       where pa.design_id = new.design_id and pa.revoked_at is null
    ) then
      raise exception
        'order % cannot reach status % without a recorded proof approval (agreement s3.3)',
        new.id, new.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ord_proof_gate on public.orders;
create trigger ord_proof_gate
  before insert or update on public.orders
  for each row execute function public.orders_require_proof_approval();

-- Row level security, following the existing can_see_memorial() convention.
alter table public.proof_approvals enable row level security;

drop policy if exists pa_read on public.proof_approvals;
create policy pa_read on public.proof_approvals
  for select to authenticated
  using (can_see_memorial(memorial_id));

drop policy if exists pa_insert on public.proof_approvals;
create policy pa_insert on public.proof_approvals
  for insert to authenticated
  with check (
    can_see_memorial(memorial_id)
    and revoked_at is null
    and (
      (method = 'platform' and approver_id = auth.uid())
      -- An Exhibit C form is transcribed into the platform by Partner staff.
      or (method = 'exhibit_c' and is_staff())
    )
  );

-- Deliberately no update or delete policy: revocation goes through
-- revoke_proof_approval(), everything else is denied by default.
