#!/usr/bin/env python3
"""Score JPEG frames and pick the best N from a burst."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np


def laplacian_variance(gray: np.ndarray) -> float:
    # Simple Laplacian approximation without OpenCV dependency
    kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
    from numpy.lib.stride_tricks import sliding_window_view

    if gray.shape[0] < 3 or gray.shape[1] < 3:
        return 0.0
    windows = sliding_window_view(gray.astype(np.float64), (3, 3))
    conv = np.einsum("ijkl,kl->ij", windows, kernel)
    return float(conv.var())


def load_gray(path: Path, max_side: int = 640) -> np.ndarray | None:
    try:
        from PIL import Image
    except ImportError:
        # Fallback: skip scoring if Pillow missing
        return None

    img = Image.open(path).convert("L")
    w, h = img.size
    scale = max_side / max(w, h)
    if scale < 1:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))))
    return np.asarray(img)


def exposure_score(gray: np.ndarray) -> float:
    mean = float(gray.mean())
    # Prefer midtones; penalize very dark / blown
    return 1.0 - min(1.0, abs(mean - 128.0) / 128.0)


def ahash(gray: np.ndarray, size: int = 8) -> int:
    from PIL import Image

    img = Image.fromarray(gray).resize((size, size))
    arr = np.asarray(img, dtype=np.float64)
    avg = arr.mean()
    bits = (arr > avg).flatten()
    value = 0
    for i, b in enumerate(bits):
        if b:
            value |= 1 << i
    return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def score_path(path: Path) -> dict:
    gray = load_gray(path)
    if gray is None:
        # No Pillow: use file size as weak proxy
        size = path.stat().st_size
        return {"path": str(path), "score": float(size), "sharpness": 0.0, "exposure": 0.5, "hash": 0}

    sharp = laplacian_variance(gray)
    exp = exposure_score(gray)
    # Weighted: sharpness dominates for burst pick
    score = sharp * (0.55 + 0.45 * exp)
    return {
        "path": str(path),
        "score": score,
        "sharpness": sharp,
        "exposure": exp,
        "hash": ahash(gray),
    }


def select_best(paths: list[str], keep: int = 1) -> list[str]:
    scored = [score_path(Path(p)) for p in paths if Path(p).is_file()]
    scored.sort(key=lambda x: x["score"], reverse=True)

    winners: list[dict] = []
    for item in scored:
        if any(hamming(item["hash"], w["hash"]) < 8 for w in winners if item["hash"] and w["hash"]):
            continue
        winners.append(item)
        if len(winners) >= keep:
            break

    if not winners and scored:
        winners = scored[:keep]
    return [w["path"] for w in winners]


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    paths = payload.get("paths") or []
    keep = int(payload.get("keep") or 1)
    winners = select_best(paths, keep=max(1, min(keep, 2)))
    print(json.dumps({"winners": winners}))


if __name__ == "__main__":
    main()
