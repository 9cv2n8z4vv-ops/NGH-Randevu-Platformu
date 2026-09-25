import { randomBytes } from "node:crypto";
import { allowRequest, requestKey } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase";
import { appointmentSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!allowRequest("book:" + requestKey(request), 8, 10 * 60 * 1000)) {
    return Response.json({ error: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." }, { status: 429 });
  }
  const parsed = appointmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Form bilgilerini kontrol edip tekrar deneyin." }, { status: 400 });
  if (parsed.data.honeypot) return Response.json({ ok: true });
  const supabase = createPublicClient();
  if (!supabase) return Response.json({ error: "Randevu sistemi henüz yapılandırılmadı." }, { status: 503 });
  const { data, error } = await supabase.rpc("create_appointment", {
    p_code: "RND-" + randomBytes(10).toString("hex").toUpperCase(),
    p_service_ids: parsed.data.serviceIds,
    p_staff_id: parsed.data.staffId,
    p_date: parsed.data.date,
    p_start_time: parsed.data.time,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email || null,
    p_note: parsed.data.note || "",
    p_privacy_acknowledged: parsed.data.privacyAcknowledged,
  });
  if (error) {
    const conflict = /slot_unavailable|appointments_staff_id|exclusion constraint/i.test(error.message);
    return Response.json({
      error: conflict ? "Bu saat az önce doldu. Lütfen başka bir saat seçin." : "Randevu oluşturulamadı. Bilgileri kontrol edip tekrar deneyin.",
    }, { status: conflict ? 409 : 400 });
  }
  return Response.json({ code: data?.[0]?.appointment_code }, { status: 201 });
}
