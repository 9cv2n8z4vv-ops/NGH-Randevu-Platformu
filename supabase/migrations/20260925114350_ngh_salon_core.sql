-- NGH salon operations platform. Fresh, tenant-ready schema with no demo records.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.payment_method_kind as enum ('cash', 'card', 'iban');
create type public.income_source as enum ('appointment', 'manual_service', 'manual_income');

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Nihat Gökhan Hair Design',
  tagline text not null default 'Saçlarınız bizimle, salonumuz sizinle parlıyor!',
  business_description text not null default '',
  logo_url text,
  phone text,
  whatsapp_phone text,
  email text,
  address text,
  maps_url text,
  maps_embed_url text,
  instagram_url text,
  primary_color text not null default '#28352D' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#B88969' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  surface_color text not null default '#F5F1EA' check (surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  cta_label text not null default 'Randevu Al',
  home_title text not null default 'Kendinize ayırdığınız zaman.',
  home_description text not null default 'Kendinizi iyi hissettiren saç ve bakım deneyimi için randevunuzu kolayca oluşturun.',
  footer_text text not null default '',
  timezone text not null default 'Europe/Istanbul',
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  booking_interval_minutes smallint not null default 15 check (booking_interval_minutes between 5 and 120),
  manage_changes_lock_hours smallint not null default 24 check (manage_changes_lock_hours between 0 and 720),
  require_email boolean not null default false,
  privacy_policy_text text not null default '',
  seo_title text not null default '',
  seo_description text not null default 'Hizmetinizi seçin, uygun personel ve saati bulun, randevunuzu kolayca oluşturun.',
  canonical_url text,
  updated_at timestamptz not null default now()
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'admin' check (role in ('owner', 'admin', 'manager')),
  created_at timestamptz not null default now()
);

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null unique,
  description text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null unique,
  short_description text not null default '',
  description text not null default '',
  duration_minutes smallint not null check (duration_minutes between 5 and 720),
  price numeric(12,2) not null default 0 check (price >= 0),
  image_url text,
  image_alt text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_active_order_idx on public.services (display_order, name) where is_active and archived_at is null;
create index services_category_idx on public.services (category_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  bio text not null default '',
  phone text,
  image_url text,
  image_alt text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_active_order_idx on public.staff (display_order, full_name) where is_active and archived_at is null;

create table public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, service_id)
);
create index staff_services_service_idx on public.staff_services (service_id, staff_id);

create table public.business_hours (
  day_of_week smallint primary key check (day_of_week between 1 and 7), -- ISO: Monday=1
  is_open boolean not null default false,
  opening_time time,
  closing_time time,
  check ((is_open and opening_time is not null and closing_time is not null and opening_time < closing_time)
      or (not is_open))
);
insert into public.business_hours(day_of_week, is_open)
select n, false from generate_series(1,7) as n;

create table public.staff_schedule (
  staff_id uuid not null references public.staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  is_working boolean not null default true,
  start_time time,
  end_time time,
  primary key (staff_id, day_of_week),
  check ((is_working and start_time is not null and end_time is not null and start_time < end_time)
      or not is_working)
);

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (start_at < end_at)
);
create index staff_time_off_period_idx on public.staff_time_off using gist (staff_id, tstzrange(start_at, end_at, '[)'));

create table public.business_closures (
  id uuid primary key default gen_random_uuid(),
  date_start date not null,
  date_end date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (date_start <= date_end)
);
create index business_closures_dates_idx on public.business_closures (date_start, date_end);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  phone text not null,
  phone_normalized text not null unique check (phone_normalized ~ '^[0-9]{7,15}$'),
  email text,
  private_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on public.customers (last_name, first_name);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'confirmed',
  customer_note text not null default '',
  privacy_acknowledged_at timestamptz not null,
  quoted_total numeric(12,2) not null default 0 check (quoted_total >= 0),
  collected_total numeric(12,2) check (collected_total is null or collected_total >= 0),
  payment_method_id uuid,
  created_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);
