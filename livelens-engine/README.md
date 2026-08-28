# LiveLens Engine (Mac or Windows)

Local FTP watcher with burst selection, optional CodeFormer enhance, Depth Anything V2 + Florence-2, R2 upload, and Supabase insert. Run on the same Mac or Windows PC that hosts the camera FTP drop folder.

## Pipeline

1. `chokidar` watches FTP drop folders  
2. Burst window → `select_best.py` (sharpness)  
3. Optional CodeFormer (`enhance.py`)  
4. `processor.py` — Depth Anything V2 + caption/tag cascade (Florence-2-ft → Moondream2 → SmolVLM2; fail-open)  
5. Upload original + thumb/preview variants to R2; insert `media` row  
6. Optional Realtime **tag-queue** tags guest/staff photos (`tag IS NULL`) without blocking uploads

## Setup

```bash
cd livelens-engine
npm install
python3 -m venv .venv
.venv/bin/pip install pillow numpy
# AI models (Apple Silicon MPS). First run downloads weights (~1GB+).
.venv/bin/pip install torch torchvision
.venv/bin/pip install transformers accelerate timm einops
# Fill R2 + Supabase secrets in .env
```

Place `codeformer-ncnn-vulkan` in `binaries/` (optional; without it, winners upload as-is).

Config flags in `config/engine.json`:

| Key | Default | Meaning |
|-----|---------|---------|
| `aiEnabled` | true | Run CodeFormer enhance |
| `depthEnabled` | true | Run Depth Anything V2 |
| `captionEnabled` | true | Run local caption/tag cascade (optional; never blocks upload) |
| `tagModels` | florence2-ft, moondream2, smolvlm2 | Ordered fail-open cascade |
| `tagQueueEnabled` | true | Realtime queue for untagged guest/staff photos |
| `tagTimeoutMs` | 45000 | Per-image AI timeout |

Tags: `dancing`, `portrait`, `group`, `food`, or `other`.

## Run control UI

```bash
npm start
# open http://127.0.0.1:3847
```

Add your FTP drop folder(s), apply a Canon/Sony/Nikon preset, then Start watcher (also starts the tag queue).

## Backfill

```bash
npm run backfill-tags                 # tag untagged photos
npm run backfill-tags -- --variants   # tags + missing thumb/preview
npm run backfill-tags -- --variants-only
```

## Camera tips

- **Canon R8:** JPEG-only FTP; folder may be flat or DCIM-like — use recursive watch.
- **Sony A7 IV:** Prefer Directory Hierarchy = Standard + `sony/` folder.
- **Nikon Z8:** Pre-create destination folder; JPEG-only auto upload.
