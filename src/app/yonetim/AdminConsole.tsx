"use client";

// Keep the untyped query boundary local until Supabase generates Database types for the fresh project.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronRight, CircleDollarSign, Clock3, KeyRound, LayoutDashboard, LogOut, Plus, Scissors, Settings2, Users, Wallet } from "lucide-react";
import { CustomerAccounts } from "./CustomerAccounts";
import { customerError, type CustomerAccount } from "@/lib/customer-accounts";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import type { SiteSettings } from "@/lib/types";
import { brandMonogram, formatDate, formatDuration, formatMoney, whatsappPhone } from "@/lib/format";

type AdminData = {
  settings: SiteSettings;
  appointments: Array<Record<string, any>>;
  services: Array<Record<string, any>>;
  categories: Array<Record<string, any>>;
  staff: Array<Record<string, any>>;
  paymentMethods: Array<Record<string, any>>;
  expenses: Array<Record<string, any>>;
  incomes: Array<Record<string, any>>;
  hours: Array<Record<string, any>>;
  closures: Array<Record<string, any>>;
  recurring: Array<Record<string, any>>;
  expenseCategories: Array<Record<string, any>>;
  customers: CustomerAccount[];
  staffSchedule: Array<Record<string, any>>;
  staffTimeOff: Array<Record<string, any>>;
  staffServices: Array<Record<string, any>>;
  testimonials: Array<Record<string, any>>;
  gallery: Array<Record<string, any>>;
  faqs: Array<Record<string, any>>;
  auditLogs: Array<Record<string, any>>;
};

const weekdayLabels = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const statusLabels: Record<string, string> = { pending: "Bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal", no_show: "Gelmedi" };
const slugify = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const currencyFor = (settings: SiteSettings) => settings.currency || "TRY";
function relation<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }

export function AdminConsole({ userEmail, adminName, reportAsOf, initial }: { userEmail: string; adminName: string; reportAsOf: string; initial: AdminData }) {
  const router = useRouter();
  const [section, setSection] = useState("overview");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [serviceForm, setServiceForm] = useState({ name: "", category_id: "", duration_minutes: "30", price: "", short_description: "", image_url: "", image_alt: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });
  const [staffForm, setStaffForm] = useState({ full_name: "", bio: "", phone: "", image_url: "", image_alt: "", service_ids: [] as string[] });
  const [expenseForm, setExpenseForm] = useState({ name: "", category_id: "", amount: "", occurred_on: new Date().toISOString().slice(0, 10), expense_type: "shop", description: "" });
  const [recurringForm, setRecurringForm] = useState({ name: "", category_id: "", amount: "", next_run_on: new Date().toISOString().slice(0, 10), frequency: "monthly", expense_type: "shop" });
  const [closureForm, setClosureForm] = useState({ date_start: "", date_end: "", reason: "" });
  const [scheduleForm, setScheduleForm] = useState({ staff_id: "", day_of_week: "1", is_working: true, start_time: "09:00", end_time: "18:00" });
  const [timeOffForm, setTimeOffForm] = useState({ staff_id: "", start_at: "", end_at: "", note: "" });
  const [settingsForm, setSettingsForm] = useState({ business_name: initial.settings.business_name, business_description: initial.settings.business_description || "", phone: initial.settings.phone || "", whatsapp_phone: initial.settings.whatsapp_phone || "", email: initial.settings.email || "", address: initial.settings.address || "", maps_url: initial.settings.maps_url || "", maps_embed_url: initial.settings.maps_embed_url || "", instagram_url: initial.settings.instagram_url || "", logo_url: initial.settings.logo_url || "", home_title: initial.settings.home_title, home_description: initial.settings.home_description, tagline: initial.settings.tagline, booking_interval_minutes: String(initial.settings.booking_interval_minutes), manage_changes_lock_hours: String(initial.settings.manage_changes_lock_hours), require_email: initial.settings.require_email, seo_title: initial.settings.seo_title || "", seo_description: initial.settings.seo_description || "", canonical_url: initial.settings.canonical_url || "", primary_color: initial.settings.primary_color, accent_color: initial.settings.accent_color, surface_color: initial.settings.surface_color, privacy_policy_text: initial.settings.privacy_policy_text || "" });

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const monthlyIncome = initial.incomes.filter((item) => !item.is_voided && String(item.occurred_at).slice(0, 7) === currentMonth).reduce((sum, item) => sum + Number(item.collected_amount || 0), 0);
  const monthlyExpenses = initial.expenses.filter((item) => String(item.occurred_on).slice(0, 7) === currentMonth).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: initial.settings.timezone || "Europe/Istanbul" });
  const todayAppointments = initial.appointments.filter((item) => new Date(item.starts_at).toLocaleDateString("en-CA", { timeZone: initial.settings.timezone || "Europe/Istanbul" }) === todayKey);
  const visibleAppointments = useMemo(() => initial.appointments.filter((item) => {
    const customer = relation(item.customers);
    const staff = relation(item.staff);
    const text = [item.code, customer?.first_name, customer?.last_name, customer?.phone, staff?.full_name].join(" ").toLocaleLowerCase("tr-TR");
    return text.includes(search.toLocaleLowerCase("tr-TR"));
  }), [initial.appointments, search]);

  async function perform(action: () => Promise<{ error?: { message?: string } | null }>, success: string) {
    setBusy(true); setMessage(""); setFailure("");
    try {
      const result = await action();
      if (result?.error) throw new Error(result.error.message || "İşlem tamamlanamadı.");
      setMessage(success); router.refresh();
    } catch (cause) { setFailure(cause instanceof Error ? customerError(cause.message) : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.replace("/yonetim/giris"); router.refresh();
  }

  async function addService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const db = createBrowserSupabase() as any;
    await perform(() => db.from("services").insert({ ...serviceForm, slug: slugify(serviceForm.name), duration_minutes: Number(serviceForm.duration_minutes), price: Number(serviceForm.price || 0), category_id: serviceForm.category_id || null, image_url: serviceForm.image_url || null }).select(), "Hizmet eklendi.");
    setServiceForm({ name: "", category_id: "", duration_minutes: "30", price: "", short_description: "", image_url: "", image_alt: "" });
  }

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    await perform(() => db.from("service_categories").insert({ ...categoryForm, slug: slugify(categoryForm.name) }), "Kategori eklendi.");
    setCategoryForm({ name: "", description: "" });
  }

  async function addStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const db = createBrowserSupabase() as any;
    setBusy(true); setMessage(""); setFailure("");
    const { data: member, error: createError } = await db.from("staff").insert({ full_name: staffForm.full_name, bio: staffForm.bio, phone: staffForm.phone || null, image_url: staffForm.image_url || null, image_alt: staffForm.image_alt }).select("id").single();
    if (createError || !member) { setFailure(createError?.message || "Personel eklenemedi."); setBusy(false); return; }
    const { error: linkError } = staffForm.service_ids.length ? await db.from("staff_services").insert(staffForm.service_ids.map((service_id) => ({ staff_id: member.id, service_id }))) : { error: null };
    setBusy(false);
    if (linkError) { setFailure("Personel oluşturuldu ancak hizmet eşleşmesi yapılamadı."); router.refresh(); return; }
    setMessage("Personel eklendi."); setStaffForm({ full_name: "", bio: "", phone: "", image_url: "", image_alt: "", service_ids: [] }); router.refresh();
  }

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    await perform(() => db.from("expenses").insert({ ...expenseForm, category_id: expenseForm.category_id || null, amount: Number(expenseForm.amount) }), "Gider kaydedildi.");
    setExpenseForm({ ...expenseForm, name: "", amount: "", description: "" });
  }

  async function addRecurring(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    await perform(() => db.from("recurring_expense_rules").insert({ ...recurringForm, category_id: recurringForm.category_id || null, amount: Number(recurringForm.amount), description_template: recurringForm.name + " · {month_name}" }), "Düzenli gider planlandı.");
    setRecurringForm({ ...recurringForm, name: "", amount: "" });
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    await perform(() => db.from("site_settings").update({ ...settingsForm, booking_interval_minutes: Number(settingsForm.booking_interval_minutes), manage_changes_lock_hours: Number(settingsForm.manage_changes_lock_hours), updated_at: new Date().toISOString() }).eq("id", 1), "İşletme ayarları kaydedildi.");
  }

  async function saveHours(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    const form = new FormData(event.currentTarget);
    const changes = initial.hours.map((row) => {
      const day = String(row.day_of_week);
      const isOpen = form.get(`open-${day}`) === "on";
      return { day_of_week: Number(day), is_open: isOpen, opening_time: isOpen ? String(form.get(`start-${day}`) || "09:00") : null, closing_time: isOpen ? String(form.get(`end-${day}`) || "18:00") : null };
    });
    await perform(() => db.from("business_hours").upsert(changes, { onConflict: "day_of_week" }), "Çalışma saatleri güncellendi.");
  }

  async function addClosure(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    await perform(() => db.from("business_closures").insert(closureForm), "Kapalı gün eklendi.");
    setClosureForm({ date_start: "", date_end: "", reason: "" });
  }

  async function saveStaffSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    await perform(() => db.from("staff_schedule").upsert({ staff_id: scheduleForm.staff_id, day_of_week: Number(scheduleForm.day_of_week), is_working: scheduleForm.is_working, start_time: scheduleForm.is_working ? scheduleForm.start_time : null, end_time: scheduleForm.is_working ? scheduleForm.end_time : null }, { onConflict: "staff_id,day_of_week" }), "Personel çalışma aralığı kaydedildi.");
  }

  async function addStaffTimeOff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const db = createBrowserSupabase() as any;
    await perform(() => db.from("staff_time_off").insert({ ...timeOffForm, start_at: new Date(timeOffForm.start_at).toISOString(), end_at: new Date(timeOffForm.end_at).toISOString() }), "Personel izni eklendi.");
    setTimeOffForm({ staff_id: "", start_at: "", end_at: "", note: "" });
  }

  const navItems = [
    ["overview", "Genel bakış", LayoutDashboard], ["appointments", "Randevular", CalendarDays],
    ["services", "Hizmetler", Scissors], ["staff", "Personel", Users], ["customers", "Müşteri kitlesi", Users],
    ["availability", "Çalışma saatleri", Clock3], ["finance", "Gelir ve gider", Wallet],
    ["content", "Site içerikleri", Settings2], ["settings", "İşletme ayarları", Settings2],
  ] as const;

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/"><span className="brand-mark">{brandMonogram(initial.settings.business_name)}</span><span>{initial.settings.business_name}<small>YÖNETİM</small></span></Link>
      <div className="admin-nav-label">PANEL</div>
      <nav className="admin-nav">{navItems.map(([key, title, Icon]) => <button className={section === key ? "is-active" : ""} key={key} onClick={() => setSection(key)}><Icon size={17} /><span>{title}</span>{section === key && <ChevronRight size={14} />}</button>)}</nav>
      <div className="admin-sidebar-bottom"><span className="admin-avatar">{adminName.trim().slice(0, 1).toUpperCase()}</span><span className="admin-user-name">{adminName}<small>{userEmail}</small></span><button aria-label="Çıkış yap" title="Çıkış yap" onClick={signOut}><LogOut size={16} /></button></div>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar"><div><span className="eyebrow"><span className="eyebrow-line" /> {new Intl.DateTimeFormat("tr-TR", { dateStyle: "full", timeZone: initial.settings.timezone || "Europe/Istanbul" }).format(now)}</span><h1>{navItems.find(([key]) => key === section)?.[1]}</h1></div><Link className="button button-outline" href="/" target="_blank" rel="noreferrer">Siteyi görüntüle <ChevronRight size={15} /></Link></header>
      {(message || failure) && <div className={failure ? "admin-alert is-error" : "admin-alert"} role="status">{failure || message}</div>}
      {section === "overview" && <Overview data={initial} todayKey={todayKey} todayAppointments={todayAppointments} monthlyIncome={monthlyIncome} monthlyExpenses={monthlyExpenses} />}
      {section === "appointments" && <Appointments data={initial} rows={visibleAppointments} search={search} onSearch={setSearch} perform={perform} />}
      {section === "services" && <Services data={initial} form={serviceForm} setForm={setServiceForm} categoryForm={categoryForm} setCategoryForm={setCategoryForm} onSubmit={addService} onCategory={addCategory} perform={perform} busy={busy} />}
      {section === "staff" && <><StaffPerformance data={initial} reportAsOf={reportAsOf} /><Staff data={initial} form={staffForm} setForm={setStaffForm} onSubmit={addStaff} perform={perform} busy={busy} /></>}
      {section === "customers" && <CustomerAccounts customers={initial.customers} options={{
        services: initial.services.map(s => ({ id:s.id,name:s.name,price:Number(s.price),is_active:s.is_active })),
        staff: initial.staff.map(s => ({ id:s.id,name:s.full_name })),
        methods: initial.paymentMethods.map(m => ({ id:m.id,name:m.name,is_active:m.is_active })),
        currency: currencyFor(initial.settings), timezone: initial.settings.timezone || "Europe/Istanbul",
      }} />}
      {section === "availability" && <Availability data={initial} onHours={saveHours} closureForm={closureForm} setClosureForm={setClosureForm} onClosure={addClosure} scheduleForm={scheduleForm} setScheduleForm={setScheduleForm} onStaffSchedule={saveStaffSchedule} timeOffForm={timeOffForm} setTimeOffForm={setTimeOffForm} onTimeOff={addStaffTimeOff} perform={perform} />}
      {section === "finance" && <Finance data={initial} expenseForm={expenseForm} setExpenseForm={setExpenseForm} recurringForm={recurringForm} setRecurringForm={setRecurringForm} onExpense={addExpense} onRecurring={addRecurring} perform={perform} busy={busy} />}
      {section === "content" && <SiteContent data={initial} perform={perform} />}
      {section === "settings" && <><Settings form={settingsForm} setForm={setSettingsForm} onSubmit={saveSettings} busy={busy} /><PasswordChange /></>}
    </section>
  </main>;
}

