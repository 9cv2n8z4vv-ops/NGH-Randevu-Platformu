import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { brandMonogram } from "@/lib/format";

export function PublicHeader({ businessName }: { businessName: string }) {
  return (
    <header className="site-header">
      <Link className="brand-lockup" href="/" aria-label={businessName + " ana sayfa"}>
        <span className="brand-mark">{brandMonogram(businessName)}</span>
        <span className="brand-name">{businessName}<small>RANDEVU &amp; BAKIM</small></span>
      </Link>
      <nav className="desktop-nav" aria-label="Ana menü">
        <Link href="/hizmetler">Hizmetler</Link>
        <Link href="/randevumu-yonet">Randevumu Yönet</Link>
        <Link href="/#iletisim">İletişim</Link>
      </nav>
      <Link className="button button-dark header-cta" href="/randevu">Randevu Al <ArrowRight size={16} /></Link>
    </header>
  );
}

export function PublicFooter({ businessName }: { businessName: string }) {
  return (
    <footer className="site-footer subpage-footer">
      <Link className="brand-lockup footer-brand" href="/">
        <span className="brand-mark">{brandMonogram(businessName)}</span>
        <span className="brand-name">{businessName}<small>RANDEVU &amp; BAKIM</small></span>
      </Link>
      <span>Kendinize ayırdığınız zaman.</span>
      <div><Link href="/gizlilik">Gizlilik</Link><Link href="/randevumu-yonet">Randevumu Yönet</Link></div>
      <small>© {new Date().getFullYear()} {businessName}</small>
    </footer>
  );
}

export function SubpageFrame({
  businessName,
  eyebrow,
  title,
  description,
  children,
}: {
  businessName: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="subpage-shell">
      <PublicHeader businessName={businessName} />
      <div className="subpage-content">
        <nav className="breadcrumbs" aria-label="Sayfa konumu"><Link href="/">Ana Sayfa</Link><span>/</span><span aria-current="page">{title}</span></nav>
        <Link className="back-link" href="/"><ArrowLeft size={15} /> Ana sayfaya dön</Link>
        <div className="subpage-title">
          <span className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {children}
      </div>
      <PublicFooter businessName={businessName} />
    </main>
  );
}
