import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { SubpageFrame } from "@/components/PublicFrame";
import { formatDuration, formatMoney } from "@/lib/format";
import { getPublicSiteData } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const data = await getPublicSiteData().catch(() => null);
  return { title: "Hizmetlerimiz", description: `${data?.settings?.business_name || "İşletme"} hizmetlerini, süre ve fiyat bilgileriyle inceleyin.` };
}

export default async function ServicesPage() {
  const data = await getPublicSiteData().catch(() => null);
  const businessName = data?.settings?.business_name || "Nihat Gökhan Hair Design";
  return (
    <SubpageFrame businessName={businessName} eyebrow="HİZMETLERİMİZ" title="Size özel bakım." description="Hizmetler, yaklaşık süreleri ve başlangıç fiyatlarıyla listelenir. Bir randevuda birden fazla hizmet seçebilirsiniz.">
      {!data?.configured ? <div className="notice-card"><strong>Hizmet bilgileri hazırlanıyor</strong><p>Hizmetler işletme panelinden eklendiğinde burada yayınlanacak.</p></div> : (
        <div className="service-page-list">
          {data.categories.map((category) => {
            const group = data.services.filter((service) => service.category_id === category.id);
            return group.length ? <section className="service-page-group" key={category.id}>
              <h2>{category.name}</h2>{category.description && <p>{category.description}</p>}
              {group.map((service) => <Link className="service-page-row" href={"/hizmetler/" + service.slug} key={service.id}>
                <span><strong>{service.name}</strong><small>{service.short_description}</small></span>
                <span className="service-page-meta"><small><Clock3 size={13} /> {formatDuration(service.duration_minutes)}</small><b>{formatMoney(service.price, data.settings?.currency)}</b></span>
                <ArrowRight size={16} />
              </Link>)}
            </section> : null;
          })}
          {data.services.filter((service) => !service.category_id).length > 0 && <section className="service-page-group">
            <h2>Diğer hizmetler</h2>{data.services.filter((service) => !service.category_id).map((service) => <Link className="service-page-row" href={"/hizmetler/" + service.slug} key={service.id}>
              <span><strong>{service.name}</strong><small>{service.short_description}</small></span>
              <span className="service-page-meta"><small><Clock3 size={13} /> {formatDuration(service.duration_minutes)}</small><b>{formatMoney(service.price, data.settings?.currency)}</b></span>
              <ArrowRight size={16} />
            </Link>)}
          </section>}
          {!data.services.length && <div className="empty-editorial">Hizmetler henüz eklenmedi.</div>}
          <div className="service-page-cta"><p>Size uygun zamanı seçin.</p><Link className="button button-dark" href="/randevu">Randevu oluştur <ArrowRight size={16} /></Link></div>
        </div>
      )}
    </SubpageFrame>
  );
}
