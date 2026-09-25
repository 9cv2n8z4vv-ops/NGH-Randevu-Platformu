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

1. Create the owner account in Supabase Authentication.
2. In the SQL editor, grant only that account access:

   ```sql
   insert into public.admin_users (user_id, full_name, role)
   select id, 'İşletme Sahibi', 'owner'
   from auth.users
   where email = 'owner@example.com'
   on conflict (user_id) do update
     set full_name = excluded.full_name, role = excluded.role;
   ```

3. Sign in at `/yonetim/giris`.

RLS restricts customer, appointment, financial, and audit data to users in `admin_users`. Public booking is performed through narrowly granted functions; it does not expose customer tables.

## Vercel

The Vercel project `ngh-salon-platform` is live at <https://ngh-salon-platform.vercel.app>. The current production build was uploaded directly from this source. Connect the GitHub repository to this existing Vercel project when the repository is visible to the connected GitHub integration, so future pushes can trigger deployments.

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
