import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { AdminConsole } from "./AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  if (!supabase) return <main className="admin-page"><div className="notice-card"><strong>Veritabanı bağlantısı gerekli</strong><p>Supabase URL ve publishable key eklendikten sonra yönetim paneli açılır.</p></div></main>;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/yonetim/giris");
  const { data: admin } = await supabase.from("admin_users").select("full_name, role").eq("user_id", auth.user.id).maybeSingle();
  if (!admin) return <main className="admin-page"><div className="notice-card"><strong>Bu hesap henüz yönetici değil</strong><p>Giriş başarılı, fakat bu kullanıcıya yönetim yetkisi tanımlanmamış. Kurulum yönergelerindeki ilk yönetici adımını tamamlayın.</p></div></main>;

  const now = new Date();
  const from = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const incomeFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const [settings, appointments, services, categories, staff, paymentMethods, expenses, incomes, hours, closures, recurring, expenseCategories, customers, staffSchedule, staffTimeOff, staffServices, testimonials, gallery, faqs, auditLogs] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).single(),
    supabase.from("appointments").select("id, code, starts_at, ends_at, status, quoted_total, collected_total, payment_method_id, customers(first_name,last_name,phone), staff(full_name), appointment_services(service_name_snapshot,price_snapshot)").gte("starts_at", now.toISOString()).lt("starts_at", to).order("starts_at").limit(120),
    supabase.from("services").select("*").is("archived_at", null).order("display_order"),
    supabase.from("service_categories").select("*").is("archived_at", null).order("display_order"),
    supabase.from("staff").select("*").is("archived_at", null).order("display_order"),
    supabase.from("payment_methods").select("*").eq("is_active", true).order("display_order"),
    supabase.from("expenses").select("id,name,amount,expense_type,occurred_on,description,recurring_rule_id,expense_categories(name)").gte("occurred_on", from.slice(0,10)).order("occurred_on", { ascending: false }).limit(100),
    fetchIncomeTransactions(supabase, incomeFrom, now.toISOString()),
    supabase.from("business_hours").select("*").order("day_of_week"),
    supabase.from("business_closures").select("*").gte("date_end", now.toISOString().slice(0,10)).order("date_start").limit(30),
    supabase.from("recurring_expense_rules").select("*, expense_categories(name)").order("next_run_on"),
    supabase.from("expense_categories").select("*").eq("is_active", true).order("name"),
    supabase.from("customers").select("id,first_name,last_name,phone,email,private_note,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("staff_schedule").select("*"),
    supabase.from("staff_time_off").select("*").gte("end_at", now.toISOString()).order("start_at").limit(80),
    supabase.from("staff_services").select("*"),
    supabase.from("testimonials").select("*").order("display_order"),
    supabase.from("gallery_items").select("*").order("display_order"),
    supabase.from("faqs").select("*").order("display_order"),
    supabase.from("audit_logs").select("id,entity_type,entity_id,action,created_at").order("created_at", { ascending: false }).limit(12),
  ]);
  const dbError = [settings, appointments, services, categories, staff, paymentMethods, expenses, incomes, hours, closures, recurring, expenseCategories, customers, staffSchedule, staffTimeOff, staffServices, testimonials, gallery, faqs, auditLogs].some((result) => result.error);
  if (dbError) return <main className="admin-page"><div className="notice-card"><strong>Panel verileri yüklenemedi</strong><p>Veritabanı kurulumu veya yönetici erişimini kontrol edin.</p></div></main>;
  return <AdminConsole
    userEmail={auth.user.email || ""}
    adminName={admin.full_name || auth.user.email || "Yönetici"}
    reportAsOf={now.toISOString()}
    initial={{ settings: settings.data, appointments: appointments.data ?? [], services: services.data ?? [], categories: categories.data ?? [], staff: staff.data ?? [], paymentMethods: paymentMethods.data ?? [], expenses: expenses.data ?? [], incomes: incomes.data ?? [], hours: hours.data ?? [], closures: closures.data ?? [], recurring: recurring.data ?? [], expenseCategories: expenseCategories.data ?? [], customers: customers.data ?? [], staffSchedule: staffSchedule.data ?? [], staffTimeOff: staffTimeOff.data ?? [], staffServices: staffServices.data ?? [], testimonials: testimonials.data ?? [], gallery: gallery.data ?? [], faqs: faqs.data ?? [], auditLogs: auditLogs.data ?? [] }}
  />;
}

type IncomeReportRow = {
  id: string;
  source: string;
  occurred_at: string;
  expected_amount: number;
  collected_amount: number;
  description: string;
  is_voided: boolean;
  staff_id: string | null;
  staff: { full_name: string } | { full_name: string }[] | null;
  payment_methods: { name: string } | { name: string }[] | null;
  income_transaction_services: Array<{ service_name_snapshot: string; quantity: number; amount: number }>;
};

async function fetchIncomeTransactions(supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>, from: string, to: string) {
  const rows: IncomeReportRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase
      .from("income_transactions")
      .select("id,source,occurred_at,expected_amount,collected_amount,description,is_voided,staff_id,staff(full_name),payment_methods(name),income_transaction_services(service_name_snapshot,quantity,amount)")
      .gte("occurred_at", from)
      .lte("occurred_at", to)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error) return result;
    rows.push(...((result.data ?? []) as IncomeReportRow[]));
    if ((result.data ?? []).length < pageSize) return { data: rows, error: null };
  }
}
