#!/usr/bin/env python3
"""Generate thumb + preview JPEGs. stdin JSON: { input, thumb_out, preview_out }"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def resize(path: Path, out: Path, max_edge: int, quality: int) -> None:
    from PIL import Image, ImageOps

    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, format="JPEG", quality=quality, optimize=True)


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        src = Path(payload["input"])
        thumb = Path(payload["thumb_out"])
        preview = Path(payload["preview_out"])
        resize(src, thumb, 400, 70)
        resize(src, preview, 1280, 80)
        print(json.dumps({"ok": True, "thumb": str(thumb), "preview": str(preview)}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
