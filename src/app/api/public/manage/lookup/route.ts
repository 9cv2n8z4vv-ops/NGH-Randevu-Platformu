import { allowRequest, requestKey } from "@/lib/rate-limit";
import { createPublicClient } from "@/lib/supabase";
import { manageLookupSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!allowRequest("lookup:" + requestKey(request), 10, 10 * 60 * 1000)) {
    return Response.json({ error: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." }, { status: 429 });
  }
  const parsed = manageLookupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Randevu kodu ve telefon numarasını kontrol edin." }, { status: 400 });
  const supabase = createPublicClient();
  if (!supabase) return Response.json({ error: "Randevu sistemi henüz yapılandırılmadı." }, { status: 503 });
  const { data, error } = await supabase.rpc("lookup_appointment", {
    p_code: parsed.data.code,
    p_phone: parsed.data.phone,
  });
  if (error || !data) return Response.json({ error: "Bu kod ve telefonla eşleşen randevu bulunamadı." }, { status: 404 });
  return Response.json({ appointment: data }, { headers: { "Cache-Control": "no-store" } });
}
