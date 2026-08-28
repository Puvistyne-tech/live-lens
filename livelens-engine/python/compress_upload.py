#!/usr/bin/env python3
"""Resize + re-JPEG upload master. stdin JSON: { input, output, max_edge, quality }"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def compress(path: Path, out: Path, max_edge: int, quality: int) -> None:
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
        out = Path(payload["output"])
        max_edge = int(payload.get("max_edge") or 2048)
        quality = int(payload.get("quality") or 78)
        quality = max(1, min(100, quality))
        max_edge = max(320, min(8000, max_edge))
        compress(src, out, max_edge, quality)
        size = out.stat().st_size if out.exists() else 0
        print(json.dumps({"ok": True, "path": str(out), "bytes": size}))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
