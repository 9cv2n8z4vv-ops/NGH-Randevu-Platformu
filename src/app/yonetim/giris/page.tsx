"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const client = createBrowserSupabase();
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (authError) {
        if (authError.code === "invalid_credentials") {
          setError("Bu e-posta ve parola eşleşmiyor. Eski cihazda panel açıksa Ayarlar → Yönetici parolası bölümünden yeni parola belirleyin.");
        } else if (authError.status === 429 || authError.code === "over_request_rate_limit") {
          setError("Çok sayıda başarısız deneme yapıldı. Birkaç dakika bekleyip tekrar deneyin.");
        } else {
          setError("Giriş yapılamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.");
        }
        return;
      }
      router.replace("/yonetim"); router.refresh();
    } catch {
      setError("Giriş servisine ulaşılamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.");
    } finally { setBusy(false); }
  }

  return <main className="admin-login-shell">
    <Link className="admin-back-link" href="/"><ArrowLeft size={15} /> Siteye dön</Link>
    <form className="admin-login-card" onSubmit={signIn}>
      <span className="admin-login-mark"><LockKeyhole size={19} /></span>
      <span className="eyebrow"><span className="eyebrow-line" /> İŞLETME PANELİ</span>
      <h1>Tekrar hoş geldiniz.</h1>
      <p>Randevu ve işletme yönetimine devam etmek için giriş yapın.</p>
      <label>E-posta<input type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Parola<input type="password" autoComplete="current-password" autoCapitalize="none" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark" disabled={busy}>{busy ? "Giriş yapılıyor…" : "Giriş yap"}</button>
      <small>Erişim yetkisi yalnızca işletme yöneticilerine verilir. Parola başka cihazda kabul edilmiyorsa, açık kalan yönetici oturumundan değiştirebilirsiniz.</small>
    </form>
  </main>;
}
