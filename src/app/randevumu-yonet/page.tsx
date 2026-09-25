import type { Metadata } from "next";
import { SubpageFrame } from "@/components/PublicFrame";
import { ManageAppointment } from "./ManageAppointment";
import { getPublicSiteData } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Randevumu yönet", robots: { index: false, follow: false } };

export default async function ManageAppointmentPage() {
  const data = await getPublicSiteData().catch(() => null);
  return <SubpageFrame businessName={data?.settings?.business_name || "Nihat Gökhan Hair Design"} eyebrow="RANDEVU YÖNETİMİ" title="Planınızı yönetin." description="Randevunuzu görüntüleyin ve uygun değişiklik penceresinde yeni zaman seçin.">
    {!data?.configured ? <div className="notice-card"><strong>Randevu sistemi hazırlanıyor</strong><p>Veritabanı bağlandığında randevu kodunuzla giriş yapabilirsiniz.</p></div> : <ManageAppointment data={data} />}
  </SubpageFrame>;
}
