# NGH Salon Platform

Responsive salon website, public appointment booking, appointment self-service, and an authenticated operations console. Built with Next.js App Router, TypeScript, Supabase Auth/Postgres/Storage, and Vercel.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the fresh Supabase project's URL and publishable key. The protected cron route uses `SUPABASE_SECRET_KEY` on the server; never prefix it with `NEXT_PUBLIC_` or commit it. The legacy `SUPABASE_SERVICE_ROLE_KEY` is accepted as a temporary fallback.

## Fresh Supabase project

The ordered migrations under `supabase/migrations/` create the salon catalog, staff and availability, booking and customer records, financial tables, recurring expenses, content tables, audit history, RLS policies, public storage bucket, and guarded booking functions. They also narrow function grants and add foreign-key indexes. Only default site settings, payment methods, and expense categories are inserted; no services, employees, or appointments are fabricated.

The current target is Supabase organization `Tuna Yelmen's Appointment operation for NGH`, project `TunaYelmen's Project` (`enxwrhkilalgnunbagie`). The migrations have been applied and verified on that fresh project. For another fresh target, apply every migration in timestamp order, then retrieve that project's URL and publishable key. Do not link this checkout to an unrelated existing project.

### First administrator

1. In Supabase Authentication → URL Configuration, set **Site URL** to `https://ngh-salon-platform.vercel.app/yonetim/kurulum` and add that exact URL under **Redirect URLs**.
2. In Authentication → Users, choose **Add user → Send invitation** for the owner. The invitation link opens the production password setup page, where the owner creates a new password.
3. In the SQL editor, grant only that account access:

   ```sql
   insert into public.admin_users (user_id, full_name, role)
   select id, 'İşletme Sahibi', 'owner'
   from auth.users
   where email = 'owner@example.com'
   on conflict (user_id) do update
     set full_name = excluded.full_name, role = excluded.role;
   ```

4. Sign in at `/yonetim/giris` after setting the password.

RLS restricts customer, appointment, financial, and audit data to users in `admin_users`. Public booking is performed through narrowly granted functions; it does not expose customer tables.

## Vercel

The Vercel project `ngh-salon-platform` is live at <https://ngh-salon-platform.vercel.app> and is connected to this GitHub repository. Pushes to `main` trigger production deployments.

Set the environment variables for Preview and Production in Vercel. The daily recurring-expense cron is scheduled for 06:00 UTC; it requires both `CRON_SECRET` and the server-only `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`). Without those values, the endpoint safely rejects the scheduled request and recurring expenses are not generated automatically.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

The GitHub Actions workflow runs these checks on pushes to `main` and on pull requests.

## Operations checklist

- Configure the actual business name, contacts, address, working hours, staff schedules, services, prices, SEO, and branding in the admin console.
- Review the public personal-data notice before accepting real bookings. Its owner identity, recipients/transfers, collection method, legal bases, retention period, and rights contact must match the business's real processing.
- Use the Supabase project's supported backup/restore plan and test a restore before production use. Retain a separate protected database export according to the operator's retention policy.
- Monitor Vercel function errors and Supabase database/security advisors after migrations.
- Configure Vercel domain, production environment variables, and cron secret before promoting a deployment to production.

## Müşteri kitlesi ve adisyonlar

Yönetim panelindeki **Müşteri kitlesi** bölümü tüm müşteri kayıtlarını, müşteri başına
ömür boyu tahsilatı ve kalan borcu gösterir. Liste sayfalanır; toplam kayıt sınırı
25 değildir. Randevular ad, soyad, telefon ve hizmet geçmişini otomatik oluşturur.
Türkiye telefon numaralarının `05…`, `5…` ve `+905…` biçimleri aynı kayıtta birleşir.

- **Müşteri ekle:** iletişim bilgileri ve işletme içi not; mevcut bilgiler düzenlenebilir.
- **Hizmet / adisyon ekle:** katalogdan veya elle hizmet, adet, fiyat, personel;
  varsa ilk ödeme adisyonla aynı veritabanı işleminde kaydedilir.
- **Ödeme al:** kısmi veya tam tahsilat; aynı anda gelir kaydı ve müşteri toplamı
  güncellenir. Fazla ödeme reddedilir, ağ tekrarları ikinci gelir oluşturmaz.
- **Tahsilatı iptal et / geri al:** gelir ve borç birlikte güncellenir. Ödeme bulunan
  bir adisyon iptal edilmeden önce tahsilatları iptal edilmelidir.
- **Randevu geçmişi → Tamamla ve adisyon aç:** randevu tamamlanır, hizmetler
  adisyona aktarılır. Önceki randevu tahsilatı varsa yeniden gelir yazılmadan taşınır.
- **Gelir ve gider → Randevusuz gelir:** isteğe bağlı müşteri seçilebilir. Bir adisyonun
  borcunu kapatmak için her zaman müşteri kartındaki **Ödeme al** kullanılmalıdır.

Müşteri toplamları finans ekranının tarih aralığıyla sınırlı değildir. İptal edilmiş
kayıtlar geçmişte korunur, toplamların dışında kalır. Kısmi tahsilatlar personel
cirosuna eklenir; aynı adisyon hizmet sayısını her taksitte yeniden artırmaz.

`tests/customer-accounts.sql`, yetkili bir SQL bağlantısında çalıştırılan ve bütün
örnek kayıtlarını `ROLLBACK` ile geri alan entegrasyon testidir. Kısmi/tam ödeme,
fazla ödeme, tekrar istek, iptal/geri alma, randevudan aktarım, telefon eşleştirme
ve yönetici olmayan hesapların erişim kısıtlamalarını kontrol eder.
