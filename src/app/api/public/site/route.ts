import { getPublicSiteData } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getPublicSiteData(), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return Response.json({ error: "İçerik şu anda yüklenemiyor." }, { status: 503 });
  }
}
