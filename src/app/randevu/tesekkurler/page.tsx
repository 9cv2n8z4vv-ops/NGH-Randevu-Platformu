import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SubpageFrame } from "@/components/PublicFrame";
import { getPublicSiteData } from "@/lib/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Randevu talebiniz alındı", robots: { index: false, follow: false } };

export default async function BookingThanksPage({ searchParams }: { searchParams: Promise<{ kod?: string }> }) {
  const [{ kod }, data] = await Promise.all([searchParams, getPublicSiteData().catch(() => null)]);
  const code = kod && /^RND-[A-Z0-9]{20}$/.test(kod) ? kod : "";
  return (
    <SubpageFrame businessName={data?.settings?.business_name || "Nihat Gökhan Hair Design"} eyebrow="RANDEVU" title={code ? "Zamanınız ayrıldı." : "Randevu bilgisi bulunamadı."} description={code ? "Randevunuz oluşturuldu. Aşağıdaki kodu saklayın; randevunuzu daha sonra bu kod ve telefon numaranızla yönetebilirsiniz." : "Randevu kodu eksik veya geçersiz. Randevu oluşturmak için akışı yeniden başlatın."}>
      {code ? <div className="success-card">
        <CheckCircle2 size={34} />
        <span>RANDEVU KODUNUZ</span>
        <strong className="booking-code">{code}</strong>
        <p>Kodu ve randevuda kullandığınız telefon numarasını saklayın.</p>
        <Link className="button button-dark" href="/randevumu-yonet">Randevumu yönet <ArrowRight size={16} /></Link>
      </div> : <div className="notice-card"><Link className="button button-dark" href="/randevu">Randevu oluşturmaya dön <ArrowRight size={16} /></Link></div>}
    </SubpageFrame>
  );
}