function Overview({ data, todayKey, todayAppointments, monthlyIncome, monthlyExpenses }: { data: AdminData; todayKey: string; todayAppointments: any[]; monthlyIncome: number; monthlyExpenses: number }) {
  const pending = data.appointments.filter((item) => item.status === "pending" || item.status === "confirmed").length;
  return <>
    <div className="admin-kpis"><Kpi label="Bugünkü randevu" value={String(todayAppointments.length)} icon={<CalendarDays />} note={todayKey.split("-").reverse().join(".")} /><Kpi label="Bu ay tahsilat" value={formatMoney(monthlyIncome, currencyFor(data.settings))} icon={<CircleDollarSign />} note="Gerçekleşen gelir" /><Kpi label="Bu ay gider" value={formatMoney(monthlyExpenses, currencyFor(data.settings))} icon={<Wallet />} note="Kaydedilen işletme gideri" /><Kpi label="Yaklaşan randevu" value={String(pending)} icon={<Clock3 />} note="Panelde görünen dönem" /></div>
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> BUGÜNÜN AKIŞI</span><h2>Randevular</h2></div><span className="admin-count">{todayAppointments.length} kayıt</span></div><AppointmentTable rows={todayAppointments} data={data} compact /></section>
          <div className="admin-two-column"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> SON TAHSİLATLAR</span><h2>Gelir hareketleri</h2></div></div>{data.incomes.slice(0,5).map((item) => <div className="admin-list-row" key={item.id}><span><strong>{item.description || (item.source === "appointment" ? "Randevu" : "Gelir")}</strong><small>{formatDate(String(item.occurred_at).slice(0,10))}</small></span><b>{formatMoney(item.collected_amount, currencyFor(data.settings))}</b></div>)}{!data.incomes.length && <p className="admin-empty">Henüz tahsilat kaydı bulunmuyor.</p>}</section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> KULLANIM</span><h2>İşletme kapasitesi</h2></div></div><div className="capacity-row"><span>Aktif hizmet</span><b>{data.services.filter((row) => row.is_active).length}</b></div><div className="capacity-row"><span>Aktif personel</span><b>{data.staff.filter((row) => row.is_active).length}</b></div><div className="capacity-row"><span>Bu ay net hareket</span><b className={monthlyIncome - monthlyExpenses >= 0 ? "positive" : "negative"}>{formatMoney(monthlyIncome - monthlyExpenses, currencyFor(data.settings))}</b></div></section></div>
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> DENETİM GEÇMİŞİ</span><h2>Son değişiklikler</h2></div></div>{data.auditLogs.map((row) => <div className="admin-list-row" key={row.id}><span><strong>{row.entity_type} · {row.action}</strong><small>{row.entity_id || "kayıt"} · {formatDate(String(row.created_at).slice(0,10))}</small></span></div>)}{!data.auditLogs.length && <p className="admin-empty">İşlem geçmişi henüz boş.</p>}</section>
  </>;
}

function Kpi({ label, value, icon, note }: { label: string; value: string; icon: React.ReactNode; note: string }) { return <article className="admin-kpi"><span className="admin-kpi-icon">{icon}</span><small>{label}</small><strong>{value}</strong><span>{note}</span></article>; }

function Appointments({ data, rows, search, onSearch, perform }: { data: AdminData; rows: any[]; search: string; onSearch: (value: string) => void; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> RANDEVU DEFTERİ</span><h2>Randevuları yönetin</h2></div><span className="admin-count">{rows.length} kayıt</span></div><label className="admin-search">Ara<input placeholder="Kod, müşteri, telefon veya personel" value={search} onChange={(event) => onSearch(event.target.value)} /></label><AppointmentTable rows={rows} data={data} perform={perform} /></section>;
}

function AppointmentTable({ rows, data, compact = false, perform }: { rows: any[]; data: AdminData; compact?: boolean; perform?: (action: () => Promise<any>, success: string) => Promise<void> }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Randevu</th><th>Müşteri</th><th>Hizmet / personel</th><th>Tarih</th><th>Ücret</th><th>Durum</th>{!compact && <th>İşlem</th>}</tr></thead><tbody>{rows.map((item) => {
    const customer = relation(item.customers); const staff = relation(item.staff); const services = item.appointment_services || [];
    return <tr key={item.id}><td><strong>{item.code}</strong></td><td>{customer?.first_name} {customer?.last_name}<small>{customer?.phone}</small></td><td>{services.map((service: any) => service.service_name_snapshot).join(", ")}<small>{staff?.full_name}</small></td><td>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: data.settings.timezone || "Europe/Istanbul" }).format(new Date(item.starts_at))}</td><td>{formatMoney(item.quoted_total, currencyFor(data.settings))}</td><td><span className={`status-pill status-${item.status}`}>{statusLabels[item.status] || item.status}</span></td>{!compact && <td><AppointmentActions item={item} customer={customer} data={data} perform={perform} /></td>}</tr>;
  })}</tbody></table>{!rows.length && <p className="admin-empty">Bu dönemde randevu kaydı bulunmuyor.</p>}</div>;
}