create index appointments_start_idx on public.appointments (starts_at desc);
create index appointments_staff_start_idx on public.appointments (staff_id, starts_at);
create index appointments_status_start_idx on public.appointments (status, starts_at);
create index appointments_customer_idx on public.appointments (customer_id, starts_at desc);

create table public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name_snapshot text not null,
  duration_minutes_snapshot smallint not null check (duration_minutes_snapshot between 1 and 720),
  price_snapshot numeric(12,2) not null check (price_snapshot >= 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index appointment_services_appointment_idx on public.appointment_services (appointment_id, display_order);
create index appointment_services_service_idx on public.appointment_services (service_id, appointment_id);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 80),
  kind public.payment_method_kind not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.payment_methods(name, kind, display_order) values
  ('Nakit', 'cash', 1), ('Kredi/Banka Kartı', 'card', 2), ('IBAN', 'iban', 3);
alter table public.appointments
  add constraint appointments_payment_method_fk
  foreign key (payment_method_id) references public.payment_methods(id) on delete set null;

create table public.income_transactions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid unique references public.appointments(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  source public.income_source not null,
  occurred_at timestamptz not null default now(),
  expected_amount numeric(12,2) not null default 0 check (expected_amount >= 0),
  collected_amount numeric(12,2) not null check (collected_amount >= 0),
  manually_adjusted boolean not null default false,
  description text not null default '',
  is_voided boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'appointment' and appointment_id is not null) or source <> 'appointment')
);
create index income_occurred_idx on public.income_transactions (occurred_at desc) where not is_voided;
create index income_staff_idx on public.income_transactions (staff_id, occurred_at desc) where not is_voided;

