import type { Metadata } from "next";
import { SubpageFrame } from "@/components/PublicFrame";
import { BookingWizard } from "./BookingWizard";
import { getPublicSiteData } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Randevu Al", robots: { index: false, follow: false } };

export default async function BookingPage() {
  const data = await getPublicSiteData().catch(() => null);
  const businessName = data?.settings?.business_name || "Nihat Gökhan Hair Design";
  return (
    <SubpageFrame
      businessName={businessName}
      eyebrow="RANDEVU OLUŞTUR"
      title="Sizin zamanınız."
      description="Hizmetleri seçin, size uygun kişiyi ve saati bulun. Randevunuzu birkaç adımda tamamlayın."
    >
      {!data?.configured
        ? <div className="notice-card" role="status"><strong>Randevu sistemi hazırlanıyor</strong><p>İşletme veritabanı bağlandığında uygun hizmetler ve saatler burada görüntülenecek.</p></div>
        : <BookingWizard data={data} />}
    </SubpageFrame>
  );
}
