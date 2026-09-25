"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock3, UserRound } from "lucide-react";
import { formatDate, formatDuration, formatMoney, toLocalDateValue } from "@/lib/format";
import type { PublicSiteData } from "@/lib/types";

const steps = ["Hizmet", "Personel", "Tarih ve saat", "Bilgiler", "Onay"];

export function BookingWizard({ data }: { data: PublicSiteData }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const minDate = toLocalDateValue();

  const selectedServices = useMemo(
    () => data.services.filter((service) => serviceIds.includes(service.id)),
    [data.services, serviceIds],
  );
  const duration = selectedServices.reduce((sum, service) => sum + service.duration_minutes, 0);
  const total = selectedServices.reduce((sum, service) => sum + Number(service.price), 0);
  const eligibleStaff = data.staff.filter((person) => serviceIds.length > 0 && serviceIds.every((id) => person.service_ids.includes(id)));
  const serviceKey = serviceIds.slice().sort().join(",");

  async function loadSlots(targetDate: string) {
    if (!staffId || !targetDate || !serviceKey) return;
    setSlots([]);
    setTime("");
    setLoadingSlots(true);
    setError("");
    const query = new URLSearchParams({ staffId, date });
    serviceKey.split(",").forEach((id) => query.append("serviceId", id));
    query.set("date", targetDate);
    try {
      const response = await fetch("/api/public/slots?" + query.toString(), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Uygun saatler yüklenemedi.");
      setSlots(result.slots as string[]);
      if (!result.slots?.length) setError("Bu tarihte uygun saat bulunmuyor. Başka bir gün deneyin.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Uygun saatler yüklenemedi.");
    } finally { setLoadingSlots(false); }
  }

  function toggleService(id: string) {
    setServiceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setStaffId("");
    setTime("");
    setSlots([]);
  }

  function next() {
    setError("");
    if (step === 0 && !serviceIds.length) return setError("Devam etmek için en az bir hizmet seçin.");
    if (step === 1 && !staffId) return setError("Devam etmek için personel seçin.");
    if (step === 2 && (!date || !time)) return setError("Randevu tarihi ve saati seçin.");
    if (step === 3 && (!firstName.trim() || !lastName.trim() || !phone.trim() || !accepted)) {
      return setError("Zorunlu alanları doldurun ve gizlilik bilgilendirmesini onaylayın.");
    }
    if (step === 3 && data.settings?.require_email && !email.trim()) {
      return setError("E-posta adresi zorunludur.");
    }
    if (step === 3 && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError("E-posta adresinizi kontrol edin.");
    }
    setStep((current) => Math.min(4, current + 1));
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/public/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceIds, staffId, date, time, firstName, lastName, phone, email, note,
          privacyAcknowledged: accepted,
          honeypot,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Randevunuz oluşturulamadı.");
      router.push("/randevu/tesekkurler?kod=" + encodeURIComponent(result.code));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bir hata oluştu. Tekrar deneyin.");
      if (reason instanceof Error && reason.message.includes("az önce doldu")) {
        setStep(2);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="booking-layout">
      <div className="booking-main">
        <ol className="stepper" aria-label="Randevu adımları">
          {steps.map((label, index) => (
            <li className={index === step ? "is-current" : index < step ? "is-done" : ""} key={label}>
              <span>{index < step ? <Check size={14} /> : "0" + (index + 1)}</span><small>{label}</small>
            </li>
          ))}
        </ol>

        {step === 0 && <section className="wizard-step">
          <div className="wizard-heading"><span>01 — HİZMETİNİZ</span><h2>Size nasıl yardımcı<br />olabiliriz?</h2><p>Bir randevuda birden fazla hizmet seçebilirsiniz.</p></div>
          {!data.services.length ? <div className="notice-card"><strong>Henüz hizmet eklenmedi</strong><p>Hizmetler yönetim panelinden eklendiğinde seçilebilir olacak.</p></div> : (
            <div className="choice-list">
              {data.categories.map((category) => {
                const services = data.services.filter((service) => service.category_id === category.id);
                if (!services.length) return null;
                return <div className="choice-group" key={category.id}><h3>{category.name}</h3>{services.map((service) => (
                  <button className={"choice-card " + (serviceIds.includes(service.id) ? "selected" : "")} type="button" key={service.id} onClick={() => toggleService(service.id)} aria-pressed={serviceIds.includes(service.id)}>
                    <span className="choice-check">{serviceIds.includes(service.id) && <Check size={15} />}</span>
                    <span className="choice-main"><strong>{service.name}</strong><small>{service.short_description || service.description}</small></span>
                    <span className="choice-meta"><b>{formatMoney(service.price, data.settings?.currency)}</b><small><Clock3 size={12} /> {formatDuration(service.duration_minutes)}</small></span>
                  </button>
                ))}</div>;
              })}
              {data.services.filter((service) => !service.category_id).length > 0 && <div className="choice-group"><h3>Diğer hizmetler</h3>{data.services.filter((service) => !service.category_id).map((service) => (
                <button className={"choice-card " + (serviceIds.includes(service.id) ? "selected" : "")} type="button" key={service.id} onClick={() => toggleService(service.id)} aria-pressed={serviceIds.includes(service.id)}>
                  <span className="choice-check">{serviceIds.includes(service.id) && <Check size={15} />}</span>
                  <span className="choice-main"><strong>{service.name}</strong><small>{service.short_description}</small></span>
                  <span className="choice-meta"><b>{formatMoney(service.price, data.settings?.currency)}</b><small><Clock3 size={12} /> {formatDuration(service.duration_minutes)}</small></span>
                </button>
              ))}</div>}
            </div>
          )}
        </section>}

        {step === 1 && <section className="wizard-step">
          <div className="wizard-heading"><span>02 — UZMANINIZ</span><h2>Birlikte çalışmak<br />istediğiniz kişi.</h2><p>Seçtiğiniz tüm hizmetleri veren personeller listelenir.</p></div>
          <div className="staff-grid">
            {eligibleStaff.map((person) => <button type="button" className={"staff-card " + (staffId === person.id ? "selected" : "")} onClick={() => { setStaffId(person.id); setTime(""); setSlots([]); }} key={person.id} aria-pressed={staffId === person.id}>
              <span className="staff-avatar"><UserRound size={22} /></span><strong>{person.full_name}</strong><small>{person.bio || "Saç tasarımı uzmanı"}</small>{staffId === person.id && <span className="staff-selected"><Check size={14} /></span>}
            </button>)}
            {!eligibleStaff.length && <div className="notice-card"><strong>Bu hizmetler için personel bulunamadı</strong><p>İşletme, seçilen hizmetleri verebilen personel eklediğinde burada görünür.</p><button className="text-button" type="button" onClick={() => setStep(0)}>Hizmet seçimini düzenle</button></div>}
          </div>
        </section>}

        {step === 2 && <section className="wizard-step">
          <div className="wizard-heading"><span>03 — TAKVİM</span><h2>Size uyan zamanı<br />seçin.</h2><p>Yalnızca gerçekten uygun saatler gösterilir.</p></div>
          <label className="field-label" htmlFor="booking-date">Randevu tarihi</label>
          <input className="field-input date-input" id="booking-date" type="date" min={minDate || undefined} value={date} onChange={(event) => { setDate(event.target.value); setTime(""); setSlots([]); setError(""); }} />
          <button className="button button-outline slot-search-button" type="button" disabled={!date || loadingSlots} onClick={() => void loadSlots(date)}>{loadingSlots ? "Saatler yükleniyor…" : "Uygun saatleri göster"} <ArrowRight size={15} /></button>
          <div className="slot-heading"><strong>Uygun saatler</strong>{loadingSlots && <span>Yükleniyor…</span>}</div>
          {!date ? <p className="field-help">Önce bir tarih seçin.</p> : !slots.length && !loadingSlots ? <p className="field-help">Bu tarihte uygun saat bulunmuyor. Başka bir gün deneyin.</p> : (
            <div className="slot-grid">
              {slots.map((slot) => <button type="button" className={"slot-button " + (time === slot ? "selected" : "")} aria-pressed={time === slot} key={slot} onClick={() => setTime(slot)}>{slot}</button>)}
            </div>
          )}
        </section>}

        {step === 3 && <section className="wizard-step">
          <div className="wizard-heading"><span>04 — İLETİŞİM</span><h2>Sizi tanıyalım.</h2><p>Randevunuzla ilgili bir değişiklik olursa size ulaşabilmemiz için.</p></div>
          <form className="booking-form" onSubmit={(event) => { event.preventDefault(); next(); }}>
            <div className="form-two">
              <label className="field-label">Ad<input className="field-input" autoComplete="given-name" required maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
              <label className="field-label">Soyad<input className="field-input" autoComplete="family-name" required maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
            </div>
            <label className="field-label">Telefon<input className="field-input" type="tel" autoComplete="tel" required minLength={7} maxLength={30} placeholder="+90 5__ ___ __ __" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label className="field-label">E-posta {data.settings?.require_email ? <span className="required-tag">zorunlu</span> : <span className="optional-tag">isteğe bağlı</span>}
              <input className="field-input" type="email" autoComplete="email" required={data.settings?.require_email} maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field-label">Not <span className="optional-tag">isteğe bağlı</span><textarea className="field-input field-textarea" maxLength={1000} placeholder="Randevunuzla ilgili paylaşmak istediğiniz bir detay varsa…" value={note} onChange={(event) => setNote(event.target.value)} /></label>
            <label className="privacy-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span><Link href="/gizlilik" target="_blank">Kişisel veriler aydınlatma metnini</Link> okudum ve bilgi edindim.</span></label>
            <label className="honeypot" aria-hidden="true">Şirket<input tabIndex={-1} name="company" autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} /></label>
          </form>
        </section>}

        {step === 4 && <section className="wizard-step">
          <div className="wizard-heading"><span>05 — SON KONTROL</span><h2>Her şey hazır mı?</h2><p>Randevuyu oluşturmadan önce bilgilerinizi gözden geçirin.</p></div>
          <div className="review-card">
            <div><small>HİZMETLER</small>{selectedServices.map((service) => <p key={service.id}>{service.name} <span>{formatMoney(service.price, data.settings?.currency)}</span></p>)}</div>
            <div><small>PERSONEL</small><p>{eligibleStaff.find((person) => person.id === staffId)?.full_name}</p></div>
            <div><small>TARİH VE SAAT</small><p>{date ? formatDate(date) : ""} · {time}</p></div>
            <div><small>TAHMİNİ SÜRE</small><p>{formatDuration(duration)}</p></div>
            <div className="review-total"><small>TAHMİNİ TOPLAM</small><p>{formatMoney(total, data.settings?.currency)}</p></div>
            <div><small>İLETİŞİM</small><p>{firstName} {lastName} · {phone}</p></div>
          </div>
          <p className="review-note">Randevu oluşturulduktan sonra size benzersiz bir randevu kodu verilecek. Bu kodu saklayın.</p>
        </section>}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="wizard-controls">
          {step > 0 ? <button className="button button-outline" type="button" onClick={() => { setError(""); setStep((current) => current - 1); }}><ArrowLeft size={15} /> Geri</button> : <span />}
          {step < 4 ? <button className="button button-dark" type="button" onClick={next}>Devam et <ArrowRight size={16} /></button> : (
            <button className="button button-dark" type="button" disabled={submitting} onClick={submit}>
              {submitting ? "Randevu oluşturuluyor…" : "Randevuyu Oluştur"} <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
      <aside className="booking-summary">
        <div className="summary-top"><span>RANDEVU ÖZETİ</span><span>{step + 1} / 5</span></div>
        <h3>Planınız.</h3>
        {selectedServices.length ? <div className="summary-service-list">{selectedServices.map((service) => <div key={service.id}><span>{service.name}</span><small>{formatDuration(service.duration_minutes)}</small></div>)}</div> : <p className="summary-empty">Henüz hizmet seçilmedi.</p>}
        <div className="summary-line"><span>Toplam süre</span><b>{duration ? formatDuration(duration) : "—"}</b></div>
        {staffId && <div className="summary-line"><span>Personel</span><b>{eligibleStaff.find((person) => person.id === staffId)?.full_name}</b></div>}
        {date && time && <div className="summary-line"><span>Tarih</span><b>{formatDate(date)} · {time}</b></div>}
        <div className="summary-total"><span>Tahmini ücret</span><strong>{formatMoney(total, data.settings?.currency)}</strong></div>
        <p className="summary-footnote">Ödeme, hizmet tamamlandıktan sonra işletmede yapılır.</p>
      </aside>
    </div>
  );
}
