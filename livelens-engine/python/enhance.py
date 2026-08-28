#!/usr/bin/env python3
"""Enhance a JPEG with CodeFormer if available; otherwise copy input to output."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def enhance(input_path: Path, output_path: Path, weight: float = 0.7) -> dict:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    binary = os.environ.get("CODEFORMER_BIN", "./binaries/codeformer-ncnn-vulkan")
    bin_path = Path(binary)

    if bin_path.exists() and os.access(bin_path, os.X_OK):
        # Typical CLI: codeformer-ncnn-vulkan -i in.jpg -o out.jpg -w 0.7
        cmd = [
            str(bin_path),
            "-i",
            str(input_path),
            "-o",
            str(output_path),
            "-w",
            str(weight),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if proc.returncode == 0 and output_path.exists():
                return {"ok": True, "path": str(output_path), "mode": "codeformer"}
            return {
                "ok": False,
                "error": proc.stderr or proc.stdout or f"exit {proc.returncode}",
                "mode": "codeformer",
            }
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc), "mode": "codeformer"}

    # Fallback: pass-through copy so pipeline still works without binary
    if not input_path.is_file():
        return {"ok": False, "error": f"missing input: {input_path}", "mode": "passthrough"}
    shutil.copy2(input_path, output_path)
    return {"ok": True, "path": str(output_path), "mode": "passthrough"}


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        input_path = Path(payload["input"])
        output_path = Path(payload["output"])
        weight = float(payload.get("weight") or 0.7)
        result = enhance(input_path, output_path, weight=weight)
    except Exception as exc:  # noqa: BLE001
        result = {"ok": False, "error": str(exc), "mode": "error"}
    print(json.dumps(result))
    if not result.get("ok"):
        sys.exit(1)


if __name__ == "__main__":
    main()
