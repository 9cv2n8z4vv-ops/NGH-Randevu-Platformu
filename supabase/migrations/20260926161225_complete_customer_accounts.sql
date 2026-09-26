-- Finish the existing CRM schema without recreating customer or income records.
alter table public.customer_invoices add column request_fingerprint text;
alter table public.customer_invoices add column appointment_id uuid unique references public.appointments(id) on delete restrict;

create or replace function private.normalize_customer_phone(p_phone text)
returns text language sql immutable security invoker set search_path = '' as $$
  with digits as (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as n),
  international as (select case when n like '00%' then substr(n, 3) else n end as n from digits)
  select case when length(n) = 11 and n like '0%' then '90' || substr(n, 2)
              when length(n) = 10 then '90' || n else n end from international
$$;
revoke all on function private.normalize_customer_phone(text) from public, anon;
grant execute on function private.normalize_customer_phone(text) to authenticated, service_role;

create or replace function private.normalize_customer_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.first_name := btrim(new.first_name);
  new.last_name := btrim(new.last_name);
  new.phone := btrim(new.phone);
  new.phone_normalized := private.normalize_customer_phone(new.phone);
  new.email := nullif(btrim(coalesce(new.email, '')), '');
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.normalize_customer_record() from public, anon, authenticated;
create trigger customer_normalize before insert or update of phone, first_name, last_name, email on public.customers
for each row execute function private.normalize_customer_record();
-- Leave any pre-existing ambiguous duplicates for manual reconciliation.
update public.customers c set phone_normalized = private.normalize_customer_phone(c.phone)
where c.phone_normalized <> private.normalize_customer_phone(c.phone)
  and not exists (select 1 from public.customers other where other.id <> c.id
    and private.normalize_customer_phone(other.phone) = private.normalize_customer_phone(c.phone));


