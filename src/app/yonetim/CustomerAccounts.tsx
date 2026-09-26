"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, ReceiptText, Search, Trash2, Users, Wallet } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { formatMoney, normalizePhone } from "@/lib/format";
import { customerError, type CustomerAccount } from "@/lib/customer-accounts";

type Choice = { id: string; name: string; price?: number; is_active?: boolean };
type Options = { services: Choice[]; staff: Choice[]; methods: Choice[]; currency: string; timezone: string };
type Result = { data?: unknown; error?: { message: string } | null };
type Run = (action: () => PromiseLike<Result>, success: string) => Promise<boolean>;
type Item = { id: string; service_id: string | null; service_name_snapshot: string; quantity: number; unit_price: number; line_total: number; display_order: number };
type Payment = { id: string; amount: number; payment_method_id: string; paid_at: string; is_voided: boolean };
type Invoice = { id: string; invoice_number: number; appointment_id: string | null; description: string; total_amount: number; is_voided: boolean; created_at: string; staff_id: string | null; customer_invoice_items: Item[]; customer_invoice_payments: Payment[] };
type Visit = { id: string; code: string; status: string; starts_at: string; quoted_total: number; collected_total: number | null; appointment_services: { service_name_snapshot: string; price_snapshot: number }[]; staff: { full_name: string } | null };
type Income = { id: string; source: string; description: string; collected_amount: number; occurred_at: string; is_voided: boolean; payment_method_id: string | null };
type Detail = { invoices: Invoice[]; visits: Visit[]; incomes: Income[]; earned: number; balance: number };
const statuses: Record<string, string> = { pending: "Bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal", no_show: "Gelmedi" };
const dateLabel = (value: string, timezone: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: timezone }).format(new Date(value));
const today = (timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const paidTotal = (invoice: Invoice) => invoice.customer_invoice_payments.filter(p => !p.is_voided).reduce((sum, p) => sum + Number(p.amount), 0);
const cents = (amount: number) => Math.round(amount * 100);

async function allRows<T>(query: (from: number, to: number) => PromiseLike<Result>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await query(offset, offset + 499);
    if (page.error) throw new Error(page.error.message);
    const rows = (page.data || []) as T[];
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}

export function CustomerAccounts({ customers, options }: { customers: CustomerAccount[]; options: Options }) {
  const router = useRouter();
  const [selected, setSelected] = useState<CustomerAccount | null>(null);
  const [search, setSearch] = useState("");
  const [debtOnly, setDebtOnly] = useState(false);
  const [limit, setLimit] = useState(25);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const running = useRef(false);
  const money = (value: number) => formatMoney(value, options.currency);
  const current = customers.find(c => c.id === selected?.id) || selected;
  const query = search.trim().toLocaleLowerCase("tr-TR");
  const matches = customers.filter(c => (!debtOnly || Number(c.outstanding_balance) > 0)
    && ([c.first_name, c.last_name, c.phone, c.email].join(" ").toLocaleLowerCase("tr-TR").includes(query)
      || (normalizePhone(query).length >= 3 && normalizePhone(c.phone).includes(normalizePhone(query)))));

  const run: Run = async (action, success) => {
    if (running.current) return false;
    running.current = true; setBusy(true); setMessage(""); setError("");
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      setMessage(success); setRevision(n => n + 1); router.refresh();
      return true;
    } catch (cause) {
      setError(customerError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."));
      return false;
    } finally { running.current = false; setBusy(false); }
  };

  return <div className="customer-accounts">
    {message && <p className="admin-alert" role="status">{message}</p>}
    {error && <p className="admin-alert is-error" role="alert">{error}</p>}
    {current ? <>
      <button className="admin-text-button customer-back" onClick={() => { setSelected(null); setMessage(""); setError(""); }}><ArrowLeft size={16} /> Müşteri kitlesine dön</button>
      <CustomerDetail key={current.id} customer={current} options={options} run={run} busy={busy} revision={revision} />
    </> : <>
      <div className="admin-kpis">
        <Metric label="Toplam müşteri" value={String(customers.length)} icon={<Users />} />
        <Metric label="Müşterilerden kazanılan" value={money(customers.reduce((sum,c) => sum + Number(c.total_earned),0))} icon={<Wallet />} />
        <Metric label="Toplam kalan borç" value={money(customers.reduce((sum,c) => sum + Number(c.outstanding_balance),0))} icon={<ReceiptText />} />
      </div>
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> MÜŞTERİ KİTLESİ</span><h2>Müşteriler ve hesapları</h2></div><button className="button button-dark" onClick={() => setAdding(!adding)}><Plus size={16} /> Müşteri ekle</button></div>
        <p className="admin-hint">Randevu alan müşteriler otomatik kaydolur. Müşteri kartından hizmetleri, adisyonları ve tahsilatları takip edebilirsiniz.</p>
        {adding && <CustomerForm run={run} busy={busy} onSaved={customer => { setSelected(customer); setAdding(false); }} />}
        <div className="customer-filters"><label className="admin-search"><Search size={16} /> Müşteri ara<input placeholder="Ad, soyad veya telefon" value={search} onChange={e => { setSearch(e.target.value); setLimit(25); }} /></label><label className="customer-checkbox"><input type="checkbox" checked={debtOnly} onChange={e => { setDebtOnly(e.target.checked); setLimit(25); }} /> Yalnızca borcu olanlar</label></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Müşteri</th><th>Telefon</th><th>Kazanılan toplam</th><th>Kalan borç</th><th>İşlem</th></tr></thead><tbody>{matches.slice(0,limit).map(c => <tr key={c.id}><td><strong>{c.first_name} {c.last_name}</strong><small>{c.email || "E-posta belirtilmedi"}</small></td><td>{c.phone}</td><td>{money(c.total_earned)}</td><td><span className={Number(c.outstanding_balance) > 0 ? "customer-due" : ""}>{money(c.outstanding_balance)}</span></td><td><button className="admin-text-button" onClick={() => setSelected(c)}>Müşteri kartını aç</button></td></tr>)}</tbody></table></div>
        {!matches.length && <p className="admin-empty">{customers.length ? "Aramanızla eşleşen müşteri bulunamadı." : "Henüz müşteri yok. İlk müşteriyi elle ekleyebilir veya randevudan otomatik kaydolmasını bekleyebilirsiniz."}</p>}
        <div className="customer-list-footer"><span>{matches.length} müşteri · {Math.min(limit,matches.length)} gösteriliyor</span>{matches.length > limit && <button className="admin-text-button" onClick={() => setLimit(n => n + 25)}>Daha fazla göster</button>}</div>
      </section>
    </>}
  </div>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="admin-kpi"><span className="admin-kpi-icon">{icon}</span><small>{label}</small><strong>{value}</strong></div>;
}

function CustomerForm({ customer, run, busy, onSaved }: { customer?: CustomerAccount; run: Run; busy: boolean; onSaved?: (c: CustomerAccount) => void }) {
  const [form, setForm] = useState({ first_name: customer?.first_name || "", last_name: customer?.last_name || "", phone: customer?.phone || "", email: customer?.email || "", private_note: customer?.private_note || "" });
  const requestId = useRef<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    requestId.current ??= crypto.randomUUID();
    await run(async () => {
      const db = createBrowserSupabase();
      const values = { ...form, first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim(), email: form.email.trim() || null, phone_normalized: normalizePhone(form.phone) };
      const id = customer?.id || requestId.current!;
      const result = customer
        ? await db.from("customers").update(values).eq("id",id).select("*").single()
        : await db.from("customers").upsert({ ...values,id }, { onConflict: "id" }).select("*").single();
      if (!result.error && result.data) onSaved?.({ ...result.data,total_earned:0,outstanding_balance:0 } as CustomerAccount);
      return result;
    }, customer ? "Müşteri bilgileri güncellendi." : "Müşteri eklendi. Şimdi hizmet ve adisyon ekleyebilirsiniz.");
  }
  return <form className="admin-form customer-contact-form" onSubmit={submit}>
    <div className="admin-form-inline"><label>Ad<input required maxLength={100} autoComplete="given-name" value={form.first_name} onChange={e => setForm({ ...form,first_name:e.target.value })} /></label><label>Soyad<input required maxLength={100} autoComplete="family-name" value={form.last_name} onChange={e => setForm({ ...form,last_name:e.target.value })} /></label></div>
    <div className="admin-form-inline"><label>Telefon<input required type="tel" minLength={7} maxLength={30} placeholder="05xx xxx xx xx" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form,phone:e.target.value })} /></label><label>E-posta (isteğe bağlı)<input type="email" maxLength={254} autoComplete="email" value={form.email} onChange={e => setForm({ ...form,email:e.target.value })} /></label></div>
    <label>Müşteri notu<textarea maxLength={2000} rows={2} value={form.private_note} onChange={e => setForm({ ...form,private_note:e.target.value })} placeholder="Yalnızca yönetim panelinde görünür" /></label>
    <button className="button button-dark" disabled={busy}><Check size={16} /> {customer ? "Bilgileri kaydet" : "Müşteriyi kaydet"}</button>
  </form>;
}

