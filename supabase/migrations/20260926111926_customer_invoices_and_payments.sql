-- Customer CRM and itemized invoices. Invoice payments create immutable income rows
-- so the customer balance and existing income reports stay in sync.

create table public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  description text not null default '',
  total_amount numeric(12,2) not null check (total_amount > 0),
  is_voided boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_invoices_customer_date_idx on public.customer_invoices (customer_id, created_at desc) where not is_voided;
create index customer_invoices_staff_date_idx on public.customer_invoices (staff_id, created_at desc) where not is_voided;

create table public.customer_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.customer_invoices(id) on delete restrict,
  service_id uuid references public.services(id) on delete set null,
  service_name_snapshot text not null check (length(btrim(service_name_snapshot)) between 1 and 120),
  quantity integer not null check (quantity between 1 and 1000),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0 and line_total = round(unit_price * quantity, 2)),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index customer_invoice_items_invoice_idx on public.customer_invoice_items (invoice_id, display_order);

create table public.customer_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.customer_invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  paid_at timestamptz not null default now(),
  income_transaction_id uuid not null unique references public.income_transactions(id) on delete restrict,
  is_voided boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_invoice_payments_invoice_idx on public.customer_invoice_payments (invoice_id, paid_at desc) where not is_voided;

alter table public.customer_invoices enable row level security;
alter table public.customer_invoice_items enable row level security;
alter table public.customer_invoice_payments enable row level security;

create policy "admins manage customer invoices" on public.customer_invoices
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins read customer invoice items" on public.customer_invoice_items
  for select to authenticated using (private.is_admin());
create policy "admins create customer invoice items" on public.customer_invoice_items
  for insert to authenticated with check (private.is_admin());
create policy "admins manage customer invoice payments" on public.customer_invoice_payments
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

grant select, insert, update on public.customer_invoices to authenticated;
grant select, insert on public.customer_invoice_items to authenticated;
grant select, insert, update on public.customer_invoice_payments to authenticated;
grant usage, select on sequence public.customer_invoices_invoice_number_seq to authenticated;