CREATE OR REPLACE FUNCTION public.change_appointment(p_code text, p_phone text, p_service_ids uuid[], p_staff_id uuid, p_date date, p_start_time time without time zone)
 RETURNS TABLE(appointment_code text, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_appointment public.appointments%rowtype;
  v_duration integer;
  v_count integer;
  v_price numeric(12,2);
  v_phone text;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_lock smallint;
begin
  v_phone := private.normalize_customer_phone(p_phone);
  select a.* into v_appointment
  from public.appointments a join public.customers c on c.id = a.customer_id
  where a.code = p_code and c.phone_normalized = v_phone
  for update of a;
  if not found or v_appointment.status not in ('pending', 'confirmed') then raise exception 'not_editable'; end if;
  select timezone, manage_changes_lock_hours into v_tz, v_lock from public.site_settings where id = 1;
  if v_appointment.starts_at <= now() + make_interval(hours => v_lock) then raise exception 'change_window_closed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id::text, 0));
  select sum(s.duration_minutes), count(distinct s.id), sum(s.price)
    into v_duration, v_count, v_price
  from public.services s where s.id = any(p_service_ids) and s.is_active and s.archived_at is null;
  if v_count <> cardinality(p_service_ids) or v_count = 0 then raise exception 'invalid_services'; end if;
  if not exists (select 1 from private.available_local_slots(p_date, p_staff_id, p_service_ids, v_appointment.id) x where x.slot_time = p_start_time) then
    raise exception 'slot_unavailable';
  end if;
  v_start := ((p_date::text || ' ' || p_start_time::text)::timestamp at time zone v_tz);
  v_end := v_start + make_interval(mins => v_duration);
  update public.appointments set staff_id = p_staff_id, starts_at = v_start, ends_at = v_end,
    quoted_total = v_price, updated_at = now()
  where id = v_appointment.id;
  delete from public.appointment_services where appointment_id = v_appointment.id;
  insert into public.appointment_services(appointment_id, service_id, service_name_snapshot,
    duration_minutes_snapshot, price_snapshot, display_order)
  select v_appointment.id, s.id, s.name, s.duration_minutes, s.price, array_position(p_service_ids, s.id)
  from public.services s where s.id = any(p_service_ids);
  return query select p_code, v_start, v_end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_appointment(p_code text, p_service_ids uuid[], p_staff_id uuid, p_date date, p_start_time time without time zone, p_first_name text, p_last_name text, p_phone text, p_email text DEFAULT NULL::text, p_note text DEFAULT ''::text, p_privacy_acknowledged boolean DEFAULT false)
 RETURNS TABLE(appointment_code text, starts_at timestamp with time zone, ends_at timestamp with time zone, total_duration integer, quoted_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_duration integer;
  v_count integer;
  v_price numeric(12,2);
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_phone text;
  v_settings public.site_settings%rowtype;
begin
  if not p_privacy_acknowledged then raise exception 'privacy_required'; end if;
  if p_code !~ '^RND-[A-Z0-9]{20}$' then raise exception 'invalid_booking_code'; end if;
  if length(btrim(p_first_name)) not between 1 and 100 or length(btrim(p_last_name)) not between 1 and 100 then raise exception 'invalid_name'; end if;
  if p_note is not null and length(p_note) > 1000 then raise exception 'invalid_note'; end if;
  v_phone := private.normalize_customer_phone(p_phone);
  if length(v_phone) not between 7 and 15 then raise exception 'invalid_phone'; end if;
  if p_service_ids is null or cardinality(p_service_ids) = 0 or cardinality(p_service_ids) > 12 then raise exception 'invalid_services'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_staff_id::text, 0));
  select * into v_settings from public.site_settings where id = 1;
  v_tz := v_settings.timezone;
  if v_settings.require_email and coalesce(btrim(p_email), '') = '' then raise exception 'email_required'; end if;
  select sum(s.duration_minutes), count(distinct s.id), sum(s.price)
    into v_duration, v_count, v_price
  from public.services s
  where s.id = any(p_service_ids) and s.is_active and s.archived_at is null;
  if v_count <> cardinality(p_service_ids) then raise exception 'invalid_services'; end if;
  if not exists (
    select 1 from private.available_local_slots(p_date, p_staff_id, p_service_ids, null) x
    where x.slot_time = p_start_time
  ) then raise exception 'slot_unavailable'; end if;
  v_start := ((p_date::text || ' ' || p_start_time::text)::timestamp at time zone v_tz);
  v_end := v_start + make_interval(mins => v_duration);

  insert into public.customers(first_name, last_name, phone, phone_normalized, email)
  values (btrim(p_first_name), btrim(p_last_name), btrim(p_phone), v_phone, nullif(btrim(coalesce(p_email, '')), ''))
  on conflict (phone_normalized) do update set
    first_name = excluded.first_name, last_name = excluded.last_name, phone = excluded.phone,
    email = coalesce(excluded.email, public.customers.email), updated_at = now()
  returning id into v_customer_id;

  insert into public.appointments(code, customer_id, staff_id, starts_at, ends_at, customer_note,
    privacy_acknowledged_at, quoted_total, status)
  values (p_code, v_customer_id, p_staff_id, v_start, v_end, coalesce(btrim(p_note), ''),
    now(), v_price, 'confirmed')
  returning id into v_appointment_id;
  insert into public.appointment_services(appointment_id, service_id, service_name_snapshot,
    duration_minutes_snapshot, price_snapshot, display_order)
  select v_appointment_id, s.id, s.name,
         s.duration_minutes, s.price, array_position(p_service_ids, s.id)
  from public.services s where s.id = any(p_service_ids);

  return query select p_code, v_start, v_end, v_duration, v_price;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lookup_appointment(p_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_phone text;
begin
  v_phone := private.normalize_customer_phone(p_phone);
  if p_code !~ '^RND-[A-Z0-9]{20}$' or length(v_phone) not between 7 and 15 then
    raise exception 'not_found';
  end if;
  select jsonb_build_object(
    'code', a.code, 'firstName', c.first_name, 'lastName', c.last_name,
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', aps.service_id, 'name', aps.service_name_snapshot,
      'duration', aps.duration_minutes_snapshot, 'price', aps.price_snapshot) order by aps.display_order)
      from public.appointment_services aps where aps.appointment_id = a.id), '[]'::jsonb),
    'staffId', st.id, 'staffName', st.full_name, 'date', (a.starts_at at time zone cfg.timezone)::date,
    'time', to_char(a.starts_at at time zone cfg.timezone, 'HH24:MI'),
    'status', a.status, 'quotedTotal', a.quoted_total
  ) into v_result
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  join public.staff st on st.id = a.staff_id
  cross join public.site_settings cfg
  where a.code = p_code and c.phone_normalized = v_phone;
  if v_result is null then raise exception 'not_found'; end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sync_appointment_income()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tx_id uuid;
