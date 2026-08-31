# LiveLens

Wedding photo/video live wall with edge AI (depth + caption) and guest face-aware uploads.

## Packages

- [`live-lens/`](live-lens/) — Next.js app (`/`, `/gallery`, `/live`, `/admin`, `/staff`) → Vercel
- [`livelens-engine/`](livelens-engine/) — Mac FTP watcher + CodeFormer + Depth Anything V2 + Florence-2 + local control UI (`http://127.0.0.1:3847`)
- [`supabase/schema.sql`](supabase/schema.sql) — database schema

## Quick start (web)

```bash
cd live-lens
# Set R2 + Supabase + NEXT_PUBLIC_SITE_URL in .env.local
yarn dev
```

`NEXT_PUBLIC_SITE_URL` drives QR codes on `/` and `/live`, and Admin auth redirects (`/auth/callback`).

Staff unlock password (change in `.env.local`): `STAFF_PASSWORD` (default historically `livelens-staff`).

### Admin auth (Supabase)

Admin is no longer a shared password. Use Supabase Auth:

1. **Disable public signup** in Supabase Auth settings (invite-only).
2. **Enable Google** provider if Admins will use “Continue with Google”.
3. **Redirect URLs** allowlist must include `{NEXT_PUBLIC_SITE_URL}/auth/callback`.
4. **Bootstrap the first Admin** (Dashboard → Authentication → Users, or SQL/Admin API): create the user, then set `app_metadata` to `{ "role": "admin" }`. Example Admin API:

```ts
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { role: "admin" },
});
```

5. Further Admins: signed-in Admin → Settings → Admins → invite by email (sets `app_metadata.role = admin`). Google-only Admins: invite (or bootstrap) with the same Google email, then they can sign in with Google.

RLS policy `media_select_admin` lets authenticated Admins SELECT pending media for Realtime on `/admin`.

## Quick start (engine)

```bash
cd livelens-engine
npm install
python3 -m venv .venv
.venv/bin/pip install -r python/requirements.txt
npm start
# open http://127.0.0.1:3847 — add FTP watch folder, Start
```

Secrets live only in gitignored `.env.local` / `livelens-engine/.env`.