create or replace function public.create_customer_invoice(
  p_customer_id uuid,
  p_description text,
  p_staff_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_name text;
  v_service_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
  v_order integer := 0;
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id) then raise exception 'customer_not_found'; end if;
  if p_staff_id is not null and not exists (select 1 from public.staff s where s.id = p_staff_id) then raise exception 'staff_not_found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 40 then
    raise exception 'invoice_items_required';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := btrim(coalesce(v_item->>'service_name_snapshot', ''));
    v_service_id := nullif(v_item->>'service_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);
    if length(v_name) not between 1 and 120 or v_quantity not between 1 and 1000 or v_unit_price < 0 then
      raise exception 'invalid_invoice_item';
    end if;
    if v_service_id is not null and not exists (select 1 from public.services s where s.id = v_service_id) then
      raise exception 'service_not_found';
    end if;
    v_total := v_total + round(v_unit_price * v_quantity, 2);
  end loop;
  if v_total <= 0 then raise exception 'invoice_total_must_be_positive'; end if;

  insert into public.customer_invoices(customer_id, staff_id, description, total_amount)
  values (p_customer_id, p_staff_id, left(btrim(coalesce(p_description, '')), 240), v_total)
  returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_order := v_order + 1;
    v_name := btrim(v_item->>'service_name_snapshot');
    v_service_id := nullif(v_item->>'service_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric(12,2);
    v_line_total := round(v_unit_price * v_quantity, 2);
    insert into public.customer_invoice_items(invoice_id, service_id, service_name_snapshot, quantity, unit_price, line_total, display_order)
    values (v_invoice_id, v_service_id, v_name, v_quantity, v_unit_price, v_line_total, v_order);
  end loop;
  return v_invoice_id;
end;
$$;
revoke all on function public.create_customer_invoice(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.create_customer_invoice(uuid, text, uuid, jsonb) to authenticated;
revoke insert on public.customer_invoices, public.customer_invoice_items from authenticated;
grant select, update on public.customer_invoices to authenticated;
grant select on public.customer_invoice_items to authenticated;

create or replace function private.guard_customer_invoice_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.invoice_number is distinct from old.invoice_number
     or new.customer_id is distinct from old.customer_id
     or new.staff_id is distinct from old.staff_id
     or new.description is distinct from old.description
     or new.total_amount is distinct from old.total_amount
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'invoice_details_are_immutable';
  end if;
  if new.is_voided is distinct from old.is_voided then
    if new.is_voided and exists (
      select 1 from public.customer_invoice_payments p where p.invoice_id = old.id and not p.is_voided
    ) then raise exception 'void_invoice_payments_first'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_customer_invoice_update() from public, anon, authenticated;
create trigger customer_invoice_guard_update before update on public.customer_invoices
for each row execute function private.guard_customer_invoice_update();

create or replace function private.apply_customer_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.customer_invoices%rowtype;
  v_paid numeric(12,2);
  v_due numeric(12,2);
  v_income_id uuid;
  v_item record;
  v_positive_items integer;
  v_index integer := 0;
  v_allocated numeric(12,2);
  v_remaining numeric(12,2);
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  select * into v_invoice from public.customer_invoices i where i.id = new.invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.is_voided then raise exception 'invoice_is_voided'; end if;
  if not exists (select 1 from public.payment_methods m where m.id = new.payment_method_id and m.is_active) then
    raise exception 'active_payment_method_required';
  end if;
  select coalesce(sum(p.amount), 0) into v_paid
  from public.customer_invoice_payments p where p.invoice_id = new.invoice_id and not p.is_voided;
  v_due := v_invoice.total_amount - v_paid;
  if new.amount <= 0 or new.amount > v_due then raise exception 'payment_exceeds_invoice_balance'; end if;

  insert into public.income_transactions(customer_id, staff_id, payment_method_id, source, occurred_at,
    expected_amount, collected_amount, description)
  values (v_invoice.customer_id, v_invoice.staff_id, new.payment_method_id, 'manual_service', new.paid_at,
    new.amount, new.amount, format('Adisyon #%s%s', v_invoice.invoice_number,
      case when v_invoice.description = '' then '' else ' · ' || v_invoice.description end))
  returning id into v_income_id;
  new.income_transaction_id := v_income_id;
  new.created_by := coalesce(new.created_by, auth.uid());

  select count(*) into v_positive_items from public.customer_invoice_items i
  where i.invoice_id = new.invoice_id and i.line_total > 0;
  v_remaining := new.amount;
  for v_item in
    select i.service_id, i.service_name_snapshot, i.line_total, i.quantity
    from public.customer_invoice_items i
    where i.invoice_id = new.invoice_id and i.line_total > 0
    order by i.display_order, i.id
  loop
    v_index := v_index + 1;
    if v_index = v_positive_items then
      v_allocated := v_remaining;
    else
      v_allocated := round(new.amount * v_item.line_total / v_invoice.total_amount, 2);
      v_allocated := least(v_allocated, v_remaining);
    end if;
    v_remaining := v_remaining - v_allocated;
    insert into public.income_transaction_services(income_transaction_id, service_id, service_name_snapshot, quantity, amount)
    values (v_income_id, v_item.service_id, v_item.service_name_snapshot, v_item.quantity, v_allocated);
  end loop;
  return new;
end;
$$;
revoke all on function private.apply_customer_invoice_payment() from public, anon, authenticated;
create trigger customer_invoice_payment_apply before insert on public.customer_invoice_payments
for each row execute function private.apply_customer_invoice_payment();

create or replace function private.guard_customer_invoice_payment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.customer_invoices%rowtype;
  v_paid numeric(12,2);
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  if new.id is distinct from old.id
     or new.invoice_id is distinct from old.invoice_id
     or new.amount is distinct from old.amount
     or new.payment_method_id is distinct from old.payment_method_id
     or new.paid_at is distinct from old.paid_at
     or new.income_transaction_id is distinct from old.income_transaction_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'invoice_payments_are_immutable';
  end if;
  if new.is_voided is distinct from old.is_voided then
    select * into v_invoice from public.customer_invoices i where i.id = old.invoice_id for update;
    if not found then raise exception 'invoice_not_found'; end if;
    if not new.is_voided then
      if v_invoice.is_voided then raise exception 'invoice_is_voided'; end if;
      select coalesce(sum(p.amount), 0) into v_paid from public.customer_invoice_payments p
      where p.invoice_id = old.invoice_id and not p.is_voided and p.id <> old.id;
      if v_paid + old.amount > v_invoice.total_amount then raise exception 'payment_exceeds_invoice_balance'; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_customer_invoice_payment_update() from public, anon, authenticated;
create trigger customer_invoice_payment_guard_update before update on public.customer_invoice_payments
for each row execute function private.guard_customer_invoice_payment_update();

create or replace function private.sync_customer_invoice_payment_income()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_voided is distinct from old.is_voided then
    perform set_config('app.customer_invoice_payment_sync', 'on', true);
    update public.income_transactions set is_voided = new.is_voided, updated_at = now()
    where id = new.income_transaction_id;
    perform set_config('app.customer_invoice_payment_sync', 'off', true);
  end if;
  return new;
end;
$$;
revoke all on function private.sync_customer_invoice_payment_income() from public, anon, authenticated;
create trigger customer_invoice_payment_sync_income after update of is_voided on public.customer_invoice_payments
for each row execute function private.sync_customer_invoice_payment_income();

create or replace function private.guard_customer_invoice_income()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.customer_invoice_payments p where p.income_transaction_id = old.id)
     and current_setting('app.customer_invoice_payment_sync', true) is distinct from 'on' then
    raise exception 'invoice_payment_controls_income';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_customer_invoice_income() from public, anon, authenticated;
create trigger customer_invoice_income_guard before update or delete on public.income_transactions
for each row execute function private.guard_customer_invoice_income();

create or replace function public.customer_financial_summary()
returns table (
  customer_id uuid,
  total_earned numeric,
  outstanding_balance numeric,
  invoice_balance numeric,
  appointment_balance numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  return query
  select c.id,
    coalesce(inc.total_earned, 0)::numeric,
    (coalesce(inv.balance, 0) + coalesce(appt.balance, 0))::numeric,
    coalesce(inv.balance, 0)::numeric,
    coalesce(appt.balance, 0)::numeric
  from public.customers c
  left join lateral (
    select sum(t.collected_amount) as total_earned from public.income_transactions t
    where t.customer_id = c.id and not t.is_voided
  ) inc on true
  left join lateral (
    select sum(i.total_amount - coalesce(p.paid, 0)) as balance
    from public.customer_invoices i
    left join lateral (
      select sum(cp.amount) as paid from public.customer_invoice_payments cp
      where cp.invoice_id = i.id and not cp.is_voided
    ) p on true
    where i.customer_id = c.id and not i.is_voided
  ) inv on true
  left join lateral (
    select sum(greatest(a.quoted_total - coalesce(a.collected_total, a.quoted_total), 0)) as balance
    from public.appointments a where a.customer_id = c.id and a.status = 'completed'
  ) appt on true;
end;
$$;
revoke all on function public.customer_financial_summary() from public, anon;
grant execute on function public.customer_financial_summary() to authenticated;

create trigger audit_customer_invoices after insert or update on public.customer_invoices
for each row execute function private.audit_admin_change();
create trigger audit_customer_invoice_items after insert on public.customer_invoice_items
for each row execute function private.audit_admin_change();
create trigger audit_customer_invoice_payments after insert or update on public.customer_invoice_payments
for each row execute function private.audit_admin_change();
;
