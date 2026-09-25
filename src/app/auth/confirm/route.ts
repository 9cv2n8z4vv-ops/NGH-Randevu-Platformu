import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const destination = new URL("/yonetim/kurulum", request.url);

  if (tokenHash && type === "invite") {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });

      if (!error) return NextResponse.redirect(destination);
    }
  }

  destination.searchParams.set("invite", "invalid");
  return NextResponse.redirect(destination);
}