create table public.income_transaction_services (
  id uuid primary key default gen_random_uuid(),
  income_transaction_id uuid not null references public.income_transactions(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name_snapshot text not null,
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(12,2) not null check (amount >= 0)
);
create index income_transaction_services_tx_idx on public.income_transaction_services (income_transaction_id);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  expense_type text not null check (expense_type in ('shop', 'service')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.expense_categories(name, expense_type) values
  ('Kira', 'shop'), ('Faturalar', 'shop'), ('Temizlik', 'shop'),
  ('Reklam', 'shop'), ('Bakım', 'shop'), ('Diğer', 'shop'),
  ('Malzeme', 'service'), ('Sarf', 'service');

create table public.recurring_expense_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  category_id uuid references public.expense_categories(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  next_run_on date not null,
  ends_on date,
  description_template text not null default '',
  expense_type text not null default 'shop' check (expense_type in ('shop', 'service')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  category_id uuid references public.expense_categories(id) on delete set null,
  expense_type text not null check (expense_type in ('shop', 'service')),
  amount numeric(12,2) not null check (amount >= 0),
  description text not null default '',
  occurred_on date not null,
  recurring_rule_id uuid references public.recurring_expense_rules(id) on delete set null,
  recurrence_period date,
  created_at timestamptz not null default now(),
  check ((recurring_rule_id is null and recurrence_period is null) or
         (recurring_rule_id is not null and recurrence_period is not null)),
  unique (recurring_rule_id, recurrence_period)
);
create index expenses_date_idx on public.expenses (occurred_on desc);
create index expenses_type_date_idx on public.expenses (expense_type, occurred_on desc);

create table public.expense_services (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  primary key (expense_id, service_id)
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(btrim(customer_name)) between 1 and 120),
  content text not null check (length(btrim(content)) between 1 and 1500),
  rating smallint not null default 5 check (rating between 1 and 5),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  image_url text not null,
  image_alt text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(btrim(question)) between 1 and 250),
  answer text not null check (length(btrim(answer)) between 1 and 3000),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.appointment_history (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index appointment_history_appointment_idx on public.appointment_history (appointment_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function private.audit_admin_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_id text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id := coalesce(v_row ->> 'id', v_row ->> 'user_id',
    nullif(concat_ws('/', v_row ->> 'staff_id', v_row ->> 'service_id'), ''), v_row ->> 'day_of_week');
  insert into public.audit_logs(actor_id, entity_type, entity_id, action)
  values ((select auth.uid()), tg_table_name, v_id, lower(tg_op));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_admin_change() from public, anon, authenticated;

create trigger audit_site_settings after update or delete on public.site_settings
for each row execute function private.audit_admin_change();
create trigger audit_service_categories after insert or update or delete on public.service_categories
for each row execute function private.audit_admin_change();
create trigger audit_services after insert or update or delete on public.services
for each row execute function private.audit_admin_change();
create trigger audit_staff after insert or update or delete on public.staff
for each row execute function private.audit_admin_change();
create trigger audit_staff_services after insert or update or delete on public.staff_services
for each row execute function private.audit_admin_change();
create trigger audit_business_hours after insert or update or delete on public.business_hours
for each row execute function private.audit_admin_change();
create trigger audit_staff_schedule after insert or update or delete on public.staff_schedule
for each row execute function private.audit_admin_change();
create trigger audit_staff_time_off after insert or update or delete on public.staff_time_off
for each row execute function private.audit_admin_change();
create trigger audit_business_closures after insert or update or delete on public.business_closures
for each row execute function private.audit_admin_change();
create trigger audit_customers after insert or update or delete on public.customers
for each row execute function private.audit_admin_change();
create trigger audit_appointments after insert or update or delete on public.appointments
for each row execute function private.audit_admin_change();
create trigger audit_payment_methods after insert or update or delete on public.payment_methods
for each row execute function private.audit_admin_change();
create trigger audit_income_transactions after insert or update or delete on public.income_transactions
for each row execute function private.audit_admin_change();
create trigger audit_expense_categories after insert or update or delete on public.expense_categories
for each row execute function private.audit_admin_change();
create trigger audit_recurring_expense_rules after insert or update or delete on public.recurring_expense_rules
for each row execute function private.audit_admin_change();
create trigger audit_expenses after insert or update or delete on public.expenses
for each row execute function private.audit_admin_change();
create trigger audit_testimonials after insert or update or delete on public.testimonials
for each row execute function private.audit_admin_change();
create trigger audit_gallery_items after insert or update or delete on public.gallery_items
for each row execute function private.audit_admin_change();
create trigger audit_faqs after insert or update or delete on public.faqs
for each row execute function private.audit_admin_change();

insert into public.site_settings(id) values (1);

create or replace function private.available_local_slots(
  p_date date,
  p_staff_id uuid,
  p_service_ids uuid[],
  p_ignore_appointment uuid default null
)
returns table(slot_time time)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_duration integer;
  v_service_count integer;
  v_interval integer;
  v_tz text;
  v_open time;
  v_close time;
  v_is_working boolean;
  v_business_open boolean;
begin
  select cfg.timezone, cfg.booking_interval_minutes
    into v_tz, v_interval
  from public.site_settings cfg where cfg.id = 1;
  if p_date < (now() at time zone v_tz)::date
     or p_service_ids is null or cardinality(p_service_ids) = 0 then
    return;
  end if;
  select coalesce(sum(s.duration_minutes), 0), count(distinct s.id)
    into v_duration, v_service_count
  from public.services s
  where s.id = any(p_service_ids) and s.is_active and s.archived_at is null;
  if v_duration = 0 or v_service_count <> cardinality(p_service_ids) then return; end if;
  if not exists (select 1 from public.staff st where st.id = p_staff_id and st.is_active and st.archived_at is null)
     or exists (
       select 1 from public.services s
       where s.id = any(p_service_ids)
         and not exists (select 1 from public.staff_services ss where ss.staff_id = p_staff_id and ss.service_id = s.id)
     ) then return;
  end if;
  select coalesce(s.is_working, true),
         greatest(h.opening_time, coalesce(s.start_time, h.opening_time)),
         least(h.closing_time, coalesce(s.end_time, h.closing_time)),
         h.is_open
    into v_is_working, v_open, v_close, v_business_open
  from public.business_hours h
  left join public.staff_schedule s
    on s.staff_id = p_staff_id and s.day_of_week = extract(isodow from p_date)::smallint
  where h.day_of_week = extract(isodow from p_date)::smallint
    and h.is_open and coalesce(s.is_working, true);
  if not found or not v_is_working or not v_business_open or v_open is null or v_close is null then return; end if;
  if exists (select 1 from public.business_closures c where p_date between c.date_start and c.date_end) then return; end if;
  return query
  select (v_open + make_interval(mins => slots.n * v_interval))::time
  from generate_series(
    0,
    floor((extract(epoch from (v_close - v_open))::integer - v_duration * 60)::numeric / (v_interval * 60))::integer
  ) as slots(n)
  where not exists (
    select 1
    from public.staff_time_off o
    where o.staff_id = p_staff_id
      and tstzrange(o.start_at, o.end_at, '[)') &&
          tstzrange(((p_date::text || ' ' || (v_open + make_interval(mins => slots.n * v_interval))::text)::timestamp at time zone v_tz),
                    (((p_date::text || ' ' || (v_open + make_interval(mins => slots.n * v_interval))::text)::timestamp
                      + make_interval(mins => v_duration)) at time zone v_tz), '[)')
  )
  and (((p_date::text || ' ' || (v_open + make_interval(mins => slots.n * v_interval))::text)::timestamp at time zone v_tz) > now())
  and not exists (
    select 1 from public.appointments a
    where a.staff_id = p_staff_id and a.id is distinct from p_ignore_appointment
      and a.status in ('pending', 'confirmed')
      and tstzrange(a.starts_at, a.ends_at, '[)') &&
          tstzrange(((p_date::text || ' ' || (v_open + make_interval(mins => slots.n * v_interval))::text)::timestamp at time zone v_tz),
                    (((p_date::text || ' ' || (v_open + make_interval(mins => slots.n * v_interval))::text)::timestamp
                      + make_interval(mins => v_duration)) at time zone v_tz), '[)')
  );
end;
$$;
revoke all on function private.available_local_slots(date, uuid, uuid[], uuid) from public, anon, authenticated;

create or replace function public.get_available_slots(p_date date, p_staff_id uuid, p_service_ids uuid[])
returns table(slot_time text)
language sql stable security definer
set search_path = ''
as $$
  select to_char(s.slot_time, 'HH24:MI')
  from private.available_local_slots(p_date, p_staff_id, p_service_ids, null) s;
$$;

create or replace function public.create_appointment(
  p_code text,
  p_service_ids uuid[],
  p_staff_id uuid,
  p_date date,
  p_start_time time,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_note text default '',
  p_privacy_acknowledged boolean default false
)
returns table(appointment_code text, starts_at timestamptz, ends_at timestamptz, total_duration integer, quoted_total numeric)
language plpgsql security definer
set search_path = ''
as $$
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
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
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
$$;

create or replace function public.lookup_appointment(p_code text, p_phone text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_result jsonb; v_phone text;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
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
$$;

create or replace function public.change_appointment(
  p_code text, p_phone text, p_service_ids uuid[], p_staff_id uuid, p_date date, p_start_time time
)
returns table(appointment_code text, starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
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
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
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
$$;

create or replace function public.set_staff_services(p_staff_id uuid, p_service_ids uuid[])
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not private.is_admin() then raise exception 'admin_required'; end if;
  if not exists (select 1 from public.staff where id = p_staff_id) then raise exception 'staff_not_found'; end if;
  if p_service_ids is null then p_service_ids := '{}'::uuid[]; end if;
  select count(distinct s.id) into v_count
  from public.services s where s.id = any(p_service_ids) and s.is_active and s.archived_at is null;
  if v_count <> cardinality(p_service_ids) then raise exception 'invalid_services'; end if;
  delete from public.staff_services where staff_id = p_staff_id;
  insert into public.staff_services(staff_id, service_id)
  select p_staff_id, s.id from public.services s
  where s.id = any(p_service_ids) and s.is_active and s.archived_at is null;
end;
$$;

create or replace function private.sync_appointment_income()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_tx_id uuid;
begin
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
$$;
revoke all on function private.sync_appointment_income() from public, anon, authenticated;
create trigger appointments_income_sync
after insert or update
on public.appointments for each row execute function private.sync_appointment_income();

create or replace function private.log_appointment_changes()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_history(appointment_id, actor_id, action, details)
    values (new.id, auth.uid(), 'created', jsonb_build_object('status', new.status));
    return new;
  end if;
  if old.status is distinct from new.status or old.starts_at is distinct from new.starts_at
     or old.staff_id is distinct from new.staff_id or old.quoted_total is distinct from new.quoted_total
     or old.collected_total is distinct from new.collected_total
     or old.payment_method_id is distinct from new.payment_method_id then
    insert into public.appointment_history(appointment_id, actor_id, action, details)
    values (new.id, auth.uid(), 'updated', jsonb_build_object(
      'fromStatus', old.status, 'toStatus', new.status,
      'fromStart', old.starts_at, 'toStart', new.starts_at,
      'fromStaff', old.staff_id, 'toStaff', new.staff_id,
      'fromCollected', old.collected_total, 'toCollected', new.collected_total,
      'fromPaymentMethod', old.payment_method_id, 'toPaymentMethod', new.payment_method_id));
  end if;
  return new;
end;
$$;
revoke all on function private.log_appointment_changes() from public, anon, authenticated;
create trigger appointments_audit_insert after insert on public.appointments
for each row execute function private.log_appointment_changes();
create trigger appointments_audit_update after update on public.appointments
for each row execute function private.log_appointment_changes();

create or replace function public.generate_due_recurring_expenses()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.recurring_expense_rules%rowtype;
  v_created integer := 0;
  v_month text;
  v_description text;
  v_timezone text;
  v_today date;
begin
  select timezone into v_timezone from public.site_settings where id = 1;
  v_today := (now() at time zone coalesce(v_timezone, 'Europe/Istanbul'))::date;
  for r in select * from public.recurring_expense_rules
           where is_active and next_run_on <= v_today
             and (ends_on is null or next_run_on <= ends_on)
           order by next_run_on for update skip locked
  loop
    while r.next_run_on <= v_today
      and (r.ends_on is null or r.next_run_on <= r.ends_on) loop
      v_month := case extract(month from r.next_run_on)::int
        when 1 then 'Ocak' when 2 then 'Şubat' when 3 then 'Mart' when 4 then 'Nisan'
        when 5 then 'Mayıs' when 6 then 'Haziran' when 7 then 'Temmuz' when 8 then 'Ağustos'
        when 9 then 'Eylül' when 10 then 'Ekim' when 11 then 'Kasım' else 'Aralık' end;
      v_description := replace(coalesce(nullif(r.description_template, ''), r.name), '{month_name}', v_month);
      insert into public.expenses(name, category_id, expense_type, amount, description, occurred_on, recurring_rule_id, recurrence_period)
      values (r.name, r.category_id, r.expense_type, r.amount, v_description, r.next_run_on, r.id, r.next_run_on)
      on conflict (recurring_rule_id, recurrence_period) do nothing;
      if found then v_created := v_created + 1; end if;
      r.next_run_on := case r.frequency
        when 'daily' then r.next_run_on + 1
        when 'weekly' then r.next_run_on + 7
        when 'monthly' then (r.next_run_on + interval '1 month')::date
        else (r.next_run_on + interval '1 year')::date end;
    end loop;
    update public.recurring_expense_rules set next_run_on = r.next_run_on,
      is_active = case when r.ends_on is not null and r.next_run_on > r.ends_on then false else is_active end,
      updated_at = now()
    where id = r.id;
  end loop;
  return v_created;
end;
$$;

-- Public read surface: only active catalog and published site content.
alter table public.site_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_services enable row level security;
alter table public.business_hours enable row level security;
alter table public.staff_schedule enable row level security;
alter table public.staff_time_off enable row level security;
alter table public.business_closures enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;
alter table public.payment_methods enable row level security;
alter table public.income_transactions enable row level security;
alter table public.income_transaction_services enable row level security;
alter table public.expense_categories enable row level security;
alter table public.recurring_expense_rules enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_services enable row level security;
alter table public.testimonials enable row level security;
alter table public.gallery_items enable row level security;
alter table public.faqs enable row level security;
alter table public.appointment_history enable row level security;
alter table public.audit_logs enable row level security;

create policy "public settings read" on public.site_settings for select to anon, authenticated using (true);
create policy "admin settings write" on public.site_settings for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admin self read" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
create policy "public active categories read" on public.service_categories for select to anon, authenticated using (is_active and archived_at is null);
create policy "admins manage categories" on public.service_categories for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public active services read" on public.services for select to anon, authenticated using (is_active and archived_at is null);
create policy "admins manage services" on public.services for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public active staff read" on public.staff for select to anon, authenticated using (is_active and archived_at is null);
create policy "admins manage staff" on public.staff for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public staff service read" on public.staff_services for select to anon, authenticated using (true);
create policy "admins manage staff services" on public.staff_services for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public hours read" on public.business_hours for select to anon, authenticated using (true);
create policy "admins manage hours" on public.business_hours for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public staff schedule read" on public.staff_schedule for select to anon, authenticated using (true);
create policy "admins manage staff schedule" on public.staff_schedule for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage staff time off" on public.staff_time_off for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage closures" on public.business_closures for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage customers" on public.customers for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage appointments" on public.appointments for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage appointment services" on public.appointment_services for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public active payment methods read" on public.payment_methods for select to anon, authenticated using (is_active);
create policy "admins manage payment methods" on public.payment_methods for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage income" on public.income_transactions for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage income services" on public.income_transaction_services for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage expense categories" on public.expense_categories for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage recurring expenses" on public.recurring_expense_rules for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage expenses" on public.expenses for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins manage expense services" on public.expense_services for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public active testimonials read" on public.testimonials for select to anon, authenticated using (is_active);
create policy "admins manage testimonials" on public.testimonials for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public active gallery read" on public.gallery_items for select to anon, authenticated using (is_active);
create policy "admins manage gallery" on public.gallery_items for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "public active faqs read" on public.faqs for select to anon, authenticated using (is_active);
create policy "admins manage faqs" on public.faqs for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "admins read appointment history" on public.appointment_history for select to authenticated using (private.is_admin());
create policy "admins read audit logs" on public.audit_logs for select to authenticated using (private.is_admin());

grant select on public.site_settings, public.business_hours, public.staff_schedule, public.staff_services,
  public.service_categories, public.services, public.staff, public.payment_methods,
  public.testimonials, public.gallery_items, public.faqs to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on function public.get_available_slots(date, uuid, uuid[]) from public;
revoke all on function public.create_appointment(text, uuid[], uuid, date, time, text, text, text, text, text, boolean) from public;
revoke all on function public.lookup_appointment(text, text) from public;
revoke all on function public.change_appointment(text, text, uuid[], uuid, date, time) from public;
revoke all on function public.set_staff_services(uuid, uuid[]) from public;
revoke all on function public.generate_due_recurring_expenses() from public, anon, authenticated;
grant execute on function public.get_available_slots(date, uuid, uuid[]) to anon, authenticated;
grant execute on function public.create_appointment(text, uuid[], uuid, date, time, text, text, text, text, text, boolean) to anon;
grant execute on function public.lookup_appointment(text, text) to anon;
grant execute on function public.change_appointment(text, text, uuid[], uuid, date, time) to anon;
grant execute on function public.set_staff_services(uuid, uuid[]) to authenticated;
grant execute on function public.generate_due_recurring_expenses() to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('salon-media', 'salon-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "public can view salon media" on storage.objects for select to anon, authenticated
using (bucket_id = 'salon-media');
create policy "admins upload salon media" on storage.objects for insert to authenticated
with check (bucket_id = 'salon-media' and private.is_admin());
create policy "admins update salon media" on storage.objects for update to authenticated
using (bucket_id = 'salon-media' and private.is_admin())
with check (bucket_id = 'salon-media' and private.is_admin());
create policy "admins delete salon media" on storage.objects for delete to authenticated
using (bucket_id = 'salon-media' and private.is_admin());
