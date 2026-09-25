import type { MetadataRoute } from "next";
import { getPublicSiteData } from "@/lib/public-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getPublicSiteData().catch(() => null);
  const base = (data?.settings?.canonical_url || process.env.NEXT_PUBLIC_SITE_URL || "https://ngh-salon-platform.vercel.app").replace(/\/$/, "");
  const fixed = ["", "/hizmetler", "/gizlilik"].map((path) => ({
    url: base + path,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
  const services = (data?.services ?? []).map((service) => ({
    url: base + "/hizmetler/" + service.slug,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));
  return [...fixed, ...services];
}
