import { createCronSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabase = createCronSupabase();
  if (!supabase) return Response.json({ error: "Cron database credentials are missing." }, { status: 503 });
  const { data, error } = await supabase.rpc("generate_due_recurring_expenses");
  if (error) return Response.json({ error: "Recurring expense generation failed." }, { status: 500 });
  return Response.json({ ok: true, created: data ?? 0 });
}
