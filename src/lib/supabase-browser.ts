import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase browser configuration is missing.");
  // Supabase's default invitation email returns tokens in the URL fragment.
  // The setup page consumes those tokens explicitly with setSession so they
  // are stored in the SSR cookie format without PKCE trying to parse them.
  browserClient ??= createBrowserClient(url, key, {
    auth: { detectSessionInUrl: false },
  });
  return browserClient;
}
