#!/usr/bin/env python3
"""List recently modified JPEGs under watch roots (helper for manual scans)."""
from __future__ import annotations

import json
import sys
from pathlib import Path


def find_new(roots: list[str], extensions: list[str], recursive: bool = True) -> list[str]:
    exts = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in extensions}
    found: list[str] = []
    for root in roots:
        base = Path(root)
        if not base.exists():
            continue
        iterator = base.rglob("*") if recursive else base.glob("*")
        for path in iterator:
            if path.is_file() and path.suffix.lower() in exts:
                found.append(str(path))
    found.sort(key=lambda p: Path(p).stat().st_mtime, reverse=True)
    return found


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    roots = payload.get("roots") or []
    extensions = payload.get("extensions") or [".jpg", ".jpeg"]
    recursive = bool(payload.get("recursive", True))
    print(json.dumps({"files": find_new(roots, extensions, recursive)}))


if __name__ == "__main__":
    main()
