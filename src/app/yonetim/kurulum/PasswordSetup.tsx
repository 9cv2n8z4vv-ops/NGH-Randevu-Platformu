"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase-browser";

type SessionState = "checking" | "ready" | "missing";

export function PasswordSetup() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const client = createBrowserSupabase();
    let active = true;

    const { data: { subscription } } = client.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null,
    ) => {
      if (!active) return;
      setSessionState(session ? "ready" : "missing");
    });

    void (async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const linkType = fragment.get("type");

      if (
        accessToken
        && refreshToken
        && ["invite", "recovery", "magiclink"].includes(linkType ?? "")
      ) {
        const { error: sessionError } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!active) return;
        if (sessionError) {
          setSessionState("missing");
          return;
        }

        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search,
        );
      }

      const { data, error: sessionError } = await client.auth.getSession();
      if (!active) return;
      setSessionState(!sessionError && data.session ? "ready" : "missing");
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Parolanız en az 12 karakter olmalı.");
      return;
    }
    if (password !== confirmation) {
      setError("Parola alanları eşleşmiyor.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await createBrowserSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;
      setComplete(true);
      router.replace("/yonetim");
      router.refresh();
    } catch {
      setError("Parolanız kaydedilemedi. Davet veya parola yenileme bağlantısını yeniden açın.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <Link className="admin-back-link" href="/"><ArrowLeft size={15} /> Siteye dön</Link>
      <section className="admin-login-card" aria-labelledby="password-setup-title">
        <span className="admin-login-mark"><KeyRound size={19} /></span>
        <span className="eyebrow"><span className="eyebrow-line" /> İŞLETME PANELİ</span>
        <h1 id="password-setup-title">Parolanızı belirleyin.</h1>

        {sessionState === "checking" && <p role="status">Davet bağlantınız doğrulanıyor…</p>}

        {sessionState === "missing" && (
          <>
            <p role="alert">Geçerli bir davet oturumu bulunamadı. Yönetici davet veya parola yenileme bağlantısını açın.</p>
            <Link className="button button-dark" href="/yonetim/giris">Yönetici girişine dön</Link>
          </>
        )}

        {sessionState === "ready" && !complete && (
          <>
            <p>Bu hesapta kullanacağınız yeni parolayı oluşturun.</p>
            <form onSubmit={savePassword}>
              <label>Yeni parola
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>Yeni parolayı tekrar girin
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-dark" type="submit" disabled={busy}>
                {busy ? "Kaydediliyor…" : "Parolayı kaydet"}
              </button>
            </form>
            <small>Parolanız bu siteye gönderilir ve Supabase Auth tarafından saklanır.</small>
          </>
        )}

        {complete && <p role="status">Parolanız kaydedildi. Yönetim paneli açılıyor…</p>}
      </section>
    </main>
  );
}
