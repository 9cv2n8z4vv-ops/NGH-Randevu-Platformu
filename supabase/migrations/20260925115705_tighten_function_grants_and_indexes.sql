-- Restrict exposed SECURITY DEFINER RPCs to their intended API roles.
revoke all on function public.get_available_slots(date, uuid, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.create_appointment(text, uuid[], uuid, date, time, text, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.lookup_appointment(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.change_appointment(text, text, uuid[], uuid, date, time)
  from public, anon, authenticated, service_role;
revoke all on function public.set_staff_services(uuid, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.generate_due_recurring_expenses()
  from public, anon, authenticated, service_role;

grant execute on function public.get_available_slots(date, uuid, uuid[]) to anon, authenticated;
grant execute on function public.create_appointment(text, uuid[], uuid, date, time, text, text, text, text, text, boolean) to anon;
grant execute on function public.lookup_appointment(text, text) to anon;
grant execute on function public.change_appointment(text, text, uuid[], uuid, date, time) to anon;
grant execute on function public.set_staff_services(uuid, uuid[]) to authenticated;
grant execute on function public.generate_due_recurring_expenses() to service_role;

-- Cover foreign-key lookups used by joins and parent-row updates/deletes.
create index if not exists appointment_history_actor_idx on public.appointment_history (actor_id);
create index if not exists appointments_payment_method_idx on public.appointments (payment_method_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists expense_services_service_idx on public.expense_services (service_id);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists income_transaction_services_service_idx on public.income_transaction_services (service_id);
create index if not exists income_transactions_customer_idx on public.income_transactions (customer_id);
create index if not exists income_transactions_payment_method_idx on public.income_transactions (payment_method_id);
create index if not exists recurring_expense_rules_category_idx on public.recurring_expense_rules (category_id);