begin
  if exists (select 1 from public.customer_invoices i where i.appointment_id = new.id) then
    if new.status in ('cancelled', 'no_show') and exists (
      select 1 from public.customer_invoices i where i.appointment_id = new.id and not i.is_voided
    ) then raise exception 'invoice_must_be_voided_first'; end if;
    return new;
  end if;
  if new.status = 'completed' then
    if new.payment_method_id is null then raise exception 'payment_method_required'; end if;
    insert into public.income_transactions(appointment_id, customer_id, staff_id, payment_method_id,
      source, occurred_at, expected_amount, collected_amount, description)
    values (new.id, new.customer_id, new.staff_id, new.payment_method_id, 'appointment',
      now(), new.quoted_total, coalesce(new.collected_total, new.quoted_total), 'Randevu geliri')
    on conflict (appointment_id) do update set
      customer_id = excluded.customer_id, staff_id = excluded.staff_id,
      payment_method_id = excluded.payment_method_id, occurred_at = excluded.occurred_at,
      expected_amount = excluded.expected_amount, collected_amount = excluded.collected_amount,
      is_voided = false, updated_at = now()
    returning id into v_tx_id;
    delete from public.income_transaction_services where income_transaction_id = v_tx_id;
    insert into public.income_transaction_services(income_transaction_id, service_id, service_name_snapshot, amount)
    select v_tx_id, aps.service_id, aps.service_name_snapshot, aps.price_snapshot
    from public.appointment_services aps where aps.appointment_id = new.id;
  elsif tg_op = 'UPDATE' and old.status = 'completed' then
    update public.income_transactions set is_voided = true, updated_at = now()
    where appointment_id = new.id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.guard_customer_invoice_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.id is distinct from old.id
     or new.invoice_number is distinct from old.invoice_number
     or new.appointment_id is distinct from old.appointment_id
     or new.request_fingerprint is distinct from old.request_fingerprint
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
$function$
;

CREATE OR REPLACE FUNCTION private.apply_customer_invoice_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_legacy public.income_transactions%rowtype;
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
  if new.is_voided or new.amount is null or new.amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'invalid_payment';
  end if;
  new.created_by := auth.uid();
  -- Import a prior appointment receipt by reference, never by recording its income again.
  if new.income_transaction_id is not null then
    select * into v_legacy from public.income_transactions where id = new.income_transaction_id;
    if v_invoice.appointment_id is null or not found
       or v_legacy.appointment_id is distinct from v_invoice.appointment_id
       or v_legacy.customer_id is distinct from v_invoice.customer_id
       or v_legacy.collected_amount is distinct from new.amount
       or v_legacy.payment_method_id is distinct from new.payment_method_id
       or v_legacy.occurred_at is distinct from new.paid_at
       or v_legacy.is_voided or new.amount <= 0 or new.amount > v_invoice.total_amount then
      raise exception 'invalid_legacy_payment';
    end if;
    select coalesce(sum(p.amount),0) into v_paid from public.customer_invoice_payments p
      where p.invoice_id=new.invoice_id and not p.is_voided;
    if v_paid+new.amount > v_invoice.total_amount then raise exception 'payment_exceeds_invoice_balance'; end if;
    v_income_id := v_legacy.id;
    delete from public.income_transaction_services where income_transaction_id=v_income_id;
  else
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
  end if;
  new.income_transaction_id := v_income_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.customer_financial_summary()
 RETURNS TABLE(customer_id uuid, total_earned numeric, outstanding_balance numeric, invoice_balance numeric, appointment_balance numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
      and not exists (select 1 from public.customer_invoices linked where linked.appointment_id = a.id)
  ) appt on true;
end;
$function$
;