function CustomerDetail({ customer, options, run, busy, revision }: { customer: CustomerAccount; options: Options; run: Run; busy: boolean; revision: number }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [retry, setRetry] = useState(0);
  const money = (n: number) => formatMoney(n,options.currency);
  useEffect(() => {
    let cancelled = false;
    const db = createBrowserSupabase();
    Promise.all([
      allRows<Invoice>((from,to) => db.from("customer_invoices").select("id,invoice_number,appointment_id,description,total_amount,is_voided,created_at,staff_id,customer_invoice_items(*),customer_invoice_payments(id,amount,payment_method_id,paid_at,is_voided)").eq("customer_id",customer.id).order("created_at",{ascending:false}).order("id").range(from,to)),
      allRows<Visit>((from,to) => db.from("appointments").select("id,code,status,starts_at,quoted_total,collected_total,appointment_services(service_name_snapshot,price_snapshot),staff(full_name)").eq("customer_id",customer.id).order("starts_at",{ascending:false}).order("id").range(from,to)),
      allRows<Income>((from,to) => db.from("income_transactions").select("id,source,description,collected_amount,occurred_at,is_voided,payment_method_id").eq("customer_id",customer.id).order("occurred_at",{ascending:false}).order("id").range(from,to)),
      db.rpc("customer_financial_summary").eq("customer_id",customer.id).single(),
    ]).then(([invoices,visits,incomes,summary]) => {
      if (summary.error) throw new Error(summary.error.message);
      if (!cancelled) { setDetail({ invoices,visits,incomes,earned:Number(summary.data.total_earned),balance:Number(summary.data.outstanding_balance) }); setError(""); setLoading(false); }
    }).catch(cause => { if (!cancelled) { setError(customerError(cause.message)); setLoading(false); } });
    return () => { cancelled = true; };
  },[customer.id,revision,retry]);
  return <>
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> MÜŞTERİ KARTI</span><h2>{customer.first_name} {customer.last_name}</h2><p className="admin-hint">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</p></div><button className="button button-dark" onClick={() => setAdding(!adding)}><Plus size={16} /> Hizmet / adisyon ekle</button></div>
      <details className="admin-record-editor"><summary><span>İletişim bilgileri ve müşteri notu</span></summary><CustomerForm customer={customer} run={run} busy={busy} /></details>
    </section>
    <div className="admin-kpis"><Metric label="Bu müşteriden kazanılan" value={money(detail?.earned ?? customer.total_earned)} icon={<Wallet />} /><Metric label="Kalan ödeme" value={money(detail?.balance ?? customer.outstanding_balance)} icon={<ReceiptText />} /><Metric label="Randevu sayısı" value={detail ? String(detail.visits.length) : "…"} icon={<Users />} /></div>
    {adding && <InvoiceForm customerId={customer.id} options={options} run={run} busy={busy} onSaved={() => setAdding(false)} />}
    {loading && <p className="admin-empty" role="status">Müşteri geçmişi yükleniyor…</p>}
    {error && <p className="admin-alert is-error" role="alert">{error} <button className="admin-text-button" onClick={() => setRetry(n => n + 1)}>Yeniden dene</button></p>}
    {detail && <>
      <section className="admin-panel"><div className="admin-panel-heading"><h2>Adisyonlar</h2><span className="admin-count">{detail.invoices.length} kayıt</span></div><p className="admin-hint">Adisyon borcu oluşturur. Gelire yalnızca tahsil edilen tutar eklenir.</p>
        {detail.invoices.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} options={options} run={run} busy={busy} />)}
        {!detail.invoices.length && <p className="admin-empty">Henüz adisyon yok. Elle adisyon ekleyebilir veya aşağıdaki randevudan oluşturabilirsiniz.</p>}
      </section>
      <section className="admin-panel"><div className="admin-panel-heading"><h2>Randevu ve hizmet geçmişi</h2></div>
        {detail.visits.map(visit => {
          const invoice = detail.invoices.find(i => i.appointment_id === visit.id);
          return <div className="customer-history-row" key={visit.id}><div><strong>{visit.appointment_services.map(s => s.service_name_snapshot).join(", ") || "Randevu"}</strong><small>{dateLabel(visit.starts_at,options.timezone)} · {visit.staff?.full_name} · {statuses[visit.status]} · {visit.code}</small><small>{money(visit.quoted_total)}{invoice ? ` · Adisyon #${invoice.invoice_number}` : ""}</small></div>
            {!invoice && !["cancelled","no_show"].includes(visit.status) && Number(visit.quoted_total)>0 && <button className="admin-text-button" disabled={busy} onClick={() => {
              if (visit.status !== "completed" && !window.confirm("Randevu tamamlandı olarak işaretlensin ve hizmetleriyle adisyon açılsın mı? Henüz ödeme alınmayacak.")) return;
              void run(() => createBrowserSupabase().rpc("invoice_customer_appointment",{ p_appointment_id:visit.id }),"Randevu adisyona bağlandı. Önceden alınan ödeme varsa korundu.");
            }}>{visit.status === "completed" ? "Adisyon / kalan ödeme" : "Tamamla ve adisyon aç"}</button>}
          </div>;
        })}
        {detail.invoices.filter(i => !i.appointment_id).map(i => <div className="customer-history-row" key={i.id}><div><strong>{i.customer_invoice_items.map(item => `${item.service_name_snapshot}${item.quantity>1 ? ` × ${item.quantity}` : ""}`).join(", ")}</strong><small>{dateLabel(i.created_at,options.timezone)} · Elle eklendi · Adisyon #{i.invoice_number}{i.is_voided ? " · İptal" : ""}</small></div><b>{money(i.total_amount)}</b></div>)}
        {!detail.visits.length && !detail.invoices.length && <p className="admin-empty">Henüz hizmet kaydı yok.</p>}
      </section>
      <section className="admin-panel"><div className="admin-panel-heading"><h2>Tahsilat geçmişi</h2></div>{detail.incomes.map(i => <div className="customer-history-row" key={i.id}><div><strong>{i.description || "Tahsilat"}{i.is_voided ? " · İptal" : ""}</strong><small>{dateLabel(i.occurred_at,options.timezone)} · {options.methods.find(m => m.id === i.payment_method_id)?.name || "Yöntem belirtilmedi"}</small></div><b className={i.is_voided ? "muted-amount" : ""}>{money(i.collected_amount)}</b></div>)}{!detail.incomes.length && <p className="admin-empty">Bu müşteriden henüz tahsilat yapılmamış.</p>}</section>
    </>}
  </>;
}

