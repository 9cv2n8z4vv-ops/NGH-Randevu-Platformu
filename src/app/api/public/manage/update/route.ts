import { allowRequest, requestKey } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase";
import { manageUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!allowRequest("manage:" + requestKey(request), 8, 10 * 60 * 1000)) {
    return Response.json({ error: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." }, { status: 429 });
  }
  const parsed = manageUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Seçimlerinizi kontrol edip tekrar deneyin." }, { status: 400 });
  const supabase = createPublicClient();
  if (!supabase) return Response.json({ error: "Randevu sistemi henüz yapılandırılmadı." }, { status: 503 });
  const { data, error } = await supabase.rpc("change_appointment", {
    p_code: parsed.data.code,
    p_phone: parsed.data.phone,
    p_service_ids: parsed.data.serviceIds,
    p_staff_id: parsed.data.staffId,
    p_date: parsed.data.date,
    p_start_time: parsed.data.time,
  });
  if (error) {
    const message = /not_editable|change_window_closed/i.test(error.message)
      ? "Bu randevunun değiştirme süresi kapanmış veya randevu artık düzenlenemiyor."
      : /slot_unavailable|appointments_staff_id/i.test(error.message)
        ? "Bu saat az önce doldu. Başka bir saat seçin."
        : "Randevu güncellenemedi.";
    return Response.json({ error: message }, { status: 409 });
  }
  return Response.json({ ok: true, code: data?.[0]?.appointment_code });
}
