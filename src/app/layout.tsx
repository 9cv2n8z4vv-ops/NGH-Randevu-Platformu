import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Online Randevu", template: "%s" },
  description: "Hizmetinizi seçin, uygun personel ve saati bulun, randevunuzu kolayca oluşturun.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://ngh-salon-platform.vercel.app"),
  openGraph: { type: "website", locale: "tr_TR" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