function AppointmentActions({ item, customer, data, perform }: { item: any; customer: any; data: AdminData; perform?: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [paymentMethodId, setPaymentMethodId] = useState(data.paymentMethods.find((method) => method.is_active)?.id || "");
  const phone = customer?.phone ? whatsappPhone(customer.phone) : "";
  const start = new Date(item.starts_at);
  const date = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: data.settings.timezone || "Europe/Istanbul" }).format(start);
  const time = new Intl.DateTimeFormat("tr-TR", { timeStyle: "short", timeZone: data.settings.timezone || "Europe/Istanbul" }).format(start);
  const message = `Merhaba ${customer?.first_name || ""}, ${data.settings.business_name} randevunuz ${date} saat ${time} için planlandı. Kodunuz: ${item.code}.`;
  return <div className="appointment-actions">
    <select aria-label="Randevu durumu" defaultValue={item.status} onChange={(event) => {
      const status = event.target.value;
      if (!perform) return;
      if (status === "completed" && relation(item.customer_invoices)?.id) {
        void perform(() => db.from("appointments").update({ status, updated_at:new Date().toISOString() }).eq("id",item.id), "Randevu tamamlandı. Tahsilatlar müşteri kartındaki adisyondan yönetilir.");
      } else if (status === "completed") {
        if (!paymentMethodId) { window.alert("Tamamlanan randevu için ödeme yöntemi seçin."); return; }
        const collected = window.prompt("Tahsil edilen tutar", String(item.quoted_total));
        if (collected === null || !Number.isFinite(Number(collected)) || Number(collected) < 0) return;
        void perform(() => db.from("appointments").update({ status, payment_method_id: paymentMethodId, collected_total: Number(collected), updated_at: new Date().toISOString() }).eq("id", item.id), "Randevu tamamlandı; tahsilat rapora eklendi.");
      } else void perform(() => db.from("appointments").update({ status, updated_at: new Date().toISOString() }).eq("id", item.id), "Randevu durumu güncellendi.");
    }}><option value="pending">Bekliyor</option><option value="confirmed">Onaylandı</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option><option value="no_show">Gelmedi</option></select>
    <select aria-label="Ödeme yöntemi" value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}><option value="">Ödeme yöntemi</option>{data.paymentMethods.filter((method) => method.is_active).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select>
    {phone && (item.status === "pending" || item.status === "confirmed") && <a className="whatsapp-reminder" href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp hatırlat</a>}
  </div>;
}

function Services({ data, form, setForm, categoryForm, setCategoryForm, onSubmit, onCategory, perform, busy }: { data: AdminData; form: any; setForm: (value: any) => void; categoryForm: any; setCategoryForm: (value: any) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCategory: (event: React.FormEvent<HTMLFormElement>) => void; perform: (action: () => Promise<any>, success: string) => Promise<void>; busy: boolean }) {
  return <div className="admin-manage-grid">
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> KATALOĞUNUZ</span><h2>Hizmetler</h2></div><span className="admin-count">{data.services.length}</span></div>
      {data.services.map((service) => <ServiceEditor key={service.id} service={service} categories={data.categories} settings={data.settings} perform={perform} />)}
      {!data.services.length && <p className="admin-empty">Hizmet eklediğinizde randevu akışında yayınlanır.</p>}
    </section>
    <div className="admin-column-stack">
      <form className="admin-panel admin-form" onSubmit={onSubmit}><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> YENİ KAYIT</span><h2>Hizmet ekle</h2></div></div>
        <label>Hizmet adı<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Kategori<select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">Kategorisiz</option>{data.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <div className="admin-form-inline"><label>Süre (dk)<input type="number" min="5" max="720" required value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></label><label>Fiyat<input type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label></div>
        <label>Kısa açıklama<input value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} /></label><MediaUpload folder="services" onUploaded={(url) => setForm({ ...form, image_url: url })} /><label>Görsel URL<input type="url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></label><label>Görsel alt metni<input value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} /></label>
        <button className="button button-dark" disabled={busy}><Plus size={15} /> Hizmeti kaydet</button>
      </form>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> KATEGORİLER</span><h2>Hizmet grupları</h2></div></div>
        {data.categories.map((category) => <CategoryEditor key={category.id} category={category} perform={perform} />)}
        <form className="admin-inline-create" onSubmit={onCategory}><label>Yeni kategori<input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} /></label><button className="button button-outline"><Plus size={14} /> Ekle</button></form>
      </section>
    </div>
  </div>;
}

