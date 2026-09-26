-- Run through a trusted SQL connection against the migrated database.
-- Every fixture and change rolls back; production customer rows are never edited.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'role', 'authenticated')::text, true)
from public.admin_users order by created_at limit 1;
set local role authenticated;
do $$
declare
  c uuid := gen_random_uuid(); inv uuid := gen_random_uuid(); payment uuid := gen_random_uuid();
  failed_inv uuid := gen_random_uuid(); appt uuid := gen_random_uuid(); linked uuid;
  method uuid; member uuid; result record; base_income_count integer; first_income uuid;
  items jsonb := '[{"service_id":null,"service_name_snapshot":"Test kesim","quantity":1,"unit_price":600},{"service_id":null,"service_name_snapshot":"Test bakım","quantity":1,"unit_price":400}]';
  v_phone text := '+90 555' || lpad(floor(random()*10000000)::text,7,'0');
  test_admin uuid := auth.uid();
  test_staff uuid := gen_random_uuid(); test_service uuid := gen_random_uuid(); booking_code text; booking_id uuid;
  test_day date := (now() at time zone 'Europe/Istanbul')::date;
begin
  assert private.is_admin(), 'test admin context';
  select id into method from public.payment_methods where is_active order by display_order limit 1;
  select id into member from public.staff order by created_at limit 1;
  insert into public.customers(id,first_name,last_name,phone,phone_normalized)
    values(c,'CRM TEST','Rollback',v_phone,'1234567');
  assert (select phone_normalized=regexp_replace(v_phone,'[^0-9]','','g') from public.customers where id=c), 'phone normalization';
  begin
    insert into public.customers(first_name,last_name,phone,phone_normalized)
    values('CRM TEST','Duplicate','0'||substr(regexp_replace(v_phone,'[^0-9]','','g'),3),'1234567');
    raise exception 'duplicate customer accepted';
  exception when unique_violation then null;
  end;
  perform public.create_customer_sale(inv,c,'CRM rollback test',member,items,400,method,test_day);
  select * into result from public.customer_financial_summary() where customer_id=c;
  assert result.total_earned=400 and result.outstanding_balance=600,'initial partial payment and balance';
  assert (select sum(s.amount)=400 from public.income_transaction_services s join public.income_transactions t on t.id=s.income_transaction_id where t.customer_id=c), 'allocated service revenue';
  perform public.create_customer_sale(inv,c,'CRM rollback test',member,items,400,method,test_day);
  assert (select count(*)=1 from public.customer_invoice_payments where invoice_id=inv),'invoice retry idempotency';
  begin
    perform public.record_customer_invoice_payment(gen_random_uuid(),inv,601,method,test_day);
    raise exception 'overpayment accepted';
  exception when raise_exception then
    if sqlerrm<>'payment_exceeds_invoice_balance' then raise; end if;
  end;
  perform public.record_customer_invoice_payment(payment,inv,600,method,test_day);
  perform public.record_customer_invoice_payment(payment,inv,600,method,test_day);
  select * into result from public.customer_financial_summary() where customer_id=c;
  assert result.total_earned=1000 and result.outstanding_balance=0,'full payment and retry';
  assert (select count(*)=2 from public.income_transactions where customer_id=c),'no duplicate income';
  update public.customer_invoice_payments set is_voided=true where id=payment;
  select * into result from public.customer_financial_summary() where customer_id=c;
  assert result.total_earned=400 and result.outstanding_balance=600,'void payment sync';
  update public.customer_invoice_payments set is_voided=false where id=payment;
  assert (select total_earned=1000 from public.customer_financial_summary() where customer_id=c),'restore payment';
  begin
    update public.customer_invoices set is_voided=true where id=inv;
    raise exception 'paid invoice void accepted';
  exception when raise_exception then
    if sqlerrm<>'void_invoice_payments_first' then raise; end if;
  end;
  update public.customer_invoice_payments set is_voided=true where invoice_id=inv;
  update public.customer_invoices set is_voided=true where id=inv;
  select * into result from public.customer_financial_summary() where customer_id=c;
  assert result.total_earned=0 and result.outstanding_balance=0,'cancelled invoice totals';
  update public.customer_invoices set is_voided=false where id=inv;
  select * into result from public.customer_financial_summary() where customer_id=c;
  assert result.outstanding_balance=1000,'restore invoice debt';
  begin
    perform public.create_customer_sale(failed_inv,c,'Atomic failure',null,items,1100,method,test_day);
    raise exception 'invalid initial payment accepted';
  exception when raise_exception then
    if sqlerrm<>'payment_exceeds_invoice_balance' then raise; end if;
  end;
  assert not exists(select 1 from public.customer_invoices where id=failed_inv),'failed sale atomicity';
  -- A prior appointment already collected 400. Converting must reuse that exact receipt.
  insert into public.appointments(id,code,customer_id,staff_id,starts_at,ends_at,status,privacy_acknowledged_at,quoted_total)
    values(appt,'TEST-'||appt,c,member,now()-interval '4 days',now()-interval '4 days'+interval '30 minutes','confirmed',now(),1000);
  insert into public.appointment_services(appointment_id,service_name_snapshot,duration_minutes_snapshot,price_snapshot)
    values(appt,'Legacy test',30,1000);
  update public.appointments set status='completed',collected_total=400,payment_method_id=method where id=appt;
  select id into first_income from public.income_transactions where appointment_id=appt;
  select count(*) into base_income_count from public.income_transactions where customer_id=c;
  linked := public.invoice_customer_appointment(appt);
  assert public.invoice_customer_appointment(appt)=linked,'appointment conversion retry';
  assert (select count(*)=base_income_count from public.income_transactions where customer_id=c),'legacy income not duplicated';
  assert (select income_transaction_id=first_income from public.customer_invoice_payments where invoice_id=linked),'legacy receipt retained';
  assert (select sum(amount)=400 from public.income_transaction_services where income_transaction_id=first_income),'legacy service allocation';
  select * into result from public.customer_financial_summary() where customer_id=c;
  assert result.total_earned=400 and result.outstanding_balance=1600,'no duplicate appointment debt';
  perform public.record_customer_invoice_payment(gen_random_uuid(),linked,600,method,test_day);
  select * into result from public.customer_financial_summary() where customer_id=c;
  assert result.total_earned=1000 and result.outstanding_balance=1000,'appointment balance collection';
  begin
    update public.income_transactions set collected_amount=999 where id=first_income;
    raise exception 'direct invoice income edit accepted';
  exception when raise_exception then
    if sqlerrm<>'invoice_payment_controls_income' then raise; end if;
  end;
  -- Public booking reuses the manually entered customer even with a different phone format.
  insert into public.staff(id,full_name) values(test_staff,'CRM TEST Staff');
  insert into public.services(id,name,slug,duration_minutes,price)
    values(test_service,'CRM TEST Service','crm-test-'||test_service,30,1000);
  insert into public.staff_services(staff_id,service_id) values(test_staff,test_service);
  update public.business_hours set is_open=true,opening_time='09:00',closing_time='18:00'
    where day_of_week=extract(isodow from test_day+2);
  update public.site_settings set require_email=false where id=1;
  booking_code := 'RND-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  perform public.create_appointment(booking_code,array[test_service],test_staff,test_day+2,time '10:00',
    'CRM TEST','Rollback','0'||substr(regexp_replace(v_phone,'[^0-9]','','g'),3),'','',true);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',test_admin,'role','authenticated')::text,true);
  select id into booking_id from public.appointments where code=booking_code;
  assert (select customer_id=c from public.appointments where id=booking_id),'booking merges customer';
  assert (select count(*)=1 from public.appointment_services where appointment_id=booking_id),'booking service history';
  execute 'set local role anon';
  assert public.lookup_appointment(booking_code,v_phone) is not null,'lookup normalized phone';
  execute 'set local role authenticated';
  -- An authenticated account without admin access cannot read CRM or mutate it.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  assert (select count(*)=0 from public.customers),'non-admin customer RLS';
  assert (select count(*)=0 from public.customer_invoices),'non-admin invoice RLS';
  begin
    perform public.record_customer_invoice_payment(gen_random_uuid(),inv,1,method,test_day);
    raise exception 'non-admin payment accepted';
  exception when raise_exception then
    if sqlerrm<>'admin_required' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: customer normalization, partial/full payments, retries, overpayment protection, void/restore, atomic writes, appointment transfer, automatic booking customer merge, RLS' as result;
