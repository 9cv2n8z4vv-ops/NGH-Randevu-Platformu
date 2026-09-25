import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow"><span className="eyebrow-line" /> 404 · SAYFA BULUNAMADI</span>
      <h1>Bu sayfa<br /><em>burada değil.</em></h1>
      <p>Bağlantı değişmiş veya kaldırılmış olabilir. Ana sayfaya dönerek devam edebilirsiniz.</p>
      <Link className="button button-dark" href="/"><ArrowLeft size={15} /> Ana sayfaya dön</Link>
    </main>
  );
}