function ServiceEditor({ service, categories, settings, perform }: { service: any; categories: any[]; settings: SiteSettings; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [form, setForm] = useState({ name: service.name, category_id: service.category_id || "", duration_minutes: String(service.duration_minutes), price: String(service.price), short_description: service.short_description || "", description: service.description || "", image_url: service.image_url || "", image_alt: service.image_alt || "" });
  return <details className="admin-record-editor"><summary><span><strong>{service.name}</strong><small>{formatDuration(service.duration_minutes)} · {formatMoney(service.price, currencyFor(settings))}</small></span><span className={service.is_active ? "status-pill status-confirmed" : "status-pill"}>{service.is_active ? "Yayında" : "Gizli"}</span></summary>
    <form className="admin-form admin-record-form" onSubmit={(event) => { event.preventDefault(); void perform(() => db.from("services").update({ ...form, slug: slugify(form.name), category_id: form.category_id || null, duration_minutes: Number(form.duration_minutes), price: Number(form.price), image_url: form.image_url || null }).eq("id", service.id), "Hizmet güncellendi."); }}>
      <label>Ad<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Kategori<select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">Kategorisiz</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="admin-form-inline"><label>Süre (dk)<input type="number" min="5" max="720" required value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></label><label>Fiyat<input type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label></div>
      <label>Kısa açıklama<input value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} /></label><label>Detay açıklaması<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><MediaUpload folder="services" onUploaded={(url) => setForm({ ...form, image_url: url })} /><label>Görsel URL<input type="url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></label><label>Görsel alt metni<input value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} /></label>
      <div className="admin-record-actions"><button className="button button-dark"><Check size={14} /> Kaydet</button><button type="button" className="admin-text-button" onClick={() => void perform(() => db.from("services").update({ is_active: !service.is_active }).eq("id", service.id), service.is_active ? "Hizmet gizlendi." : "Hizmet yayınlandı.")}>{service.is_active ? "Gizle" : "Yayınla"}</button><button type="button" className="admin-text-button is-danger" onClick={() => window.confirm("Bu hizmeti arşivleyelim mi? Eski randevular korunur.") && void perform(() => db.from("services").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", service.id), "Hizmet arşivlendi.")}>Arşivle</button></div>
    </form>
  </details>;
}

function CategoryEditor({ category, perform }: { category: any; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [name, setName] = useState(category.name);
  return <form className="admin-inline-edit" onSubmit={(event) => { event.preventDefault(); void perform(() => db.from("service_categories").update({ name, slug: slugify(name) }).eq("id", category.id), "Kategori güncellendi."); }}><input aria-label="Kategori adı" value={name} onChange={(event) => setName(event.target.value)} /><button className="admin-text-button">Kaydet</button><button type="button" className="admin-icon-button" aria-label="Kategoriyi gizle" onClick={() => void perform(() => db.from("service_categories").update({ is_active: !category.is_active }).eq("id", category.id), category.is_active ? "Kategori gizlendi." : "Kategori yayınlandı.")}>{category.is_active ? "◌" : "●"}</button></form>;
}

function Staff({ data, form, setForm, onSubmit, perform, busy }: { data: AdminData; form: any; setForm: (value: any) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; perform: (action: () => Promise<any>, success: string) => Promise<void>; busy: boolean }) {
  return <div className="admin-manage-grid">
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> EKİBİNİZ</span><h2>Personel</h2></div><span className="admin-count">{data.staff.length}</span></div>
      {data.staff.map((member) => <StaffEditor key={member.id} member={member} services={data.services} linkedServiceIds={data.staffServices.filter((link) => link.staff_id === member.id).map((link) => link.service_id)} perform={perform} />)}
      {!data.staff.length && <p className="admin-empty">Personel eklediğinizde randevu alırken seçilebilir olur.</p>}
    </section>
    <form className="admin-panel admin-form" onSubmit={onSubmit}><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> PERSONEL KAYDI</span><h2>Ekibe kat</h2></div></div>
      <label>Ad soyad<input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label><label>Kısa tanıtım<input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label><label>Telefon<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><MediaUpload folder="staff" onUploaded={(url) => setForm({ ...form, image_url: url })} /><label>Görsel URL<input type="url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></label><label>Görsel alt metni<input value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} /></label>
      <fieldset className="admin-checkbox-list"><legend>Sunabildiği hizmetler</legend>{data.services.filter((service) => service.is_active).map((service) => <label key={service.id}><input type="checkbox" checked={form.service_ids.includes(service.id)} onChange={(e) => setForm({ ...form, service_ids: e.target.checked ? [...form.service_ids, service.id] : form.service_ids.filter((id: string) => id !== service.id) })} />{service.name}</label>)}</fieldset>
      <button className="button button-dark" disabled={busy}><Plus size={15} /> Personel ekle</button>
    </form>
  </div>;
}

function StaffPerformance({ data, reportAsOf }: { data: AdminData; reportAsOf: string }) {
  const [rangeDays, setRangeDays] = useState(30);
  const report = useMemo(() => {
    const byStaff = new Map<string, { id: string; name: string; revenue: number; serviceCount: number; appointmentCount: number; services: Map<string, number> }>();
    data.staff.forEach((member) => byStaff.set(member.id, { id: member.id, name: member.full_name, revenue: 0, serviceCount: 0, appointmentCount: 0, services: new Map() }));
    const asOf = Date.parse(reportAsOf);
    const cutoff = asOf - rangeDays * 24 * 60 * 60 * 1000;
    let unassignedRevenue = 0;
    const countedDocuments = new Set<string>();
    let appointmentRevenue = 0;
    data.incomes.filter((row) => !row.is_voided && new Date(row.occurred_at).getTime() >= cutoff && new Date(row.occurred_at).getTime() <= asOf).forEach((row) => {
      const revenue = Number(row.collected_amount || 0);
      if (!row.staff_id) { unassignedRevenue += revenue; return; }
      const staff = relation(row.staff);
      const entry = byStaff.get(row.staff_id) || { id: row.staff_id, name: staff?.full_name || "Personel kaydı yok", revenue: 0, serviceCount: 0, appointmentCount: 0, services: new Map<string, number>() };
      entry.name = staff?.full_name || entry.name;
      entry.revenue += revenue;
      const invoicePayment = relation(row.customer_invoice_payments);
      const linkedAppointment = relation(invoicePayment?.customer_invoices)?.appointment_id;
      const documentId = invoicePayment?.invoice_id || row.appointment_id || row.id;
      const isAppointment = row.source === "appointment" || Boolean(linkedAppointment);
      if (isAppointment) appointmentRevenue += revenue;
      if (!countedDocuments.has(documentId)) {
        countedDocuments.add(documentId);
        if (isAppointment) entry.appointmentCount += 1;
        (row.income_transaction_services || []).forEach((service: any) => {
        const quantity = Number(service.quantity || 1);
        entry.serviceCount += quantity;
        const name = service.service_name_snapshot || "Hizmet";
        entry.services.set(name, (entry.services.get(name) || 0) + quantity);
        });
      }
      byStaff.set(row.staff_id, entry);
    });
    const rows = [...byStaff.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "tr"));
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const appointmentCount = rows.reduce((sum, row) => sum + row.appointmentCount, 0);
    return { rows, totalRevenue, appointmentCount, appointmentRevenue, serviceCount: rows.reduce((sum, row) => sum + row.serviceCount, 0), unassignedRevenue };
  }, [data.incomes, data.staff, rangeDays, reportAsOf]);
  const maxRevenue = Math.max(0, ...report.rows.map((row) => row.revenue));
  const maxServices = Math.max(0, ...report.rows.map((row) => row.serviceCount));
  const periodLabel = rangeDays === 365 ? "Son 12 ay" : `Son ${rangeDays} gün`;

  return <>
    <section className="admin-panel staff-performance-panel">
      <div className="admin-panel-heading staff-report-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> PERSONEL PERFORMANSI</span><h2>Personel raporu</h2></div><label className="staff-report-period">Dönem<select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}><option value={7}>Son 7 gün</option><option value={30}>Son 30 gün</option><option value={90}>Son 90 gün</option><option value={365}>Son 12 ay</option></select></label></div>
      <div className="admin-kpis staff-report-kpis"><Kpi label="Personele yazılan ciro" value={formatMoney(report.totalRevenue, currencyFor(data.settings))} icon={<CircleDollarSign />} note={periodLabel} /><Kpi label="Yapılan hizmet" value={String(report.serviceCount)} icon={<Scissors />} note="Tamamlanan kayıtlardan" /><Kpi label="Tamamlanan randevu" value={String(report.appointmentCount)} icon={<CalendarDays />} note={periodLabel} /><Kpi label="Ort. randevu tahsilatı" value={formatMoney(report.appointmentCount ? report.appointmentRevenue / report.appointmentCount : 0, currencyFor(data.settings))} icon={<Users />} note="Personel ataması olanlar" /></div>
      <div className="staff-report-charts">
        <section className="staff-chart-card"><h3>Personel başına tahsilat</h3><p>Seçilen dönemde personele bağlanan fiilî tahsilat</p>{report.rows.length ? <div className="staff-chart-list" role="list">{report.rows.map((row) => <div className="staff-chart-row" role="listitem" key={row.id} aria-label={`${row.name}: ${formatMoney(row.revenue, currencyFor(data.settings))}`}><strong title={row.name}>{row.name}</strong><span className="staff-chart-track"><span className="staff-chart-fill" style={{ width: `${maxRevenue ? row.revenue / maxRevenue * 100 : 0}%` }} /></span><b>{formatMoney(row.revenue, currencyFor(data.settings))}</b></div>)}</div> : <p className="admin-empty">Bu dönemde tahsilat bulunmuyor.</p>}</section>
        <section className="staff-chart-card"><h3>Yapılan hizmet sayısı</h3><p>Randevularda kaydedilmiş hizmet adetleri</p>{report.rows.length ? <div className="staff-chart-list" role="list">{report.rows.map((row) => <div className="staff-chart-row" role="listitem" key={row.id} aria-label={`${row.name}: ${row.serviceCount} hizmet`}><strong title={row.name}>{row.name}</strong><span className="staff-chart-track"><span className="staff-chart-fill staff-chart-fill-secondary" style={{ width: `${maxServices ? row.serviceCount / maxServices * 100 : 0}%` }} /></span><b>{row.serviceCount}</b></div>)}</div> : <p className="admin-empty">Bu dönemde tamamlanmış hizmet yok.</p>}</section>
      </div>
      <div className="admin-table-wrap staff-performance-table-wrap"><table className="admin-table staff-performance-table"><thead><tr><th>Personel</th><th>Tahsilat</th><th>Tamamlanan randevu</th><th>Yapılan hizmet</th><th>En sık yaptığı hizmetler</th></tr></thead><tbody>{report.rows.map((row) => { const topServices = [...row.services.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2); return <tr key={row.id}><td><strong>{row.name}</strong></td><td>{formatMoney(row.revenue, currencyFor(data.settings))}</td><td>{row.appointmentCount}</td><td>{row.serviceCount}</td><td>{topServices.length ? topServices.map(([name, count]) => `${name} (${count})`).join(" · ") : "Henüz yok"}</td></tr>; })}</tbody></table></div>
      <p className="staff-report-note">Ciro, seçilen dönemde personele bağlı kayıtlardaki fiilî tahsilattır; kâr hesabı değildir.{report.unassignedRevenue > 0 && <> Personel ataması yapılmamış genel tahsilat: <strong>{formatMoney(report.unassignedRevenue, currencyFor(data.settings))}</strong>.</>}</p>
    </section>
  </>;
}

function StaffEditor({ member, services, linkedServiceIds, perform }: { member: any; services: any[]; linkedServiceIds: string[]; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [form, setForm] = useState({ full_name: member.full_name, bio: member.bio || "", phone: member.phone || "", image_url: member.image_url || "", image_alt: member.image_alt || "" });
  const [serviceIds, setServiceIds] = useState(linkedServiceIds);
  return <details className="admin-record-editor"><summary><span><strong>{member.full_name}</strong><small>{member.bio || "Personel profili"}</small></span><span className={member.is_active ? "status-pill status-confirmed" : "status-pill"}>{member.is_active ? "Aktif" : "Gizli"}</span></summary>
    <form className="admin-form admin-record-form" onSubmit={(event) => { event.preventDefault(); void perform(async () => { const staffResult = await db.from("staff").update({ ...form, image_url: form.image_url || null }).eq("id", member.id); if (staffResult.error) return staffResult; return db.rpc("set_staff_services", { p_staff_id: member.id, p_service_ids: serviceIds }); }, "Personel profili ve hizmet eşleşmesi kaydedildi."); }}>
      <label>Ad soyad<input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label><label>Tanıtım<input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label><label>Telefon<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><MediaUpload folder="staff" onUploaded={(url) => setForm({ ...form, image_url: url })} /><label>Görsel URL<input type="url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></label><label>Görsel alt metni<input value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} /></label>
      <fieldset className="admin-checkbox-list"><legend>Sunabildiği hizmetler</legend>{services.filter((service) => service.is_active).map((service) => <label key={service.id}><input type="checkbox" checked={serviceIds.includes(service.id)} onChange={(e) => setServiceIds((current) => e.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))} />{service.name}</label>)}</fieldset>
      <div className="admin-record-actions"><button className="button button-dark"><Check size={14} /> Kaydet</button><button type="button" className="admin-text-button" onClick={() => void perform(() => db.from("staff").update({ is_active: !member.is_active }).eq("id", member.id), member.is_active ? "Personel gizlendi." : "Personel aktif edildi.")}>{member.is_active ? "Gizle" : "Aktifleştir"}</button><button type="button" className="admin-text-button is-danger" onClick={() => window.confirm("Bu personeli arşivleyelim mi? Geçmiş randevular korunur.") && void perform(() => db.from("staff").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", member.id), "Personel arşivlendi.")}>Arşivle</button></div>
    </form>
  </details>;
}


function Availability({ data, onHours, closureForm, setClosureForm, onClosure, scheduleForm, setScheduleForm, onStaffSchedule, timeOffForm, setTimeOffForm, onTimeOff, perform }: { data: AdminData; onHours: (event: React.FormEvent<HTMLFormElement>) => void; closureForm: any; setClosureForm: (value: any) => void; onClosure: (event: React.FormEvent<HTMLFormElement>) => void; scheduleForm: any; setScheduleForm: (value: any) => void; onStaffSchedule: (event: React.FormEvent<HTMLFormElement>) => void; timeOffForm: any; setTimeOffForm: (value: any) => void; onTimeOff: (event: React.FormEvent<HTMLFormElement>) => void; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const formatDateTime = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: data.settings.timezone || "Europe/Istanbul" }).format(new Date(value));
  return <>
    <div className="admin-two-column admin-manage-grid">
      <form className="admin-panel admin-form" onSubmit={onHours}>
        <div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> HAFTALIK PLAN</span><h2>İşletme saatleri</h2></div></div>
        <div className="hours-list">{weekdayLabels.map((label, index) => { const day = index + 1; const row = data.hours.find((item) => item.day_of_week === day); return <div className="hours-row" key={day}><label className="hours-day"><input type="checkbox" name={`open-${day}`} defaultChecked={row?.is_open || false} />{label}</label><input aria-label={`${label} açılış`} name={`start-${day}`} type="time" defaultValue={row?.opening_time?.slice(0,5) || "09:00"} /><span>—</span><input aria-label={`${label} kapanış`} name={`end-${day}`} type="time" defaultValue={row?.closing_time?.slice(0,5) || "18:00"} /></div>; })}</div>
        <button className="button button-dark"><Check size={15} /> Saatleri kaydet</button>
      </form>
      <form className="admin-panel admin-form" onSubmit={onStaffSchedule}>
        <div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> PERSONEL TAKVİMİ</span><h2>Haftalık vardiya</h2></div></div>
        <label>Personel<select required value={scheduleForm.staff_id} onChange={(e) => setScheduleForm({ ...scheduleForm, staff_id: e.target.value })}><option value="">Seçin</option>{data.staff.map((member) => <option value={member.id} key={member.id}>{member.full_name}</option>)}</select></label>
        <label>Gün<select value={scheduleForm.day_of_week} onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: e.target.value })}>{weekdayLabels.map((label, index) => <option key={index + 1} value={index + 1}>{label}</option>)}</select></label>
        <label className="settings-checkbox"><input type="checkbox" checked={scheduleForm.is_working} onChange={(e) => setScheduleForm({ ...scheduleForm, is_working: e.target.checked })} />Bu gün çalışıyor</label>
        {scheduleForm.is_working && <div className="admin-form-inline"><label>Başlangıç<input type="time" required value={scheduleForm.start_time} onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} /></label><label>Bitiş<input type="time" required value={scheduleForm.end_time} onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} /></label></div>}
        <button className="button button-dark"><Check size={15} /> Vardiyayı kaydet</button>
        <div className="admin-simple-list">{data.staffSchedule.map((row) => <div className="admin-list-row" key={row.staff_id + row.day_of_week}><span><strong>{data.staff.find((member) => member.id === row.staff_id)?.full_name} · {weekdayLabels[row.day_of_week - 1]}</strong><small>{row.is_working ? `${String(row.start_time).slice(0,5)} — ${String(row.end_time).slice(0,5)}` : "Çalışmıyor"}</small></span><button className="admin-icon-button" aria-label="Vardiya kuralını kaldır" onClick={() => void perform(() => db.from("staff_schedule").delete().eq("staff_id", row.staff_id).eq("day_of_week", row.day_of_week), "Vardiya kuralı kaldırıldı.")}>×</button></div>)}{!data.staffSchedule.length && <p className="admin-empty">Personel ayarı yoksa genel işletme saatleri kullanılır.</p>}</div>
      </form>
    </div>
    <div className="admin-two-column admin-manage-grid">
      <form className="admin-panel admin-form" onSubmit={onClosure}>
        <div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> TATİL / KAPANIŞ</span><h2>İşletmeyi kapat</h2></div></div>
        <div className="admin-form-inline"><label>Başlangıç<input required type="date" value={closureForm.date_start} onChange={(e) => setClosureForm({ ...closureForm, date_start: e.target.value })} /></label><label>Bitiş<input required type="date" min={closureForm.date_start || undefined} value={closureForm.date_end} onChange={(e) => setClosureForm({ ...closureForm, date_end: e.target.value })} /></label></div>
        <label>Neden<input value={closureForm.reason} onChange={(e) => setClosureForm({ ...closureForm, reason: e.target.value })} placeholder="Resmî tatil" /></label><button className="button button-dark"><Plus size={15} /> Tarih ekle</button>
        {data.closures.map((row) => <div className="admin-list-row" key={row.id}><span><strong>{formatDate(row.date_start)}{row.date_end !== row.date_start ? ` — ${formatDate(row.date_end)}` : ""}</strong><small>{row.reason || "İşletme kapalı"}</small></span><button type="button" className="admin-icon-button" aria-label="Kapalı günü sil" onClick={() => void perform(() => db.from("business_closures").delete().eq("id", row.id), "Kapalı gün kaldırıldı.")}>×</button></div>)}
      </form>
      <div className="admin-column-stack">
        <form className="admin-panel admin-form" onSubmit={onTimeOff}>
          <div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> İZİN / UYGUN DEĞİL</span><h2>Personel izni ekle</h2></div></div>
          <label>Personel<select required value={timeOffForm.staff_id} onChange={(e) => setTimeOffForm({ ...timeOffForm, staff_id: e.target.value })}><option value="">Seçin</option>{data.staff.map((member) => <option value={member.id} key={member.id}>{member.full_name}</option>)}</select></label>
          <div className="admin-form-inline"><label>Başlangıç<input required type="datetime-local" value={timeOffForm.start_at} onChange={(e) => setTimeOffForm({ ...timeOffForm, start_at: e.target.value })} /></label><label>Bitiş<input required type="datetime-local" min={timeOffForm.start_at || undefined} value={timeOffForm.end_at} onChange={(e) => setTimeOffForm({ ...timeOffForm, end_at: e.target.value })} /></label></div>
          <label>Not<input value={timeOffForm.note} onChange={(e) => setTimeOffForm({ ...timeOffForm, note: e.target.value })} placeholder="Yıllık izin" /></label><button className="button button-dark"><Plus size={15} /> İzni kaydet</button>
          {data.staffTimeOff.map((row) => <div className="admin-list-row" key={row.id}><span><strong>{data.staff.find((member) => member.id === row.staff_id)?.full_name}</strong><small>{formatDateTime(row.start_at)} — {formatDateTime(row.end_at)}{row.note ? ` · ${row.note}` : ""}</small></span><button type="button" className="admin-icon-button" aria-label="İzni sil" onClick={() => void perform(() => db.from("staff_time_off").delete().eq("id", row.id), "Personel izni kaldırıldı.")}>×</button></div>)}
        </form>
      </div>
    </div>
  </>;
}