-- Caller-provided IDs make retries safe after a lost network response.
create function public.record_customer_invoice_payment(
  p_payment_id uuid, p_invoice_id uuid, p_amount numeric, p_payment_method_id uuid, p_paid_on date
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_existing public.customer_invoice_payments%rowtype; v_tz text;
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  if p_payment_id is null or p_amount is null or p_amount <= 0
    or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2)
    or p_paid_on is null then raise exception 'invalid_payment'; end if;
  select timezone into v_tz from public.site_settings where id = 1;
  if p_paid_on > (now() at time zone v_tz)::date then raise exception 'future_payment_date'; end if;
  perform 1 from public.customer_invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  select * into v_existing from public.customer_invoice_payments where id = p_payment_id;
  if found then
    if v_existing.invoice_id <> p_invoice_id or v_existing.amount <> p_amount
       or v_existing.payment_method_id is distinct from p_payment_method_id
       or (v_existing.paid_at at time zone v_tz)::date <> p_paid_on then
      raise exception 'payment_retry_mismatch';
    end if;
    return v_existing.id;
  end if;
  insert into public.customer_invoice_payments(id, invoice_id, amount, payment_method_id, paid_at)
  values (p_payment_id, p_invoice_id, p_amount, p_payment_method_id,
    (p_paid_on + time '12:00') at time zone v_tz);
  return p_payment_id;
end;
$$;
revoke all on function public.record_customer_invoice_payment(uuid, uuid, numeric, uuid, date) from public, anon;
grant execute on function public.record_customer_invoice_payment(uuid, uuid, numeric, uuid, date) to authenticated;

