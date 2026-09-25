import type { MetadataRoute } from "next";
import { getPublicSiteData } from "@/lib/public-data";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const data = await getPublicSiteData().catch(() => null);
  const base = data?.settings?.canonical_url || process.env.NEXT_PUBLIC_SITE_URL || "https://ngh-salon-platform.vercel.app";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/yonetim", "/api", "/randevu/tesekkurler", "/randevumu-yonet"] },
    ],
    sitemap: base.replace(/\/$/, "") + "/sitemap.xml",
  };
}