function Finance({ data, expenseForm, setExpenseForm, recurringForm, setRecurringForm, onExpense, onRecurring, perform, busy }: { data: AdminData; expenseForm: any; setExpenseForm: (value: any) => void; recurringForm: any; setRecurringForm: (value: any) => void; onExpense: (event: React.FormEvent<HTMLFormElement>) => void; onRecurring: (event: React.FormEvent<HTMLFormElement>) => void; perform: (action: () => Promise<any>, success: string) => Promise<void>; busy: boolean }) {
  const db = createBrowserSupabase() as any;
  const dbCategories = data.expenseCategories || [];
  const [manualIncome, setManualIncome] = useState({ customer_id: "", description: "", amount: "", payment_method_id: data.paymentMethods.find((row) => row.is_active)?.id || "", staff_id: "", occurred_on: new Date().toISOString().slice(0,10) });
  const [visibleIncomeCount, setVisibleIncomeCount] = useState(20);
  const [paymentForm, setPaymentForm] = useState({ name: "", kind: "cash" });
  const [expenseCategoryForm, setExpenseCategoryForm] = useState({ name: "", expense_type: "shop" });
  const month = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: data.settings.timezone || "Europe/Istanbul" }).format(new Date()).slice(0, 7);
  const income = data.incomes.filter((row) => !row.is_voided && String(row.occurred_at).slice(0,7) === month).reduce((sum, row) => sum + Number(row.collected_amount), 0);
  const expense = data.expenses.filter((row) => String(row.occurred_on).slice(0,7) === month).reduce((sum, row) => sum + Number(row.amount), 0);
  const totals = (key: (row: any) => string, amount: (row: any) => number) => {
    const map = new Map<string, number>();
    data.incomes.filter((row) => !row.is_voided).forEach((row) => map.set(key(row), (map.get(key(row)) || 0) + amount(row)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byPayment = totals((row) => relation(row.payment_methods)?.name || "Yöntem belirtilmedi", (row) => Number(row.collected_amount));
  const byStaff = totals((row) => relation(row.staff)?.full_name || "Genel", (row) => Number(row.collected_amount));
  const serviceTotals = new Map<string, number>();
  data.incomes.filter((row) => !row.is_voided).forEach((row) => (row.income_transaction_services || []).forEach((service: any) => serviceTotals.set(service.service_name_snapshot, (serviceTotals.get(service.service_name_snapshot) || 0) + Number(service.amount))));
  const byService = [...serviceTotals.entries()].sort((a, b) => b[1] - a[1]);
  async function addManualIncome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(() => db.from("income_transactions").insert({ source: "manual_income", occurred_at: new Date(manualIncome.occurred_on + "T12:00:00.000Z").toISOString(), expected_amount: Number(manualIncome.amount), collected_amount: Number(manualIncome.amount), payment_method_id: manualIncome.payment_method_id || null, staff_id: manualIncome.staff_id || null, customer_id: manualIncome.customer_id || null, description: manualIncome.description }), "Gelir kaydedildi.");
    setManualIncome({ ...manualIncome, description: "", amount: "" });
  }
  async function addPaymentMethod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); await perform(() => db.from("payment_methods").insert(paymentForm), "Ödeme yöntemi eklendi."); setPaymentForm({ name: "", kind: "cash" });
  }
  async function addExpenseCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); await perform(() => db.from("expense_categories").insert(expenseCategoryForm), "Gider kategorisi eklendi."); setExpenseCategoryForm({ ...expenseCategoryForm, name: "" });
  }
  return <>
    <div className="admin-kpis"><Kpi label="Aylık tahsilat" value={formatMoney(income, currencyFor(data.settings))} icon={<CircleDollarSign />} note="Gerçekleşen tüm tahsilatlar" /><Kpi label="Aylık gider" value={formatMoney(expense, currencyFor(data.settings))} icon={<Wallet />} note="Manuel ve düzenli giderler" /><Kpi label="Aylık fark" value={formatMoney(income - expense, currencyFor(data.settings))} icon={<LayoutDashboard />} note="Tahsilat eksi gider" /></div>
    <div className="admin-report-grid"><ReportList title="Personel performansı" rows={byStaff} settings={data.settings} /><ReportList title="Ödeme yöntemleri" rows={byPayment} settings={data.settings} /><ReportList title="Hizmet geliri" rows={byService} settings={data.settings} /></div>
    <div className="admin-two-column admin-manage-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> TAHSİLAT DEFTERİ</span><h2>Gelir raporu</h2></div></div>{data.incomes.slice(0, visibleIncomeCount).map((row) => <IncomeLedgerRow key={row.id} row={row} data={data} perform={perform} busy={busy} />)}{data.incomes.length > visibleIncomeCount && <button type="button" className="admin-text-button" onClick={() => setVisibleIncomeCount((count) => count + 20)}>Daha eski {Math.min(20, data.incomes.length - visibleIncomeCount)} kaydı göster</button>}{!data.incomes.length && <p className="admin-empty">Tamamlanan randevular ve manuel gelirler burada görünür.</p>}</section>
      <div className="admin-column-stack"><form className="admin-panel admin-form" onSubmit={onExpense}><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> GİDER KAYDI</span><h2>Gider ekle</h2></div></div><label>Gider adı<input required value={expenseForm.name} onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })} /></label><div className="admin-form-inline"><label>Tutar<input required type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></label><label>Tarih<input required type="date" value={expenseForm.occurred_on} onChange={(e) => setExpenseForm({ ...expenseForm, occurred_on: e.target.value })} /></label></div><div className="admin-form-inline"><label>Tür<select value={expenseForm.expense_type} onChange={(e) => setExpenseForm({ ...expenseForm, expense_type: e.target.value })}><option value="shop">İşletme</option><option value="service">Hizmet / malzeme</option></select></label><label>Kategori<select value={expenseForm.category_id} onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}><option value="">Seçilmedi</option>{dbCategories.filter((row: any) => row.expense_type === expenseForm.expense_type).map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div><label>Açıklama<input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} /></label><button className="button button-dark" disabled={busy}><Plus size={15} /> Gideri kaydet</button></form>
      <form className="admin-panel admin-form" onSubmit={onRecurring}><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> OTOMATİK TAKİP</span><h2>Düzenli gider</h2></div></div><label>Gider adı<input required value={recurringForm.name} onChange={(e) => setRecurringForm({ ...recurringForm, name: e.target.value })} placeholder="Kira" /></label><div className="admin-form-inline"><label>Tutar<input required type="number" min="0" step="0.01" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} /></label><label>Tekrar<select value={recurringForm.frequency} onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value })}><option value="monthly">Aylık</option><option value="weekly">Haftalık</option><option value="yearly">Yıllık</option><option value="daily">Günlük</option></select></label></div><label>İlk kayıt tarihi<input required type="date" value={recurringForm.next_run_on} onChange={(e) => setRecurringForm({ ...recurringForm, next_run_on: e.target.value })} /></label><button className="button button-outline" disabled={busy}><Plus size={15} /> Tekrarı planla</button></form>
      <form className="admin-panel admin-form" onSubmit={addManualIncome}><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> HIZLI TAHSİLAT</span><h2>Randevusuz gelir</h2></div></div><label>Müşteri (isteğe bağlı)<select value={manualIncome.customer_id} onChange={e => setManualIncome({ ...manualIncome,customer_id:e.target.value })}><option value="">Genel gelir</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.phone}</option>)}</select></label><p className="admin-hint">Adisyon borcu tahsil ediyorsanız müşteri kartındaki Ödeme al bölümünü kullanın.</p><label>Açıklama<input required value={manualIncome.description} onChange={(e) => setManualIncome({ ...manualIncome, description: e.target.value })} placeholder="Ürün satışı" /></label><div className="admin-form-inline"><label>Tutar<input required type="number" min="0" step="0.01" value={manualIncome.amount} onChange={(e) => setManualIncome({ ...manualIncome, amount: e.target.value })} /></label><label>Tarih<input required type="date" value={manualIncome.occurred_on} onChange={(e) => setManualIncome({ ...manualIncome, occurred_on: e.target.value })} /></label></div><div className="admin-form-inline"><label>Ödeme yöntemi<select value={manualIncome.payment_method_id} onChange={(e) => setManualIncome({ ...manualIncome, payment_method_id: e.target.value })}><option value="">Belirtilmedi</option>{data.paymentMethods.filter((row) => row.is_active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Personel<select value={manualIncome.staff_id} onChange={(e) => setManualIncome({ ...manualIncome, staff_id: e.target.value })}><option value="">Genel</option>{data.staff.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label></div><button className="button button-dark"><Plus size={15} /> Geliri kaydet</button></form></div></div>
    <div className="admin-two-column admin-manage-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> ÖDEME YÖNTEMLERİ</span><h2>Yöntemleri yönetin</h2></div></div><p className="admin-hint">Gizlemek, yöntemi yeni tahsilat seçeneklerinden kaldırır ve geçmiş kayıtlarını korur.</p>{data.paymentMethods.map((row) => <PaymentMethodEditor key={row.id} row={row} perform={perform} busy={busy} />)}<form className="admin-inline-create" onSubmit={addPaymentMethod}><label>Yeni yöntem<input required value={paymentForm.name} onChange={(e) => setPaymentForm({ ...paymentForm, name: e.target.value })} /></label><select aria-label="Yeni ödeme yöntemi türü" value={paymentForm.kind} onChange={(e) => setPaymentForm({ ...paymentForm, kind: e.target.value })}><option value="cash">Nakit</option><option value="card">Kart</option><option value="iban">IBAN</option></select><button className="button button-outline"><Plus size={14} /> Ekle</button></form></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> GİDER KATEGORİLERİ</span><h2>Türleri yönetin</h2></div></div>{dbCategories.map((row: any) => <div className="admin-list-row" key={row.id}><span><strong>{row.name}</strong><small>{row.expense_type === "shop" ? "İşletme" : "Hizmet / malzeme"}</small></span><button className="admin-icon-button" aria-label="Gider kategorisini gizle" onClick={() => void perform(() => db.from("expense_categories").update({ is_active: false }).eq("id", row.id), "Gider kategorisi kapatıldı.")}>×</button></div>)}<form className="admin-inline-create" onSubmit={addExpenseCategory}><label>Yeni kategori<input required value={expenseCategoryForm.name} onChange={(e) => setExpenseCategoryForm({ ...expenseCategoryForm, name: e.target.value })} /></label><select aria-label="Gider kategorisi türü" value={expenseCategoryForm.expense_type} onChange={(e) => setExpenseCategoryForm({ ...expenseCategoryForm, expense_type: e.target.value })}><option value="shop">İşletme</option><option value="service">Hizmet</option></select><button className="button button-outline"><Plus size={14} /> Ekle</button></form></section></div>
    <div className="admin-two-column admin-manage-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> TEKRARLAYAN KAYITLAR</span><h2>Düzenli gider planları</h2></div></div>{data.recurring.map((row) => <div className="admin-list-row" key={row.id}><span><strong>{row.name} · {formatMoney(row.amount, currencyFor(data.settings))}</strong><small>{row.frequency === "monthly" ? "Aylık" : row.frequency === "weekly" ? "Haftalık" : row.frequency === "yearly" ? "Yıllık" : "Günlük"} · sonraki {formatDate(row.next_run_on)}</small></span><button className="admin-text-button" onClick={() => void perform(() => db.from("recurring_expense_rules").update({ is_active: !row.is_active }).eq("id", row.id), row.is_active ? "Düzenli gider durduruldu." : "Düzenli gider açıldı.")}>{row.is_active ? "Aktif" : "Duraklatıldı"}</button></div>)}{!data.recurring.length && <p className="admin-empty">Planlanmış gider yok.</p>}</section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> HARCAMA GEÇMİŞİ</span><h2>Son giderler</h2></div></div>{data.expenses.slice(0,12).map((row) => <div className="admin-list-row" key={row.id}><span><strong>{row.name}</strong><small>{formatDate(row.occurred_on)} · {row.expense_type === "shop" ? "İşletme" : "Hizmet"}{row.recurring_rule_id ? " · Düzenli" : ""}</small></span><div className="admin-row-actions"><b>{formatMoney(row.amount, currencyFor(data.settings))}</b><button className="admin-icon-button" aria-label="Gideri sil" onClick={() => void perform(() => db.from("expenses").delete().eq("id", row.id), "Gider silindi.")}>×</button></div></div>)}{!data.expenses.length && <p className="admin-empty">Henüz gider kaydı bulunmuyor.</p>}</section></div>
  </>;
}

function IncomeLedgerRow({ row, data, perform, busy }: { row: any; data: AdminData; perform: (action: () => Promise<any>, success: string) => Promise<void>; busy: boolean }) {
  const db = createBrowserSupabase() as any;
  const staff = relation(row.staff);
  const method = relation(row.payment_methods);
  const [form, setForm] = useState({
    customer_id: row.customer_id || "",
    description: row.description || "",
    amount: String(row.collected_amount ?? ""),
    occurred_on: String(row.occurred_at).slice(0, 10),
    payment_method_id: row.payment_method_id || "",
    staff_id: row.staff_id || "",
  });

  if (row.source !== "manual_income") {
    return <div className="admin-list-row" key={row.id}>
      <span><strong>{row.description || "Randevu geliri"}{row.is_voided && <small> · İptal edildi</small>}</strong><small>{formatDate(String(row.occurred_at).slice(0, 10))} · {staff?.full_name || "Genel"} · {method?.name || "Yöntem belirtilmedi"} · {row.source === "manual_service" ? "Adisyona bağlı · Müşteri kartından yönetilir" : "Randevuya bağlı"}</small></span>
      <b className={row.is_voided ? "muted-amount" : ""}>{formatMoney(row.collected_amount, currencyFor(data.settings))}</b>
    </div>;
  }

  return <details className="admin-record-editor admin-income-record">
    <summary><span><strong>{form.description || "Manuel gelir"}{row.is_voided && <small> · İptal edildi</small>}</strong><small>{formatDate(String(row.occurred_at).slice(0, 10))} · {staff?.full_name || "Genel"} · {method?.name || "Yöntem belirtilmedi"} · Manuel</small></span><span><b className={row.is_voided ? "muted-amount" : ""}>{formatMoney(row.collected_amount, currencyFor(data.settings))}</b><ChevronRight size={14} /></span></summary>
    <form className="admin-form admin-record-form" onSubmit={(event) => {
      event.preventDefault();
      void perform(() => db.from("income_transactions").update({
        description: form.description.trim(),
        customer_id: form.customer_id || null,
        expected_amount: Number(form.amount),
        collected_amount: Number(form.amount),
        occurred_at: new Date(form.occurred_on + "T12:00:00.000Z").toISOString(),
        payment_method_id: form.payment_method_id || null,
        staff_id: form.staff_id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("source", "manual_income"), "Gelir kaydı güncellendi.");
    }}>
      <label>Açıklama<input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Müşteri<select value={form.customer_id} onChange={e => setForm({ ...form,customer_id:e.target.value })}><option value="">Genel gelir</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.phone}</option>)}</select></label>
      <div className="admin-form-inline"><label>Tutar<input required type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>Tarih<input required type="date" value={form.occurred_on} onChange={(event) => setForm({ ...form, occurred_on: event.target.value })} /></label></div>
      <div className="admin-form-inline"><label>Ödeme yöntemi<select value={form.payment_method_id} onChange={(event) => setForm({ ...form, payment_method_id: event.target.value })}><option value="">Belirtilmedi</option>{data.paymentMethods.map((item) => <option key={item.id} value={item.id}>{item.name}{!item.is_active ? " (gizli)" : ""}</option>)}</select></label><label>Personel<select value={form.staff_id} onChange={(event) => setForm({ ...form, staff_id: event.target.value })}><option value="">Genel</option>{data.staff.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label></div>
      <div className="admin-record-actions"><button className="button button-dark" disabled={busy}><Check size={14} /> Değişiklikleri kaydet</button><button type="button" className="admin-text-button is-danger" disabled={busy} onClick={() => {
        if (!row.is_voided && !window.confirm("Bu gelir rapor toplamlarından çıkarılsın mı? Kayıt geçmişte iptal edilmiş olarak saklanır.")) return;
        void perform(() => db.from("income_transactions").update({ is_voided: !row.is_voided, updated_at: new Date().toISOString() }).eq("id", row.id).eq("source", "manual_income"), row.is_voided ? "Gelir kaydı geri alındı." : "Gelir kaydı iptal edildi.");
      }}>{row.is_voided ? "İptali geri al" : "Geliri iptal et"}</button></div>
    </form>
  </details>;
}

function PaymentMethodEditor({ row, perform, busy }: { row: any; perform: (action: () => Promise<any>, success: string) => Promise<void>; busy: boolean }) {
  const db = createBrowserSupabase() as any;
  const [name, setName] = useState(row.name);
  const [kind, setKind] = useState(row.kind);
  return <details className="admin-record-editor">
    <summary><span><strong>{row.name}</strong><small>{row.kind === "cash" ? "Nakit" : row.kind === "card" ? "Kart" : "IBAN"} · {row.is_active ? "Kullanımda" : "Gizli"}</small></span><span className={row.is_active ? "status-pill status-confirmed" : "status-pill"}>{row.is_active ? "Aktif" : "Gizli"} <ChevronRight size={14} /></span></summary>
    <form className="admin-form admin-record-form" onSubmit={(event) => {
      event.preventDefault();
      void perform(() => db.from("payment_methods").update({ name: name.trim(), kind }).eq("id", row.id), "Ödeme yöntemi güncellendi.");
    }}>
      <label>Yöntem adı<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Tür<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="cash">Nakit</option><option value="card">Kart</option><option value="iban">IBAN</option></select></label>
      <div className="admin-record-actions"><button className="button button-dark" disabled={busy}><Check size={14} /> Kaydet</button><button type="button" className="admin-text-button" disabled={busy} onClick={() => void perform(() => db.from("payment_methods").update({ is_active: !row.is_active }).eq("id", row.id), row.is_active ? "Ödeme yöntemi gizlendi." : "Ödeme yöntemi etkinleştirildi.")}>{row.is_active ? "Gizle" : "Etkinleştir"}</button></div>
    </form>
  </details>;
}

function ReportList({ title, rows, settings }: { title: string; rows: Array<[string, number]>; settings: SiteSettings }) {
  return <section className="admin-panel admin-report-card"><div className="admin-panel-heading"><h2>{title}</h2></div>{rows.slice(0,6).map(([name, amount]) => <div className="admin-list-row" key={name}><span><strong>{name}</strong></span><b>{formatMoney(amount, currencyFor(settings))}</b></div>)}{!rows.length && <p className="admin-empty">Henüz rapor verisi yok.</p>}</section>;
}

function SiteContent({ data, perform }: { data: AdminData; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [faq, setFaq] = useState({ question: "", answer: "" });
  const [review, setReview] = useState({ customer_name: "", content: "", rating: "5" });
  const [gallery, setGallery] = useState({ title: "", image_url: "", image_alt: "" });
  async function addFaq(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await perform(() => db.from("faqs").insert(faq), "SSS yanıtı eklendi."); setFaq({ question: "", answer: "" }); }
  async function addReview(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await perform(() => db.from("testimonials").insert({ ...review, rating: Number(review.rating) }), "Müşteri yorumu eklendi."); setReview({ customer_name: "", content: "", rating: "5" }); }
  async function addGallery(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const alt = gallery.image_alt.trim() || gallery.title.trim(); await perform(() => db.from("gallery_items").insert({ ...gallery, image_alt: alt }), "Galeri görseli eklendi."); setGallery({ title: "", image_url: "", image_alt: "" }); }
  return <div className="admin-content-grid">
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> SIKÇA SORULANLAR</span><h2>SSS</h2></div><span className="admin-count">{data.faqs.length}</span></div>
      {data.faqs.map((item) => <ContentTextEditor key={item.id} kind="faqs" row={item} titleField="question" bodyField="answer" perform={perform} />)}
      <form className="admin-form admin-content-form" onSubmit={addFaq}><label>Soru<input required value={faq.question} onChange={(e) => setFaq({ ...faq, question: e.target.value })} /></label><label>Yanıt<textarea required rows={3} value={faq.answer} onChange={(e) => setFaq({ ...faq, answer: e.target.value })} /></label><button className="button button-dark"><Plus size={14} /> Soru ekle</button></form>
    </section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> MÜŞTERİ DENEYİMİ</span><h2>Yorumlar</h2></div><span className="admin-count">{data.testimonials.length}</span></div>
      {data.testimonials.map((item) => <TestimonialEditor key={item.id} item={item} perform={perform} />)}
      <form className="admin-form admin-content-form" onSubmit={addReview}><label>Müşteri adı<input required value={review.customer_name} onChange={(e) => setReview({ ...review, customer_name: e.target.value })} /></label><label>Yorum<textarea required rows={3} value={review.content} onChange={(e) => setReview({ ...review, content: e.target.value })} /></label><label>Puan<select value={review.rating} onChange={(e) => setReview({ ...review, rating: e.target.value })}>{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select></label><button className="button button-dark"><Plus size={14} /> Yorum ekle</button></form>
    </section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> SALON ÇALIŞMALARI</span><h2>Galeri</h2></div><span className="admin-count">{data.gallery.length}</span></div>
      <div className="admin-gallery-admin">{data.gallery.map((item) => <GalleryEditor key={item.id} item={item} perform={perform} />)}</div>
      <form className="admin-form admin-content-form" onSubmit={addGallery}><label>Başlık<input required value={gallery.title} onChange={(e) => setGallery({ ...gallery, title: e.target.value })} /></label><MediaUpload folder="gallery" onUploaded={(url) => setGallery((current) => ({ ...current, image_url: url }))} /><label>Görsel URL<input required type="url" value={gallery.image_url} onChange={(e) => setGallery({ ...gallery, image_url: e.target.value })} /></label><label>Alt metin<input value={gallery.image_alt} onChange={(e) => setGallery({ ...gallery, image_alt: e.target.value })} placeholder={gallery.title || "Görseli kısaca tanımlayın"} /></label><button className="button button-dark"><Plus size={14} /> Galeriye ekle</button></form>
    </section>
  </div>;
}

function ContentTextEditor({ kind, row, titleField, bodyField, perform }: { kind: "faqs"; row: any; titleField: "question"; bodyField: "answer"; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [title, setTitle] = useState(row[titleField]); const [body, setBody] = useState(row[bodyField]); const [order, setOrder] = useState(String(row.display_order || 0));
  return <details className="admin-record-editor"><summary><span><strong>{title}</strong><small>{row.is_active ? "Yayında" : "Gizli"}</small></span><ChevronRight size={14} /></summary><form className="admin-form admin-record-form" onSubmit={(event) => { event.preventDefault(); void perform(() => db.from(kind).update({ [titleField]: title, [bodyField]: body, display_order: Number(order) }).eq("id", row.id), "SSS kaydı güncellendi."); }}><label>Soru<input value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Yanıt<textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></label><label>Sıra<input type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></label><div className="admin-record-actions"><button className="button button-dark"><Check size={14} /> Kaydet</button><button type="button" className="admin-text-button" onClick={() => void perform(() => db.from(kind).update({ is_active: !row.is_active }).eq("id", row.id), row.is_active ? "SSS gizlendi." : "SSS yayınlandı.")}>{row.is_active ? "Gizle" : "Yayınla"}</button><button type="button" className="admin-text-button is-danger" onClick={() => window.confirm("SSS kaydı silinsin mi?") && void perform(() => db.from(kind).delete().eq("id", row.id), "SSS kaydı silindi.")}>Sil</button></div></form></details>;
}

function TestimonialEditor({ item, perform }: { item: any; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [name, setName] = useState(item.customer_name); const [content, setContent] = useState(item.content); const [rating, setRating] = useState(String(item.rating)); const [order, setOrder] = useState(String(item.display_order || 0));
  return <details className="admin-record-editor"><summary><span><strong>{name} · {"★".repeat(item.rating)}</strong><small>{item.is_active ? "Yayında" : "Gizli"}</small></span><ChevronRight size={14} /></summary><form className="admin-form admin-record-form" onSubmit={(event) => { event.preventDefault(); void perform(() => db.from("testimonials").update({ customer_name: name, content, rating: Number(rating), display_order: Number(order) }).eq("id", item.id), "Müşteri yorumu güncellendi."); }}><label>Ad<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Yorum<textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} /></label><div className="admin-form-inline"><label>Puan<select value={rating} onChange={(e) => setRating(e.target.value)}>{[5,4,3,2,1].map((n) => <option value={n} key={n}>{n}</option>)}</select></label><label>Sıra<input type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></label></div><div className="admin-record-actions"><button className="button button-dark"><Check size={14} /> Kaydet</button><button type="button" className="admin-text-button" onClick={() => void perform(() => db.from("testimonials").update({ is_active: !item.is_active }).eq("id", item.id), item.is_active ? "Yorum gizlendi." : "Yorum yayınlandı.")}>{item.is_active ? "Gizle" : "Yayınla"}</button><button type="button" className="admin-text-button is-danger" onClick={() => window.confirm("Yorum silinsin mi?") && void perform(() => db.from("testimonials").delete().eq("id", item.id), "Yorum silindi.")}>Sil</button></div></form></details>;
}

function GalleryEditor({ item, perform }: { item: any; perform: (action: () => Promise<any>, success: string) => Promise<void> }) {
  const db = createBrowserSupabase() as any;
  const [title, setTitle] = useState(item.title || ""); const [url, setUrl] = useState(item.image_url); const [alt, setAlt] = useState(item.image_alt || ""); const [order, setOrder] = useState(String(item.display_order || 0));
  return <article className="admin-gallery-item"><div className="admin-gallery-preview" style={{ backgroundImage: `url("${url}")` }} role="img" aria-label={alt || title} /><div className="admin-gallery-fields"><input aria-label="Galeri başlığı" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık" /><input aria-label="Görsel URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Görsel URL" /><input aria-label="Görsel alt metni" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Alt metin" /><input aria-label="Görsel sırası" type="number" value={order} onChange={(e) => setOrder(e.target.value)} /><div className="admin-record-actions"><button className="admin-text-button" onClick={() => void perform(() => db.from("gallery_items").update({ title, image_url: url, image_alt: alt || title, display_order: Number(order) }).eq("id", item.id), "Görsel güncellendi.")}>Kaydet</button><button className="admin-text-button" onClick={() => void perform(() => db.from("gallery_items").update({ is_active: !item.is_active }).eq("id", item.id), item.is_active ? "Görsel gizlendi." : "Görsel yayınlandı.")}>{item.is_active ? "Gizle" : "Yayınla"}</button><button className="admin-icon-button" aria-label="Görseli sil" onClick={() => window.confirm("Galeri görseli silinsin mi?") && void perform(() => db.from("gallery_items").delete().eq("id", item.id), "Galeri görseli silindi.")}>×</button></div></div></article>;
}

function MediaUpload({ folder, onUploaded }: { folder: string; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setError("");
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 5 * 1024 * 1024) { setError("JPG, PNG veya WebP seçin. En fazla 5 MB."); return; }
    setBusy(true);
    try {
      const client = createBrowserSupabase();
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const { data, error: uploadError } = await client.storage.from("salon-media").upload(`${folder}/${crypto.randomUUID()}.${extension}`, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = client.storage.from("salon-media").getPublicUrl(data.path);
      onUploaded(urlData.publicUrl);
    } catch { setError("Görsel yüklenemedi. Yönetici erişimini ve veritabanı bağlantısını kontrol edin."); }
    finally { setBusy(false); event.target.value = ""; }
  }
  return <label className="media-upload">Görsel dosyası<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} /><small>{busy ? "Yükleniyor…" : "JPG / PNG / WebP · 5 MB"}</small>{error && <small className="form-error">{error}</small>}</label>;
}

function Settings({ form, setForm, onSubmit, busy }: { form: any; setForm: (value: any) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const field = (key: string, value: string) => setForm({ ...form, [key]: value });
  return <form className="admin-panel admin-form admin-settings-form" onSubmit={onSubmit}>
    <div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> GENEL BİLGİLER</span><h2>Site ve randevu ayarları</h2></div></div>
    <div className="admin-settings-grid">
      <label>İşletme adı<input required value={form.business_name} onChange={(e) => field("business_name", e.target.value)} /></label>
      <label>Slogan<input value={form.tagline} onChange={(e) => field("tagline", e.target.value)} /></label>
      <label>Telefon<input value={form.phone} onChange={(e) => field("phone", e.target.value)} /></label>
      <label>WhatsApp telefonu<input value={form.whatsapp_phone} onChange={(e) => field("whatsapp_phone", e.target.value)} /></label>
      <label>E-posta<input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} /></label>
      <label>Instagram bağlantısı<input type="url" value={form.instagram_url} onChange={(e) => field("instagram_url", e.target.value)} /></label>
      <label className="wide-field">Adres<input value={form.address} onChange={(e) => field("address", e.target.value)} /></label>
      <label>Harita bağlantısı<input type="url" value={form.maps_url} onChange={(e) => field("maps_url", e.target.value)} /></label>
      <label>Harita gömme bağlantısı<input type="url" value={form.maps_embed_url} onChange={(e) => field("maps_embed_url", e.target.value)} /></label>
      <MediaUpload folder="brand" onUploaded={(url) => field("logo_url", url)} /><label>Logo görseli URL<input type="url" value={form.logo_url} onChange={(e) => field("logo_url", e.target.value)} placeholder="https://…" /></label>
      <label>Ana sayfa başlığı<input value={form.home_title} onChange={(e) => field("home_title", e.target.value)} /></label>
      <label className="wide-field">Kısa işletme tanıtımı<textarea rows={2} value={form.business_description} onChange={(e) => field("business_description", e.target.value)} /></label>
      <label className="wide-field">Ana sayfa açıklaması<textarea rows={3} value={form.home_description} onChange={(e) => field("home_description", e.target.value)} /></label>
      <label>Randevu aralığı (dk)<input type="number" min="5" max="120" value={form.booking_interval_minutes} onChange={(e) => field("booking_interval_minutes", e.target.value)} /></label>
      <label>Değişiklik kilidi (saat)<input type="number" min="0" max="720" value={form.manage_changes_lock_hours} onChange={(e) => field("manage_changes_lock_hours", e.target.value)} /></label>
      <label className="settings-checkbox"><input type="checkbox" checked={form.require_email} onChange={(e) => setForm({ ...form, require_email: e.target.checked })} />Randevuda e-posta zorunlu</label>
    </div>
    <div className="admin-subsection-heading"><h3>Görsel kimlik</h3><p>Sayfa renkleri CSS değişkenleri olarak uygulanır.</p></div>
    <div className="admin-settings-grid admin-color-grid"><label>Ana renk<input type="color" value={form.primary_color} onChange={(e) => field("primary_color", e.target.value)} /></label><label>Vurgu rengi<input type="color" value={form.accent_color} onChange={(e) => field("accent_color", e.target.value)} /></label><label>Yüzey rengi<input type="color" value={form.surface_color} onChange={(e) => field("surface_color", e.target.value)} /></label></div>
    <div className="admin-subsection-heading"><h3>Arama motoru görünümü</h3></div>
    <div className="admin-settings-grid"><label>SEO başlığı<input value={form.seo_title} onChange={(e) => field("seo_title", e.target.value)} /></label><label>Canonical URL<input type="url" value={form.canonical_url} onChange={(e) => field("canonical_url", e.target.value)} placeholder="https://…" /></label><label className="wide-field">SEO açıklaması<textarea rows={2} value={form.seo_description} onChange={(e) => field("seo_description", e.target.value)} /></label></div>
    <div className="admin-subsection-heading"><h3>Kişisel veriler aydınlatma metni</h3><p>İşletmenin gerçek veri sorumlusu, aktarım, saklama ve başvuru bilgilerini ekleyin.</p></div>
    <label className="privacy-policy-editor">Yayınlanacak metin<textarea rows={12} value={form.privacy_policy_text} onChange={(e) => field("privacy_policy_text", e.target.value)} placeholder="Veri sorumlusu, amaçlar, alıcılar, toplama yöntemi ve hukuki sebepler, saklama, haklar ve iletişim…" /></label>
    <div className="admin-form-footer"><p>İşletme adı, iletişim ve tema ayarları siteye yansıtılır. Aydınlatma metnini işletmenizin gerçek süreçleriyle eşleştirin.</p><button className="button button-dark" disabled={busy}><Check size={15} /> Değişiklikleri kaydet</button></div>
  </form>;
}

function PasswordChange() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (password.length < 12) {
      setError("Yeni parola en az 12 karakter olmalı.");
      return;
    }
    if (password !== confirmation) {
      setError("Parola alanları eşleşmiyor.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await createBrowserSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmation("");
      setMessage("Parola güncellendi. Artık diğer cihazda yeni parolanızla giriş yapabilirsiniz.");
    } catch {
      setError("Parola güncellenemedi. Bu cihazdaki yönetici oturumunun hâlâ açık olduğunu kontrol edip yeniden deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="admin-panel admin-form" onSubmit={changePassword}>
    <div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> HESAP GÜVENLİĞİ</span><h2>Yönetici parolası</h2></div><KeyRound size={19} /></div>
    <p className="admin-empty">Bu cihazda yönetici oturumunuz açıksa yeni bir parola belirleyip diğer cihazlarda kullanabilirsiniz. En az 12 karakter girin.</p>
    <label>Yeni parola<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label>Yeni parolayı tekrar girin<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    <button className="button button-dark" disabled={busy}><KeyRound size={15} /> {busy ? "Güncelleniyor…" : "Yönetici parolasını güncelle"}</button>
  </form>;
}
