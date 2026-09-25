"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Search } from "lucide-react";
import type { PublicSiteData } from "@/lib/types";
import { formatDate, formatDuration, formatMoney } from "@/lib/format";

type Appointment = {
  code: string; firstName: string; lastName: string; staffId: string; staffName: string;
  date: string; time: string; status: string; quotedTotal: number;
  services: Array<{ id: string | null; name: string; duration: number; price: number }>;
};

const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export function ManageAppointment({ data }: { data: PublicSiteData }) {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => data.services.filter((service) => selectedServices.includes(service.id)), [data.services, selectedServices]);
  const eligibleStaff = useMemo(() => data.staff.filter((member) => selected.length && selected.every((service) => member.service_ids.includes(service.id))), [data.staff, selected]);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const response = await fetch("/api/public/manage/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim().toUpperCase(), phone }) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setAppointment(null); setError(body.error || "Randevu bulunamadı."); return; }
    const found = body.appointment as Appointment;
    setAppointment(found); setSelectedServices(found.services.flatMap((item) => item.id && data.services.some((service) => service.id === item.id) ? [item.id] : []));
    setStaffId(found.staffId); setDate(found.date); setTime(found.time);
  }

  async function findSlots() {
    setError(""); setTime("");
    if (!staffId || !date || !selectedServices.length) { setError("Hizmet, personel ve tarih seçin."); return; }
    const query = new URLSearchParams({ staffId, date });
    selectedServices.forEach((id) => query.append("serviceId", id));
    const response = await fetch("/api/public/slots?" + query.toString(), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error || "Uygun saatler yüklenemedi."); return; }
    setSlots(body.slots || []);
    if (!body.slots?.length) setError("Bu gün için uygun saat bulunamadı.");
  }

  async function saveChange() {
    if (!appointment || !time) { setError("Yeni randevu saatini seçin."); return; }
    setBusy(true); setError(""); setNotice("");
    const response = await fetch("/api/public/manage/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: appointment.code, phone, serviceIds: selectedServices, staffId, date, time }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setError(body.error || "Randevu değiştirilemedi."); return; }
    setNotice("Randevunuz güncellendi. Kodunuz değişmedi: " + body.code);
    setAppointment({ ...appointment, staffId, staffName: eligibleStaff.find((item) => item.id === staffId)?.full_name || appointment.staffName, date, time });
  }

  const statusLabels: Record<string, string> = { pending: "Onay bekliyor", confirmed: "Onaylandı", completed: "Tamamlandı", cancelled: "İptal edildi", no_show: "Gelmedi" };
  return <div className="manage-layout">
    <form className="manage-lookup-card" onSubmit={lookup}>
      <span className="eyebrow"><span className="eyebrow-line" /> GÜVENLİ RANDEVU ERİŞİMİ</span>
      <h2>Randevunuzu bulun.</h2>
      <p>Onay ekranında verilen kod ile randevuda kullandığınız telefon numarasını girin.</p>
      <label>Randevu kodu<input required autoComplete="off" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="RND-…" maxLength={24} /></label>
      <label>Telefon numarası<input required inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xx xxx xx xx" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      <button className="button button-dark" disabled={busy}><Search size={15} /> {busy ? "Kontrol ediliyor…" : "Randevumu bul"}</button>
    </form>
    {appointment && <section className="manage-detail-card">
      <div className="manage-card-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> {appointment.code}</span><h2>Merhaba {appointment.firstName}.</h2></div><span className="status-pill">{statusLabels[appointment.status] || appointment.status}</span></div>
      <div className="manage-facts"><div><small>MEVCUT RANDEVU</small><strong>{formatDate(appointment.date)} · {appointment.time}</strong></div><div><small>PERSONEL</small><strong>{appointment.staffName}</strong></div><div><small>HİZMETLER</small><strong>{appointment.services.map((item) => item.name).join(", ")}</strong></div><div><small>TAHMİNİ TOPLAM</small><strong>{formatMoney(appointment.quotedTotal, data.settings?.currency)}</strong></div></div>
      {appointment.status === "confirmed" || appointment.status === "pending" ? <div className="manage-edit">
        <h3>Randevuyu düzenle</h3><p>Değişiklikler, randevu saatinize {data.settings?.manage_changes_lock_hours ?? 24} saat kalana kadar yapılabilir.</p>
        <div className="manage-service-choices">{data.services.map((service) => <label key={service.id}><input type="checkbox" checked={selectedServices.includes(service.id)} onChange={(event) => setSelectedServices((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))} /><span>{service.name}<small>{formatDuration(service.duration_minutes)}</small></span></label>)}</div>
        <div className="manage-fields"><label>Personel<select value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Seçin</option>{eligibleStaff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label><label>Yeni tarih<input type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="button button-outline" type="button" onClick={findSlots}>Saatleri göster <ArrowRight size={15} /></button></div>
        <div className="slot-grid">{slots.map((slot) => <button type="button" className={time === slot ? "slot-button is-selected" : "slot-button"} key={slot} onClick={() => setTime(slot)}>{slot}</button>)}</div>
        <button className="button button-dark" disabled={busy || !time} onClick={saveChange}>{busy ? "Kaydediliyor…" : "Değişikliği kaydet"} <Check size={16} /></button>
      </div> : <p className="manage-readonly">Bu randevu artık değiştirilemiyor. Yardım için işletmeyle doğrudan iletişime geçin.</p>}
    </section>}
  </div>;
}
