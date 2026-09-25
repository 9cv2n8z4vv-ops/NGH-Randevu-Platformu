import Link from "next/link";
import type { Metadata } from "next";
import { ArrowDownRight, ArrowRight, CalendarDays, Clock3, Camera, MapPin, Phone, Scissors, Sparkles, Star } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { brandMonogram, formatDuration, formatMoney } from "@/lib/format";
import { getPublicSiteData } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const data = await getPublicSiteData().catch(() => null);
  const name = data?.settings?.business_name || "İşletme";
  const base = data?.settings?.canonical_url || process.env.NEXT_PUBLIC_SITE_URL || "https://ngh-salon-platform.vercel.app";
  return {
    title: data?.settings?.seo_title || name + " | Online Randevu",
    description: data?.settings?.seo_description || data?.settings?.home_description || "Hizmet seçin, uygun saatleri bulun ve randevunuzu online oluşturun.",
    alternates: { canonical: base },
    openGraph: { type: "website", locale: "tr_TR", siteName: name, title: name + " | Online Randevu" },
  };
}

function SafeLink({ href, children, className }: { href: string | null; children: ReactNode; className?: string }) {
  if (!href || !/^https:\/\//i.test(href)) return null;
  return <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>;
}

export default async function HomePage() {
  let data;
  try {
    data = await getPublicSiteData();
  } catch {
    data = { configured: false, settings: null, services: [], categories: [], staff: [], testimonials: [], gallery: [], faqs: [] };
  }
  const settings = data.settings;
  const businessName = settings?.business_name || "Nihat Gökhan Hair Design";
  const monogram = brandMonogram(businessName);
  const phone = settings?.phone || "";
  const theme = {
    "--brand": settings?.primary_color || "#28352D",
    "--accent": settings?.accent_color || "#B88969",
    "--surface": settings?.surface_color || "#F5F1EA",
  } as CSSProperties;
  const safeLogo = settings?.logo_url?.startsWith("https://") ? settings.logo_url : null;

  return (
    <main className="site-shell" style={theme}>
      <header className="site-header">
        <Link className="brand-lockup" href="/" aria-label={businessName + " ana sayfa"}>
          {safeLogo
            ? <span className="brand-image" style={{ backgroundImage: "url('" + safeLogo.replaceAll("'", "%27") + "')" }} aria-label={businessName} role="img" />
            : <span className="brand-mark">{monogram}</span>}
          <span className="brand-name">{businessName}<small>RANDEVU &amp; BAKIM</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Ana menü">
          <Link href="/hizmetler">Hizmetler</Link>
          <a href="#salon">Salon</a>
          <Link href="/randevumu-yonet">Randevumu Yönet</Link>
          <a href="#iletisim">İletişim</a>
        </nav>
        <Link className="button button-dark header-cta" href="/randevu">{settings?.cta_label || "Randevu Al"} <ArrowRight size={16} /></Link>
      </header>

      {!data.configured && (
        <div className="setup-strip" role="status">
          <span>Kurulum devam ediyor</span>
          <p>Supabase bağlantısı tamamlandığında işletme bilgileri ve randevu saatleri burada yayınlanacak.</p>
        </div>
      )}

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> RANDEVUNUZ · SİZE ÖZEL</div>
          <h1>{settings?.home_title || "Kendinize ayırdığınız zaman."}</h1>
          <p className="hero-description">{settings?.home_description || "Saçlarınıza, stilinize ve kendinize iyi bakmak için kişiye özel bir deneyim."}</p>
          <div className="hero-actions">
            <Link className="button button-dark button-large" href="/randevu">{settings?.cta_label || "Randevu Al"} <ArrowRight size={17} /></Link>
            <Link className="text-link" href="/hizmetler">Hizmetleri keşfet <ArrowDownRight size={16} /></Link>
          </div>
          <div className="hero-note"><Sparkles size={15} /> Planlı randevu, size ayrılmış özel zaman.</div>
        </div>
        <div className="hero-art" aria-label={businessName + " için soyut marka tasarımı"} role="img">
          <div className="hero-art-orbit orbit-one" />
          <div className="hero-art-orbit orbit-two" />
          <div className="hero-art-vertical">KENDİNİZE AYIRDIĞINIZ ZAMAN</div>
          <div className="hero-art-center">
            <span className="hero-art-kicker">BAKIM · STİL · İYİ HİSSETMEK</span>
            <span className="hero-art-monogram">{monogram}</span>
            <span className="hero-art-caption">Kendinize ayırdığınız<br />özel bir an.</span>
          </div>
          <div className="hero-art-seal"><Scissors size={17} /><span>ÖZENLE<br />HAZIRLANDI</span></div>
          <div className="hero-art-bottom">SİZE ÖZEL BİR YAKLAŞIM</div>
        </div>
      </section>

      <section className="intro-ribbon" id="salon">
        <p>{settings?.tagline || "Saçlarınız bizimle, salonumuz sizinle parlıyor!"}</p>
        <span className="ribbon-divider" />
        <p className="ribbon-muted">Düşünülmüş detaylar. Size özel bir yaklaşım.</p>
      </section>

      <section className="section-block services-section" id="hizmetler">
        <div className="section-heading">
          <div><span className="eyebrow"><span className="eyebrow-line" /> MENÜMÜZ</span><h2>İyi hissettiren<br /><em>dokunuşlar.</em></h2></div>
          <p>İhtiyacınıza uygun hizmeti seçin. Süre ve fiyat bilgisi randevu öncesinde açıkça gösterilir.</p>
        </div>
        {data.services.length ? (
          <div className="service-list">
            {data.services.slice(0, 6).map((service, index) => (
              <Link className="service-row" href="/randevu" key={service.id}>
                <span className="service-index">0{index + 1}</span>
                <span className="service-row-name">{service.name}<small>{service.short_description}</small></span>
                <span className="service-row-time"><Clock3 size={14} /> {formatDuration(service.duration_minutes)}</span>
                <span className="service-row-price">{formatMoney(service.price, settings?.currency)}</span>
                <ArrowRight className="service-row-arrow" size={17} />
              </Link>
            ))}
          </div>
        ) : <div className="empty-editorial"><Scissors size={19} /><span>Hizmetler işletme panelinden eklendiğinde burada listelenecek.</span></div>}
        <div className="section-end"><span>01 / HİZMETLER</span><Link href="/hizmetler" className="text-link">Tüm hizmetler <ArrowRight size={15} /></Link></div>
      </section>

      {data.gallery.length > 0 && (
        <section className="gallery-section">
          <div className="section-heading gallery-heading">
            <div><span className="eyebrow"><span className="eyebrow-line" /> SALONDAN</span><h2>İşimizden<br /><em>izler.</em></h2></div>
            <p>Her stil, onu taşıyan kişinin hikâyesiyle tamamlanır.</p>
          </div>
          <div className="gallery-grid">
            {data.gallery.slice(0, 4).map((item, index) => {
              const imageUrl = item.image_url.startsWith("https://") ? item.image_url.replaceAll("'", "%27") : "";
              return (
                <div className={"gallery-tile gallery-tile-" + index} key={item.id}>
                  <div className="gallery-image" role="img" aria-label={item.image_alt || item.title} style={{ backgroundImage: imageUrl ? "linear-gradient(180deg, transparent 55%, rgba(22,33,27,.72)), url('" + imageUrl + "')" : undefined }} />
                  <span>{item.title || item.image_alt || "Salon çalışması"}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {data.testimonials.length > 0 && (
        <section className="section-block testimonials-section">
          <div className="section-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> MİSAFİRLERİMİZ</span><h2>Güzel sözler,<br /><em>gerçek deneyimler.</em></h2></div></div>
          <div className="testimonial-grid">
            {data.testimonials.slice(0, 3).map((item) => (
              <article className="testimonial-card" key={item.id}>
                <div className="stars" aria-label={item.rating + " üzerinden 5 yıldız"}>{Array.from({ length: item.rating }, (_, i) => <Star size={13} fill="currentColor" key={i} />)}</div>
                <p>“{item.content}”</p><span>{item.customer_name}</span>
              </article>
            ))}
          </div>
        </section>
      )}

      {data.faqs.length > 0 && (
        <section className="section-block faq-section" id="sss">
          <div className="section-heading">
            <div><span className="eyebrow"><span className="eyebrow-line" /> MERAK EDİLENLER</span><h2>Küçük sorular,<br /><em>net cevaplar.</em></h2></div>
            <p>Randevunuzdan önce aklınıza takılanlara göz atın.</p>
          </div>
          <div className="faq-list">
            {data.faqs.slice(0, 5).map((item) => (
              <details className="faq-item" key={item.id}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>
            ))}
          </div>
        </section>
      )}

      <section className="contact-section" id="iletisim">
        <div className="contact-copy">
          <span className="eyebrow"><span className="eyebrow-line" /> BİZİ BULUN</span>
          <h2>Bir sonraki<br /><em>güzel anınız.</em></h2>
          <p>Size uygun zamanı seçin; geri kalan detayları birlikte planlayalım.</p>
          <Link className="button button-light button-large" href="/randevu">{settings?.cta_label || "Randevu Al"} <ArrowRight size={16} /></Link>
        </div>
        <div className="contact-details">
          {settings?.address && <div className="contact-detail"><MapPin size={18} /><span><small>ADRES</small>{settings.address}</span></div>}
          {phone && <a className="contact-detail" href={"tel:" + phone}><Phone size={18} /><span><small>TELEFON</small>{phone}</span></a>}
          {settings?.email && <a className="contact-detail" href={"mailto:" + settings.email}><span className="contact-detail-dot" /><span><small>E-POSTA</small>{settings.email}</span></a>}
          {settings?.maps_url && <SafeLink className="map-link" href={settings.maps_url}>Yol tarifi al <ArrowRight size={15} /></SafeLink>}
          {settings?.instagram_url && <SafeLink className="map-link" href={settings.instagram_url}><Camera size={15} /> Instagram hesabı <ArrowRight size={15} /></SafeLink>}
          {settings?.maps_embed_url?.startsWith("https://") && <div className="map-frame"><iframe src={settings.maps_embed_url} loading="lazy" title={businessName + " harita konumu"} referrerPolicy="no-referrer-when-downgrade" /></div>}
        </div>
      </section>

      <footer className="site-footer">
        <Link className="brand-lockup footer-brand" href="/"><span className="brand-mark">{monogram}</span><span className="brand-name">{businessName}<small>RANDEVU &amp; BAKIM</small></span></Link>
        <span>{settings?.footer_text || "Kendinize ayırdığınız zaman."}</span>
        <div><Link href="/gizlilik">Gizlilik</Link><Link href="/randevumu-yonet">Randevumu Yönet</Link><Link href="/admin/login">Yönetim</Link></div>
        <small>© {new Date().getFullYear()} {businessName}</small>
      </footer>

      <div className="mobile-cta">
        {phone && <a href={"tel:" + phone} aria-label="İşletmeyi ara"><Phone size={18} /></a>}
        <Link href="/randevu"><CalendarDays size={17} /> Randevu Al <ArrowRight size={16} /></Link>
      </div>
    </main>
  );
}
