-- 0001_partner_retail_markup.sql
--
-- Partner User Agreement s6.8: the Partner sets its own retail price.
-- 2.5x wholesale is the Healing Partners *suggested* retail, so it belongs in a
-- column the Partner can change rather than baked in as a constant.

alter table public.funeral_homes
  add column if not exists retail_markup numeric not null default 2.5
    check (retail_markup >= 1.0 and retail_markup <= 10.0);

comment on column public.funeral_homes.retail_markup is
  'Partner-set multiplier applied to supplier wholesale to reach the family-facing price. Defaults to the Healing Partners suggested 2.5x; agreement s6.8 makes the customer price the Partner''s own decision.';

comment on column public.suppliers.markup is
  'Healing Partners suggested retail multiplier for this supplier. Fallback only - funeral_homes.retail_markup wins when the Partner has set its own.';

-- One place that resolves "which multiplier applies", so no caller has to
-- re-implement the precedence rule.
create or replace function public.markup_for(p_home uuid, p_supplier uuid default null)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select h.retail_markup from public.funeral_homes h where h.id = p_home and h.active),
    (select s.markup from public.suppliers s where s.id = p_supplier and s.active),
    2.5
  );
$$;

comment on function public.markup_for(uuid, uuid) is
  'Retail multiplier for a Partner: its own setting, else the supplier default, else 2.5. Does not cover line-item exceptions such as bench installation, which AFM sells at 1.0x.';

grant execute on function public.markup_for(uuid, uuid) to authenticated;
