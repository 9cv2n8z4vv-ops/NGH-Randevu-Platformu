import { createPublicClient } from "@/lib/supabase";
import type { PublicSiteData } from "@/lib/types";

export async function getPublicSiteData(): Promise<PublicSiteData> {
  const supabase = createPublicClient();
  if (!supabase) {
    return { configured: false, settings: null, services: [], categories: [], staff: [], testimonials: [], gallery: [], faqs: [] };
  }
  const [settings, services, categories, staff, staffServices, testimonials, gallery, faqs] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("services").select("*").eq("is_active", true).is("archived_at", null).order("display_order"),
    supabase.from("service_categories").select("*").eq("is_active", true).is("archived_at", null).order("display_order"),
    supabase.from("staff").select("*").eq("is_active", true).is("archived_at", null).order("display_order"),
    supabase.from("staff_services").select("staff_id, service_id"),
    supabase.from("testimonials").select("*").eq("is_active", true).order("display_order"),
    supabase.from("gallery_items").select("*").eq("is_active", true).order("display_order"),
    supabase.from("faqs").select("*").eq("is_active", true).order("display_order"),
  ]);
  if (settings.error) throw new Error("İşletme ayarları yüklenemedi.");
  if (services.error || categories.error || staff.error || staffServices.error) {
    throw new Error("Hizmet ve personel bilgileri yüklenemedi.");
  }
  return {
    configured: true,
    settings: settings.data,
    services: services.data ?? [],
    categories: categories.data ?? [],
    staff: (staff.data ?? []).map((member) => ({
      ...member,
      service_ids: (staffServices.data ?? []).filter((row) => row.staff_id === member.id).map((row) => row.service_id),
    })),
    testimonials: testimonials.data ?? [],
    gallery: gallery.data ?? [],
    faqs: faqs.data ?? [],
  } as PublicSiteData;
}
