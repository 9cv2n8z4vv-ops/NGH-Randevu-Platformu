import { createPublicClient } from "@/lib/supabase";
import { slotsQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = slotsQuerySchema.safeParse({
    staffId: url.searchParams.get("staffId"),
    date: url.searchParams.get("date"),
    serviceIds: url.searchParams.getAll("serviceId"),
  });
  if (!parsed.success) return Response.json({ error: "Tarih, hizmet veya personel seçimi geçersiz." }, { status: 400 });
  const supabase = createPublicClient();
  if (!supabase) return Response.json({ error: "Randevu sistemi henüz yapılandırılmadı." }, { status: 503 });
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_date: parsed.data.date,
    p_staff_id: parsed.data.staffId,
    p_service_ids: parsed.data.serviceIds,
  });
  if (error) return Response.json({ error: "Uygun saatler şu anda getirilemiyor." }, { status: 503 });
  return Response.json({ slots: (data ?? []).map((row: { slot_time: string }) => row.slot_time) }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
