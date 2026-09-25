import type { Metadata } from "next";
import { SubpageFrame } from "@/components/PublicFrame";
import { getPublicSiteData } from "@/lib/public-data";

export const metadata: Metadata = { title: "Gizlilik ve kişisel veriler" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const data = await getPublicSiteData().catch(() => null);
  const businessName = data?.settings?.business_name || "Nihat Gökhan Hair Design";
  const customNotice = data?.settings?.privacy_policy_text?.trim();
  return <SubpageFrame businessName={businessName} eyebrow="KİŞİSEL VERİLER" title="Verileriniz, özenle." description="Randevu işlemleri sırasında işlenen kişisel veriler hakkında bilgilendirme.">
    <article className="legal-copy">
      {customNotice ? customNotice.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <>
      <p>Bu bilgilendirme, randevu talebi oluştururken paylaştığınız kişisel verilerin nasıl kullanıldığını açıklar. Veri sorumlusu, işletme ayarlarında adı ve iletişim bilgileri belirtilen işletmedir.</p>
      <h2>İşlenen bilgiler</h2>
      <p>Ad, soyad, telefon numarası, isteğe bağlı e-posta adresi, seçilen hizmet ve randevu zamanı; randevuyu oluşturmak, doğrulamak, yönetmek ve hizmeti sunmak için işlenir. Randevu notuna sağlık veya benzeri özel nitelikli kişisel bilgi yazmayın.</p>
      <h2>İşleme amacı ve hukuki sebep</h2>
      <p>Bilgiler, talep ettiğiniz randevuyu oluşturmak ve hizmeti sunmak için gerekli olduğu ölçüde kullanılır. Bu işlemler için esas alınan hukuki sebep işletmenin somut veri işleme faaliyetine göre belirlenmelidir. Bu sayfadaki onay kutusu yalnızca bilgilendirmeyi okuduğunuzu kaydeder; açık rıza yerine geçmez.</p>
      <h2>Altyapı sağlayıcıları</h2>
      <p>Randevu sistemi, verilerin saklanması ve sitenin sunulması için teknik altyapı sağlayıcılarından yararlanabilir. Kullanılan hizmetlerin ve veri bölgelerinin güncel listesi ile olası yurt dışı aktarım koşulları işletme tarafından doğrulanıp bu alana eklenmelidir.</p>
      <h2>Saklama ve güvenlik</h2>
      <p>Randevu kayıtlarının saklama süresi işletmenin operasyonel ve yasal gereksinimlerine göre belirlenmeli ve burada açıklanmalıdır. Verilere yalnızca yetkili işletme kullanıcıları erişebilir.</p>
      <h2>Haklarınız ve iletişim</h2>
      <p>6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamındaki haklarınız ve başvuru yöntemi için işletmenin telefon veya e-posta adresinden iletişime geçebilirsiniz. Veri sorumlusunun adı, iletişim kanalları, veri alıcıları, hukuki sebepler ve saklama açıklaması işletme yöneticisi tarafından doğrulanmalıdır.</p>
      </>}
    </article>
  </SubpageFrame>;
}
