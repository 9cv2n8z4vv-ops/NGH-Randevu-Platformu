import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { SubpageFrame } from "@/components/PublicFrame";
import { formatDuration, formatMoney } from "@/lib/format";
import { getPublicSiteData } from "@/lib/public-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicSiteData().catch(() => null);
  const service = data?.services.find((item) => item.slug === slug);
  if (!service) return { title: "Hizmet bulunamadı" };
  return {
    title: service.name + " | " + (data?.settings?.business_name || "İşletme"),
    description: service.short_description || service.description,
    alternates: { canonical: "/hizmetler/" + service.slug },
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicSiteData().catch(() => null);
  const service = data?.services.find((item) => item.slug === slug);
  if (!service) notFound();
  const businessName = data?.settings?.business_name || "Nihat Gökhan Hair Design";
  const category = data?.categories.find((item) => item.id === service.category_id);
  return (
    <SubpageFrame businessName={businessName} eyebrow={category?.name || "HİZMETLERİMİZ"} title={service.name} description={service.short_description || service.description}>
      <div className="service-detail-card">
        <div className="service-detail-top"><span><Clock3 size={15} /> {formatDuration(service.duration_minutes)}</span><strong>{formatMoney(service.price, data?.settings?.currency)}</strong></div>
        {service.description && <p>{service.description}</p>}
        <Link className="button button-dark button-large" href="/randevu">Bu hizmet için randevu al <ArrowRight size={16} /></Link>
      </div>
    </SubpageFrame>
  );
}