type DraftItem = { key: number; service_id: string; service_name_snapshot: string; quantity: string; unit_price: string };
const emptyItem = (key: number): DraftItem => ({ key,service_id:"",service_name_snapshot:"",quantity:"1",unit_price:"" });
function InvoiceForm({ customerId, options, run, busy, onSaved }: { customerId: string; options: Options; run: Run; busy: boolean; onSaved: () => void }) {
  const [items, setItems] = useState<DraftItem[]>([emptyItem(0)]);
  const counter = useRef(0);
  const request = useRef<string | null>(null);
  const [description, setDescription] = useState("");
  const [staffId, setStaffId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(options.methods.find(m => m.is_active)?.id || "");
  const [date, setDate] = useState(today(options.timezone));
  const totalCents = items.reduce((sum,i) => sum + cents(Number(i.unit_price)) * Number(i.quantity),0);
  const total = totalCents / 100;
  function patch(key: number, values: Partial<DraftItem>) { setItems(rows => rows.map(row => row.key===key ? {...row,...values} : row)); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); request.current ??= crypto.randomUUID();
    const ok = await run(() => createBrowserSupabase().rpc("create_customer_sale",{
      p_invoice_id:request.current,p_customer_id:customerId,p_description:description.trim(),p_staff_id:staffId || null,
      p_items:items.map(i => ({ service_id:i.service_id || null,service_name_snapshot:i.service_name_snapshot.trim(),quantity:Number(i.quantity),unit_price:Number(i.unit_price) })),
      p_initial_amount:Number(amount || 0),p_payment_method_id:Number(amount)>0 ? method || null : null,p_paid_on:date,
    }),Number(amount)>0 ? "Adisyon ve ilk ödeme kaydedildi; gelir ve müşteri toplamı güncellendi." : "Adisyon kaydedildi. Tahsil edilmemiş tutar kalan borca eklendi.");
    if (ok) onSaved();
  }
  return <form className="admin-panel admin-form customer-invoice-form" onSubmit={submit}><div className="admin-panel-heading"><h2>Yeni adisyon</h2><ReceiptText size={22} /></div>
    <div className="admin-form-inline"><label>Açıklama (isteğe bağlı)<input maxLength={240} value={description} onChange={e => setDescription(e.target.value)} placeholder="Saç kesimi ve bakım" /></label><label>Personel<select value={staffId} onChange={e => setStaffId(e.target.value)}><option value="">Genel</option>{options.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
    {items.map((item,index) => <fieldset className="customer-invoice-item" key={item.key}><legend>Hizmet {index+1}</legend><div className="customer-item-grid">
      <label>Katalogdan seç<select value={item.service_id} onChange={e => { const s=options.services.find(s => s.id===e.target.value); patch(item.key,{service_id:s?.id || "",service_name_snapshot:s?.name || "",unit_price:s ? String(s.price || 0) : ""}); }}><option value="">Elle hizmet / ürün yaz</option>{options.services.filter(s => s.is_active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Hizmet / ürün adı<input required maxLength={120} value={item.service_name_snapshot} onChange={e => patch(item.key,{service_name_snapshot:e.target.value})} /></label>
      <label>Adet<input required type="number" min={1} max={1000} step={1} value={item.quantity} onChange={e => patch(item.key,{quantity:e.target.value})} /></label>
      <label>Birim fiyat<input required type="number" min={0} step="0.01" value={item.unit_price} onChange={e => patch(item.key,{unit_price:e.target.value})} /></label>
    </div><div className="customer-item-bottom"><strong>{formatMoney(cents(Number(item.unit_price))*Number(item.quantity)/100,options.currency)}</strong><button type="button" className="admin-text-button is-danger" disabled={items.length===1 || busy} onClick={() => setItems(rows => rows.filter(i => i.key!==item.key))}><Trash2 size={14} /> Hizmeti kaldır</button></div></fieldset>)}
    <button type="button" className="admin-text-button" onClick={() => setItems(rows => [...rows,emptyItem(++counter.current)])}><Plus size={16} /> Bir hizmet daha ekle</button>
    <div className="customer-invoice-total"><span>Adisyon toplamı</span><strong>{formatMoney(total,options.currency)}</strong></div>
    <div className="admin-form-inline"><label>Şimdi alınan ödeme<input type="number" min={0} max={total} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0 — ödeme alınmadı" /></label><label>Ödeme tarihi<input type="date" required={Number(amount)>0} max={today(options.timezone)} value={date} onChange={e => setDate(e.target.value)} disabled={!Number(amount)} /></label></div>
    <label>Ödeme yöntemi<select required={Number(amount)>0} disabled={!Number(amount)} value={method} onChange={e => setMethod(e.target.value)}><option value="">Seçin</option>{options.methods.filter(m => m.is_active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <p className="admin-hint">Kalan ödeme: <strong>{formatMoney(Math.max(0,total-Number(amount || 0)),options.currency)}</strong>. Yalnızca şimdi alınan ödeme gelirlere yansır.</p>
    <button className="button button-dark" disabled={busy || totalCents<=0}><Check size={16} /> Adisyonu kaydet</button>
  </form>;
}

function InvoiceCard({ invoice, options, run, busy }: { invoice: Invoice; options: Options; run: Run; busy: boolean }) {
  const paid = paidTotal(invoice);
  const due = Math.max(0,cents(Number(invoice.total_amount))-cents(paid))/100;
  const money = (n: number) => formatMoney(n,options.currency);
  const db = createBrowserSupabase();
  return <details className="admin-record-editor customer-invoice-card">
    <summary><span><strong>Adisyon #{invoice.invoice_number}{invoice.description ? ` · ${invoice.description}` : ""}</strong><small>{dateLabel(invoice.created_at,options.timezone)} · {invoice.is_voided ? "İptal edildi" : due>0 ? paid>0 ? "Kısmi ödendi" : "Ödeme bekliyor" : "Tamamı ödendi"}</small></span><span className={due>0 && !invoice.is_voided ? "customer-due" : ""}>{invoice.is_voided ? money(invoice.total_amount) : `${money(due)} kalan`}</span></summary>
    <div className="customer-invoice-body"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Hizmet</th><th>Adet</th><th>Birim fiyat</th><th>Tutar</th></tr></thead><tbody>{[...invoice.customer_invoice_items].sort((a,b) => a.display_order-b.display_order).map(i => <tr key={i.id}><td>{i.service_name_snapshot}</td><td>{i.quantity}</td><td>{money(i.unit_price)}</td><td>{money(i.line_total)}</td></tr>)}</tbody></table></div>
      <div className="customer-balance-strip"><span>Toplam <b>{money(invoice.total_amount)}</b></span><span>Ödenen <b>{money(paid)}</b></span><span>Kalan <b>{money(invoice.is_voided ? 0 : due)}</b></span></div>
      {!invoice.is_voided && due>0 && <PaymentForm key={`${invoice.id}-${paid}`} invoiceId={invoice.id} due={due} options={options} run={run} busy={busy} />}
      <h3>Tahsilatlar</h3>{invoice.customer_invoice_payments.map(p => <div className="customer-history-row" key={p.id}><div><strong className={p.is_voided ? "muted-amount" : ""}>{money(p.amount)}{p.is_voided ? " · İptal" : ""}</strong><small>{dateLabel(p.paid_at,options.timezone)} · {options.methods.find(m => m.id===p.payment_method_id)?.name || "Ödeme"}</small></div><button className="admin-text-button" disabled={busy || (invoice.is_voided && p.is_voided)} onClick={() => {
        if (!p.is_voided && !window.confirm("Bu tahsilat iptal edilsin mi? Gelirden ve müşteriden kazanılan toplamdan düşülecek; borç yeniden açılacak.")) return;
        void run(() => db.from("customer_invoice_payments").update({is_voided:!p.is_voided}).eq("id",p.id),p.is_voided ? "Tahsilat geri alındı; tüm toplamlar güncellendi." : "Tahsilat iptal edildi; gelir ve müşteri bakiyesi düzeltildi.");
      }}>{p.is_voided ? "Tahsilatı geri al" : "Tahsilatı iptal et"}</button></div>)}
      {!invoice.customer_invoice_payments.length && <p className="admin-hint">Henüz ödeme alınmadı.</p>}
      <div className="customer-invoice-footer"><p className="admin-hint">{paid>0 ? "Adisyonu iptal etmek için önce tahsilatlarını iptal edin." : "Yanlış adisyonu iptal edip doğru hizmet ve tutarlarla yenisini oluşturabilirsiniz."}</p><button className="admin-text-button is-danger" disabled={busy || (!invoice.is_voided && paid>0)} onClick={() => {
        if (!invoice.is_voided && !window.confirm("Adisyon iptal edilsin ve müşterinin kalan borcundan çıkarılsın mı?")) return;
        void run(() => db.from("customer_invoices").update({is_voided:!invoice.is_voided}).eq("id",invoice.id),invoice.is_voided ? "Adisyon tekrar açıldı." : "Adisyon iptal edildi.");
      }}>{invoice.is_voided ? "Adisyonu tekrar aç" : "Adisyonu iptal et"}</button></div>
    </div>
  </details>;
}

function PaymentForm({ invoiceId, due, options, run, busy }: { invoiceId: string; due: number; options: Options; run: Run; busy: boolean }) {
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState(options.methods.find(m => m.is_active)?.id || "");
  const [date, setDate] = useState(today(options.timezone));
  const request = useRef<string | null>(null);
  return <form className="admin-form customer-payment-form" onSubmit={async e => {
    e.preventDefault(); request.current ??= crypto.randomUUID();
    const ok = await run(() => createBrowserSupabase().rpc("record_customer_invoice_payment",{p_payment_id:request.current,p_invoice_id:invoiceId,p_amount:Number(amount),p_payment_method_id:method,p_paid_on:date}),"Tahsilat kaydedildi; gelir, müşteri kazancı ve kalan borç güncellendi.");
    if (ok) { request.current=null; setAmount(""); }
  }}><h3>Ödeme al</h3><div className="customer-payment-grid"><label>Alınan tutar<input required type="number" min="0.01" max={due} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Ödeme yöntemi<select required value={method} onChange={e => setMethod(e.target.value)}><option value="">Seçin</option>{options.methods.filter(m => m.is_active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Tahsilat tarihi<input required type="date" max={today(options.timezone)} value={date} onChange={e => setDate(e.target.value)} /></label></div><button className="button button-dark" disabled={busy}><Check size={16} /> Ödemeyi kaydet</button></form>;
}
