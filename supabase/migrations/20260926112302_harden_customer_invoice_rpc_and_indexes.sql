-- Keep the public RPC invoker-only while its private implementation performs
-- the validated multi-table invoice write for authorized salon admins.
alter function public.create_customer_invoice(uuid, text, uuid, jsonb) set schema private;

create function public.create_customer_invoice(
  p_customer_id uuid,
  p_description text,
  p_staff_id uuid,
  p_items jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_customer_invoice(p_customer_id, p_description, p_staff_id, p_items)
$$;
revoke all on function public.create_customer_invoice(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.create_customer_invoice(uuid, text, uuid, jsonb) to authenticated;

create index customer_invoice_items_service_idx on public.customer_invoice_items (service_id) where service_id is not null;
create index customer_invoices_creator_idx on public.customer_invoices (created_by) where created_by is not null;
create index customer_invoice_payments_creator_idx on public.customer_invoice_payments (created_by) where created_by is not null;
create index customer_invoice_payments_method_idx on public.customer_invoice_payments (payment_method_id);

notify pgrst, 'reload schema';
;
