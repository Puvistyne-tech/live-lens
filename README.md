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

`NEXT_PUBLIC_SITE_URL` drives QR codes on `/` and `/live`.

Default passwords (change in `.env.local`): `livelens-admin` / `livelens-staff`

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