-- Validated writes remain in private; exposed wrappers keep invoker semantics.
create function private.create_customer_sale(
  p_invoice_id uuid, p_customer_id uuid, p_description text, p_staff_id uuid, p_items jsonb,
  p_initial_amount numeric, p_payment_method_id uuid, p_paid_on date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb; v_name text; v_service uuid; v_qty integer; v_price numeric;
  v_fingerprint text; v_total numeric := 0; v_order integer := 0; v_existing public.customer_invoices%rowtype;
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  if p_invoice_id is null then raise exception 'invoice_id_required'; end if;
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception 'customer_not_found'; end if;
  v_fingerprint := md5(jsonb_build_object('customer',p_customer_id,'description',p_description,
    'staff',p_staff_id,'items',p_items,'initial',p_initial_amount,'method',p_payment_method_id,'date',p_paid_on)::text);
  select * into v_existing from public.customer_invoices where id = p_invoice_id;
  if found then
    if v_existing.customer_id <> p_customer_id or v_existing.request_fingerprint is distinct from v_fingerprint then raise exception 'invoice_retry_mismatch'; end if;
    return p_invoice_id;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'invoice_items_required';
  end if;
  if p_initial_amount is null or p_initial_amount < 0
    or p_initial_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_payment'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := btrim(coalesce(v_item->>'service_name_snapshot',''));
    v_qty := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price')::numeric;
    if length(v_name) not between 1 and 120 or v_qty is null or v_qty not between 1 and 1000
       or v_price is null or v_price < 0 or v_price::text in ('NaN','Infinity','-Infinity')
       or v_price <> round(v_price,2) then raise exception 'invalid_invoice_item'; end if;
    v_total := v_total + v_qty * v_price;
  end loop;
  if v_total <= 0 then raise exception 'invoice_total_must_be_positive'; end if;
  if p_initial_amount > v_total then raise exception 'payment_exceeds_invoice_balance'; end if;
  insert into public.customer_invoices(id, customer_id, staff_id, description, total_amount, request_fingerprint)
  values (p_invoice_id, p_customer_id, p_staff_id, left(btrim(coalesce(p_description,'')),240), v_total, v_fingerprint);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_order := v_order + 1;
    v_service := nullif(v_item->>'service_id','')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price')::numeric;
    insert into public.customer_invoice_items(invoice_id, service_id, service_name_snapshot, quantity, unit_price, line_total, display_order)
    values(p_invoice_id, v_service, btrim(v_item->>'service_name_snapshot'), v_qty, v_price, v_qty*v_price, v_order);
  end loop;
  if p_initial_amount > 0 then
    perform public.record_customer_invoice_payment(p_invoice_id, p_invoice_id, p_initial_amount, p_payment_method_id, p_paid_on);
  end if;
  return p_invoice_id;
end;
$$;
revoke all on function private.create_customer_sale(uuid, uuid, text, uuid, jsonb, numeric, uuid, date) from public, anon;
grant execute on function private.create_customer_sale(uuid, uuid, text, uuid, jsonb, numeric, uuid, date) to authenticated;
create function public.create_customer_sale(
  p_invoice_id uuid, p_customer_id uuid, p_description text, p_staff_id uuid, p_items jsonb,
  p_initial_amount numeric, p_payment_method_id uuid, p_paid_on date
) returns uuid language sql security invoker set search_path = '' as $$
  select private.create_customer_sale(p_invoice_id, p_customer_id, p_description, p_staff_id, p_items,
    p_initial_amount, p_payment_method_id, p_paid_on)
$$;
revoke all on function public.create_customer_sale(uuid, uuid, text, uuid, jsonb, numeric, uuid, date) from public, anon;
grant execute on function public.create_customer_sale(uuid, uuid, text, uuid, jsonb, numeric, uuid, date) to authenticated;

create function private.invoice_customer_appointment(p_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_a public.appointments%rowtype; v_income public.income_transactions%rowtype;
  v_invoice_id uuid; v_item record; v_sum numeric; v_remaining numeric; v_amount numeric;
  v_n integer; v_index integer := 0;
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  select * into v_a from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment_not_found'; end if;
  select id into v_invoice_id from public.customer_invoices where appointment_id = p_appointment_id;
  if found then return v_invoice_id; end if;
  if v_a.status in ('cancelled','no_show') then raise exception 'appointment_is_cancelled'; end if;
  if v_a.quoted_total <= 0 then raise exception 'invoice_total_must_be_positive'; end if;
  select * into v_income from public.income_transactions where appointment_id = v_a.id and not is_voided;
  if coalesce(v_income.collected_amount,0) > v_a.quoted_total then raise exception 'appointment_overpaid'; end if;
  insert into public.customer_invoices(customer_id, staff_id, appointment_id, description, total_amount)
  values(v_a.customer_id, v_a.staff_id, v_a.id, 'Randevu ' || v_a.code, v_a.quoted_total) returning id into v_invoice_id;
  select sum(price_snapshot), count(*) into v_sum,v_n from public.appointment_services where appointment_id=v_a.id;
  v_remaining := v_a.quoted_total;
  for v_item in select * from public.appointment_services where appointment_id=v_a.id order by display_order,id loop
    v_index := v_index + 1;
    v_amount := case when v_index=v_n then v_remaining when coalesce(v_sum,0)=0 then 0
      else least(v_remaining,round(v_a.quoted_total*v_item.price_snapshot/v_sum,2)) end;
    v_remaining := v_remaining-v_amount;
    insert into public.customer_invoice_items(invoice_id,service_id,service_name_snapshot,quantity,unit_price,line_total,display_order)
    values(v_invoice_id,v_item.service_id,v_item.service_name_snapshot,1,v_amount,v_amount,v_index);
  end loop;
  if v_n=0 then
    insert into public.customer_invoice_items(invoice_id,service_name_snapshot,quantity,unit_price,line_total)
    values(v_invoice_id,'Randevu hizmeti',1,v_a.quoted_total,v_a.quoted_total);
  end if;
  if coalesce(v_income.collected_amount,0)>0 then
    insert into public.customer_invoice_payments(invoice_id,amount,payment_method_id,paid_at,income_transaction_id)
    values(v_invoice_id,v_income.collected_amount,v_income.payment_method_id,v_income.occurred_at,v_income.id);
  end if;
  update public.appointments set status='completed', updated_at=now() where id=v_a.id;
  return v_invoice_id;
end;
$$;
revoke all on function private.invoice_customer_appointment(uuid) from public, anon;
grant execute on function private.invoice_customer_appointment(uuid) to authenticated;
create function public.invoice_customer_appointment(p_appointment_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.invoice_customer_appointment(p_appointment_id)
$$;
revoke all on function public.invoice_customer_appointment(uuid) from public, anon;
grant execute on function public.invoice_customer_appointment(uuid) to authenticated;

-- All-time customer totals, independent of the date window in finance reports.
create function public.customer_account_directory()
returns table(id uuid, first_name text, last_name text, phone text, email text, private_note text,
  created_at timestamptz, updated_at timestamptz, total_earned numeric, outstanding_balance numeric)
language sql stable security invoker set search_path = '' as $$
  select c.id,c.first_name,c.last_name,c.phone,c.email,c.private_note,c.created_at,c.updated_at,
    s.total_earned,s.outstanding_balance
  from public.customers c join public.customer_financial_summary() s on s.customer_id=c.id
  where private.is_admin()
$$;
revoke all on function public.customer_account_directory() from public, anon;
grant execute on function public.customer_account_directory() to authenticated;
notify pgrst, 'reload schema';
