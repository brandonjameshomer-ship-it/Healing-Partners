-- 0005 — close the findings from the September 2026 security review.
--
-- Run after every dashboard/*.sql file, security-fixes.sql included. Every
-- statement is idempotent; columns that a later migration adds are handled by
-- name at run time, so this file does not care whether 0003 is applied yet.

-- ============================================================
-- 1. Reporting views were readable by anon and ran as their owner
-- ============================================================
-- monthly_commission (pricing.sql), insurance_saving, partners_incomplete_terms
-- and stale_designs (schema.sql) had no security_invoker and no filter, so
-- `GET /rest/v1/monthly_commission` with the public anon key returned every
-- Partner's name, plan, insurance flag and what they owe. Switching each view
-- to security_invoker makes it obey the RLS on the tables beneath it: the
-- founder sees everything, an owner sees their own home, anon sees nothing.
-- The definitions are left alone so later migrations that replace them still apply.
do $$
declare v text;
begin
  foreach v in array array['monthly_commission','insurance_saving',
                           'partners_incomplete_terms','stale_designs'] loop
    if exists (select 1 from pg_views where schemaname = 'public' and viewname = v) then
      execute format('alter view public.%I set (security_invoker = on)', v);
      execute format('revoke all on public.%I from anon, public', v);
    end if;
  end loop;
end $$;

-- ============================================================
-- 2. Money columns a browser could write
-- ============================================================
-- des_update let a family set vr_status = 'paid' with their own vr_paid_at,
-- vr_payment_ref and vr_price; fh_owner_edit let an owner set insured = true
-- (cutting their own commission rate) or rewrite their subscription and terms;
-- ord_owner let an owner set commission_remitted_at so the month closed without
-- them. RLS cannot compare old and new, so this is a trigger. It compares the
-- rows as jsonb, which means a column that does not exist yet is simply absent
-- rather than an error.
--
-- Who may change these: the Stripe webhook (service role) and the founder.
-- Staff may additionally mark a VR model as included on their invoice or
-- completed; a family may move vr_status between none, selected and pending
-- (that is the "sent to Stripe" state the browser sets) but never into or out
-- of a paid state.

create or replace function guard_money_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  jwt_role  text  := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  o         jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  n         jsonb := to_jsonb(new);
  frozen    text[] := '{}';
  col       text;
begin
  if jwt_role = 'service_role' or is_founder() then
    return new;
  end if;

  if tg_table_name = 'designs' then
    frozen := array['vr_paid_at','vr_payment_ref','vr_price'];
    if (n ->> 'vr_status') in ('paid','refunded')
       or ((o ->> 'vr_status') in ('paid','refunded')
           and (n ->> 'vr_status') is distinct from (o ->> 'vr_status')) then
      raise exception 'Only a verified payment can mark a design paid or refunded.';
    end if;
    if not is_staff() and (n ->> 'vr_status') in ('included','completed') then
      raise exception 'Only the funeral home can include or complete a VR model.';
    end if;
    -- designs.retail is left alone: it is the price shown to the family, and
    -- commission is charged on orders.retail, which only staff can write.
    if not is_staff() then
      frozen := frozen || array['vr_completed_at'];
    end if;

  elsif tg_table_name = 'funeral_homes' then
    frozen := array['subscription','plan','active','insured','insurance_expires_at',
                    'insurance_broker','insurance_expires_on','insurance_per_claim',
                    'insurance_aggregate','insurance_verified_at','insurance_verified_by',
                    'commission_schedule','markup','retail_markup','users_included',
                    'turnaround_days','revisions_included','revision_fee',
                    'deliverable_formats','dealer_licence_no','dealer_licence_expires'];

  elsif tg_table_name = 'orders' then
    frozen := array['memorial_sale_price','commission_rate','commission_amount',
                    'commission_period','commission_remitted_at'];
  end if;

  foreach col in array frozen loop
    if tg_op = 'INSERT' then
      if n ? col and jsonb_typeof(n -> col) <> 'null' then
        raise exception 'Column % is set by Healing Partners, not by the browser.', col;
      end if;
    elsif (n -> col) is distinct from (o -> col) then
      raise exception 'Column % is set by Healing Partners, not by the browser.', col;
    end if;
  end loop;

  return new;
end; $$;

drop trigger if exists designs_money_guard on designs;
create trigger designs_money_guard before insert or update on designs
  for each row execute function guard_money_columns();

drop trigger if exists funeral_homes_money_guard on funeral_homes;
create trigger funeral_homes_money_guard before insert or update on funeral_homes
  for each row execute function guard_money_columns();

drop trigger if exists orders_money_guard on orders;
create trigger orders_money_guard before insert or update on orders
  for each row execute function guard_money_columns();

-- ============================================================
-- 3. release_blockers() was callable by anon
-- ============================================================
-- Security definer with no revoke, so anyone with the anon key and a memorial
-- UUID could read its compliance state. Staff and families still need it.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'public' and p.proname = 'release_blockers') then
    revoke all on function public.release_blockers(uuid) from public, anon;
    grant execute on function public.release_blockers(uuid) to authenticated;
  end if;
end $$;

-- ============================================================
-- 4. The Sec. 5.2 discount recapture had nowhere to land
-- ============================================================
-- It is a one-off Stripe payment with no memorial, and the webhook was booking
-- it as a VR sale. Give it its own event type so it is never a VR number.
alter table payment_events drop constraint if exists payment_events_event_type_check;
alter table payment_events add constraint payment_events_event_type_check
  check (event_type in ('vr_selected','checkout_created','payment_succeeded',
                        'payment_failed','payment_cancelled','refunded',
                        'vr_completed','recapture','note'));

-- ============================================================
-- 5. A budget for the model-backed functions
-- ============================================================
-- interview and classify-story accepted any bearer token, including the public
-- anon key, and called the model with no limit. They now require a signed-in
-- user (anonymous sessions count — a family on a share link is one) and ask
-- this function for permission first. Nobody reads the table directly.

create table if not exists model_calls (
  id        bigserial primary key,
  user_id   uuid        not null,
  kind      text        not null,
  called_at timestamptz not null default now()
);
create index if not exists model_calls_idx on model_calls (user_id, kind, called_at desc);
alter table model_calls enable row level security;   -- and no policies: RPC only

create or replace function allow_model_call(p_kind text, p_per_hour int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then return false; end if;
  delete from model_calls where user_id = uid and called_at < now() - interval '1 day';
  select count(*) into n from model_calls
   where user_id = uid and kind = p_kind and called_at > now() - interval '1 hour';
  if n >= p_per_hour then return false; end if;
  insert into model_calls (user_id, kind) values (uid, p_kind);
  return true;
end; $$;

revoke all on function allow_model_call(text, int) from public, anon;
grant execute on function allow_model_call(text, int) to authenticated;
