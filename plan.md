# Role & Project Overview
You are an expert full-stack engineer building a real-time, zero-cost-infrastructure wedding photo streaming platform. The platform catches high-res JPEGs from professional mirrorless cameras over local FTP, enhances them, and streams them live alongside guest phone uploads onto a live venue projector wall and mobile web gallery.

---

## Technical Stack & Architecture

1. **Frontend / Web App:** Next.js (App Router), Tailwind CSS, Framer Motion, `@supabase/supabase-js`.
2. **Edge Ingestion Engine (Mac Server):** Node.js script using `chokidar`, `@aws-sdk/client-s3`, `p-queue`, and `child_process`.
3. **Local AI Enhancement:** Local execution of `codeformer-ncnn-vulkan` on Apple Silicon GPU (Vulkan/Metal).
4. **Cloud Storage:** Cloudflare R2 (S3-compatible, zero egress fees).
5. **Database & Realtime Sync:** Supabase PostgreSQL with Realtime Subscriptions.
6. **Deployment:** Vercel or Cloudflare Pages for Next.js web client.

---

## Core System Workflows & Use Cases

### Use Case 1: Pro Camera Direct FTP Ingestion & Edge AI Beautification
- **Context:** Canon R8, Sony A7 IV, and Nikon Z8 cameras shoot RAW + JPEG and push small JPEGs via Wi-Fi FTP directly to a local folder on the Mac running QuickFTP Server.
- **Workflow:**
  1. Node.js `chokidar` script monitors `/Users/mac/WeddingPhotos/FTP_Drop`.
  2. Incoming JPEGs are queued using `p-queue` (concurrency: 1) to handle high-speed camera bursts without crashing system memory.
  3. Node spawns a local process executing `./codeformer-ncnn-vulkan` with parameters `-w 0.7` to enhance lighting, denoise venue shot grain, and sharpen face textures.
  4. The enhanced JPEG is uploaded to the Cloudflare R2 bucket (`wedding-media`).
  5. The resulting public R2 URL is inserted into the Supabase `photos` table with metadata (`source: "pro_camera"`, `approved: true`).

### Use Case 2: Guest Mobile Web Uploads via QR Code
- **Context:** Wedding guests scan a QR code at their tables to access `wedding.com` on their mobile browsers without downloading any app.
- **Workflow:**
  1. The guest opens the Next.js landing page and taps a prominent "Share Your Photo / Video" button.
  2. The native HTML5 file input (`input capture="environment"`) opens the camera or gallery.
  3. **Client-Side Pre-Processing:** Before uploading, an HTML5 `<canvas>` utility auto-levels the image (contrast + saturation boost) and compresses the JPEG down to ~800 KB (80% quality).
  4. The app requests a temporary presigned upload URL from Cloudflare R2 via a Next.js Server Action / API route.
  5. The file is uploaded directly from the browser to R2.
  6. On upload success, a row is created in Supabase (`source: "guest"`, `uploader_name: "Guest"`).

### Use Case 3: Real-Time Projector Wall & Moderation Dashboard
- **Context:** A laptop connected to the venue's main screen displays `wedding.com/live`, while a separate admin route `wedding.com/admin` allows instant moderation.
- **Workflow:**
  1. `wedding.com/live` connects to Supabase Realtime via WebSockets subscribing to `INSERT` events on the `photos` table.
  2. When a new photo URL arrives, **Framer Motion** (`AnimatePresence`) animates the current photo out and smoothly zooms/fades the new photo in with a dark, minimalist layout.
  3. **Admin Moderation:** On `wedding.com/admin`, an admin can view a live grid of all uploaded photos. Toggling a photo to `approved: false` instantly fires an update via Supabase Realtime, removing the photo from the projector screen immediately.

---

## Step-by-Step Implementation Instructions for Cursor

Please build this project in sequential phases. Do not move to the next phase until the current phase is fully written and tested.

### Phase 1: Local Mac Watcher & AI Ingestion Script
1. Create a `local-ingest/` directory with a standalone Node.js project (`package.json`).
2. Implement `watcher.js` using `chokidar` to monitor a specified local directory.
3. Integrate `p-queue` to serialize file processing.
4. Add execution logic for `codeformer-ncnn-vulkan` CLI binary.
5. Configure AWS SDK v3 for Cloudflare R2 uploads and Supabase JS Client for database inserts.

### Phase 2: Supabase Schema & Next.js Foundation
1. Define the SQL schema for the `photos` table:
   - `id` (uuid, primary key)
   - `url` (text, required)
   - `source` (text, enum: 'pro_camera', 'guest')
   - `uploader_name` (text, default: 'Anonymous')
   - `approved` (boolean, default: true)
   - `created_at` (timestamptz, default: now())
2. Initialize a Next.js App Router project with Tailwind CSS and Framer Motion.
3. Configure environment variables for Cloudflare R2 credentials and Supabase keys.

### Phase 3: Mobile Guest Upload Flow
1. Build a responsive mobile UI featuring an intuitive file picker.
2. Implement a client-side canvas utility to auto-enhance and compress images before upload.
3. Create a Next.js Server Action / API route to generate S3 presigned upload URLs for Cloudflare R2.
4. Wire the client upload directly to R2, followed by the Supabase database write.

### Phase 4: Live Projector Wall & Moderation
1. Build the `/live` page with full-screen dark layout and Framer Motion transition effects.
2. Implement the Supabase Realtime listener to stream incoming photos automatically.
3. Build the `/admin` moderation view with toggle capabilities to hide or remove photos in real-time.