#!/usr/bin/env python3
"""
Depth Anything V2 + multi-model caption/tag cascade for LiveLens engine.

Caption cascade (first success wins, fail-open):
  florence2-ft → moondream2 → smolvlm2

Reads JSON from stdin:
  { input, depth_output?, do_depth?, do_caption?, tag_models? }
Writes JSON to stdout.
"""
from __future__ import annotations

import json
import re
import sys
import traceback
from pathlib import Path

TAGS = ("dancing", "portrait", "group", "food")
DEFAULT_TAG_MODELS = ("florence2-ft", "moondream2", "smolvlm2")

_depth_pipe = None
_florence = None
_moondream = None
_smolvlm = None
_device = None
_disabled_backends: set[str] = set()


def pick_device():
    global _device
    if _device is not None:
        return _device
    try:
        import torch

        if torch.backends.mps.is_available():
            _device = "mps"
        elif torch.cuda.is_available():
            _device = "cuda"
        else:
            _device = "cpu"
    except Exception:  # noqa: BLE001
        _device = "cpu"
    return _device


def load_depth():
    global _depth_pipe
    if _depth_pipe is not None:
        return _depth_pipe
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    device = pick_device()
    model_id = "depth-anything/Depth-Anything-V2-Small-hf"
    processor = AutoImageProcessor.from_pretrained(model_id)
    model = AutoModelForDepthEstimation.from_pretrained(model_id)
    model.to(device)
    model.eval()
    _depth_pipe = (processor, model, device)
    return _depth_pipe


def _patch_flash_attn_imports():
    """Florence-2 on Mac: flash_attn is unavailable; strip from dynamic imports."""
    try:
        from unittest.mock import patch
        from transformers.dynamic_module_utils import get_imports

        def fixed_get_imports(filename):
            imports = get_imports(filename)
            if "flash_attn" in imports:
                imports = [i for i in imports if i != "flash_attn"]
            return imports

        return patch("transformers.dynamic_module_utils.get_imports", fixed_get_imports)
    except Exception:  # noqa: BLE001
        return None


def load_florence():
    global _florence
    if _florence is not None:
        return _florence
    import torch
    from transformers import AutoModelForCausalLM, AutoProcessor

    device = pick_device()
    candidates = ("microsoft/Florence-2-base-ft", "microsoft/Florence-2-base")
    last_err = None
    for model_id in candidates:
        try:
            ctx = _patch_flash_attn_imports()
            if ctx is not None:
                ctx.start()
            try:
                processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
                model = AutoModelForCausalLM.from_pretrained(
                    model_id,
                    trust_remote_code=True,
                    torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                    attn_implementation="eager",
                )
            finally:
                if ctx is not None:
                    ctx.stop()
            model.to(device)
            model.eval()
            _florence = (processor, model, device, model_id)
            return _florence
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            continue
    raise RuntimeError(f"Florence load failed: {last_err}")


def load_moondream():
    global _moondream
    if _moondream is not None:
        return _moondream
    import torch
    from transformers import AutoModelForCausalLM

    device = pick_device()
    model = AutoModelForCausalLM.from_pretrained(
        "vikhyatk/moondream2",
        revision="2025-06-21",
        trust_remote_code=True,
        torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    )
    model.to(device)
    model.eval()
    _moondream = (model, device)
    return _moondream


def load_smolvlm():
    global _smolvlm
    if _smolvlm is not None:
        return _smolvlm
    import torch
    from transformers import AutoModelForVision2Seq, AutoProcessor

    device = pick_device()
    model_id = "HuggingFaceTB/SmolVLM2-500M-Instruct"
    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModelForVision2Seq.from_pretrained(
        model_id,
        torch_dtype=torch.float16 if device != "cpu" else torch.float32,
    )
    model.to(device)
    model.eval()
    _smolvlm = (processor, model, device, model_id)
    return _smolvlm


def run_depth(image_path: Path, depth_output: Path) -> str:
    from PIL import Image
    import numpy as np
    import torch

    processor, model, device = load_depth()
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        predicted = outputs.predicted_depth

    prediction = torch.nn.functional.interpolate(
        predicted.unsqueeze(1),
        size=image.size[::-1],
        mode="bicubic",
        align_corners=False,
    ).squeeze()

    depth = prediction.detach().cpu().numpy()
    depth = (depth - depth.min()) / (depth.max() - depth.min() + 1e-8)
    depth_u8 = (depth * 255.0).astype(np.uint8)
    depth_img = Image.fromarray(depth_u8, mode="L")
    depth_output.parent.mkdir(parents=True, exist_ok=True)
    depth_img.save(depth_output, format="JPEG", quality=92)
    return str(depth_output)


def fallback_depth(image_path: Path, depth_output: Path) -> str:
    from PIL import Image

    image = Image.open(image_path).convert("L")
    depth_output.parent.mkdir(parents=True, exist_ok=True)
    image.save(depth_output, format="JPEG", quality=90)
    return str(depth_output)


def florence_generate(image, task_prompt: str, text_input: str | None = None):
    import torch

    processor, model, device, _mid = load_florence()
    prompt = task_prompt if text_input is None else task_prompt + text_input
    inputs = processor(text=prompt, images=image, return_tensors="pt")
    inputs = {k: (v.to(device) if hasattr(v, "to") else v) for k, v in inputs.items()}
    with torch.no_grad():
        generated = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=160,
            num_beams=3,
            do_sample=False,
        )
    generated_text = processor.batch_decode(generated, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        generated_text,
        task=task_prompt,
        image_size=(image.width, image.height),
    )
    return parsed.get(task_prompt, generated_text)


def score_tags(caption: str, image=None, use_grounding: bool = False) -> str:
    caption_l = (caption or "").lower()
    scores = {tag: 0.0 for tag in TAGS}

    keyword_boosts = {
        "dancing": ("danc", "party", "celebrat", "twirl", "floor", "dj", "nightclub", "groove"),
        "portrait": ("portrait", "close-up", "closeup", "face", "bride", "groom", "couple", "selfie"),
        "group": ("group", "crowd", "guests", "family", "together", "people", "friends", "wedding party"),
        "food": ("food", "cake", "table", "dinner", "drink", "toast", "plate", "dessert", "buffet"),
    }
    negative_cues = {
        # if cake mentioned without people words, prefer food over group
        "food": (),
    }

    for tag, keys in keyword_boosts.items():
        for key in keys:
            if key in caption_l:
                scores[tag] += 1.0

    # Negative / disambiguation
    people_words = ("people", "guests", "crowd", "group", "friends", "family", "couple", "bride", "groom")
    if any(w in caption_l for w in ("cake", "dessert", "buffet", "plate of")) and not any(
        w in caption_l for w in people_words
    ):
        scores["food"] += 1.5
        scores["group"] -= 0.5

    if any(w in caption_l for w in ("close-up", "closeup", "portrait", "face")) and not any(
        w in caption_l for w in ("crowd", "group", "guests")
    ):
        scores["portrait"] += 1.0

    if use_grounding and image is not None:
        try:
            for tag in TAGS:
                result = florence_generate(image, "<CAPTION_TO_PHRASE_GROUNDING>", tag)
                if isinstance(result, dict) and result.get("bboxes"):
                    scores[tag] += 2.0 + min(len(result["bboxes"]), 3) * 0.25
                elif isinstance(result, str) and any(c.isdigit() for c in result):
                    scores[tag] += 1.5
        except Exception:  # noqa: BLE001
            pass

    best = max(scores.items(), key=lambda kv: kv[1])
    # Confidence threshold
    if best[1] < 1.0:
        return "other"
    return best[0]


def elegant_caption(raw: str) -> str:
    text = re.sub(r"\s+", " ", (raw or "").strip())
    if not text:
        return "A moment from the celebration."
    if len(text) > 120:
        text = text[:117].rsplit(" ", 1)[0] + "…"
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    if text[-1] not in ".!?…":
        text += "."
    return text


def caption_florence(image) -> str:
    for task in ("<MORE_DETAILED_CAPTION>", "<DETAILED_CAPTION>", "<CAPTION>"):
        try:
            raw = florence_generate(image, task)
            if isinstance(raw, dict):
                raw = raw.get(task) or next(iter(raw.values()), "")
            text = str(raw).strip()
            if text:
                return elegant_caption(text)
        except Exception:  # noqa: BLE001
            continue
    raise RuntimeError("Florence caption empty")


def caption_moondream(image) -> str:
    model, _device = load_moondream()
    out = model.caption(image, length="normal")
    text = out.get("caption") if isinstance(out, dict) else str(out)
    if not text or not str(text).strip():
        raise RuntimeError("Moondream empty caption")
    return elegant_caption(str(text))


def caption_smolvlm(image) -> str:
    import torch

    processor, model, device, _mid = load_smolvlm()
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image"},
                {"type": "text", "text": "Describe this wedding event photo in one sentence."},
            ],
        }
    ]
    prompt = processor.apply_chat_template(messages, add_generation_prompt=True)
    inputs = processor(text=prompt, images=[image], return_tensors="pt")
    inputs = {k: (v.to(device) if hasattr(v, "to") else v) for k, v in inputs.items()}
    with torch.no_grad():
        generated = model.generate(**inputs, max_new_tokens=80)
    text = processor.batch_decode(generated, skip_special_tokens=True)[0]
    # Strip prompt echo if present
    if "Assistant:" in text:
        text = text.split("Assistant:")[-1]
    text = text.strip()
    if not text:
        raise RuntimeError("SmolVLM empty caption")
    return elegant_caption(text)


CAPTION_BACKENDS = {
    "florence2-ft": caption_florence,
    "florence2": caption_florence,
    "moondream2": caption_moondream,
    "smolvlm2": caption_smolvlm,
}


def run_caption_cascade(image_path: Path, tag_models: list[str] | None = None) -> tuple[str | None, str | None, str | None, list[str]]:
    """Returns caption, tag, backend_used, errors."""
    from PIL import Image

    image = Image.open(image_path).convert("RGB")
    models = tag_models or list(DEFAULT_TAG_MODELS)
    errors: list[str] = []

    for name in models:
        key = name.lower().strip()
        if key in _disabled_backends:
            errors.append(f"{key}:disabled")
            continue
        fn = CAPTION_BACKENDS.get(key)
        if not fn:
            errors.append(f"{key}:unknown")
            continue
        try:
            caption = fn(image)
            use_grounding = key.startswith("florence")
            tag = score_tags(caption, image, use_grounding=use_grounding)
            return caption, tag, key, errors
        except Exception as exc:  # noqa: BLE001
            _disabled_backends.add(key)
            errors.append(f"{key}:{exc}")
            continue

    return None, None, None, errors


def process(payload: dict) -> dict:
    image_path = Path(payload["input"])
    depth_output = Path(payload.get("depth_output") or (image_path.parent / f"{image_path.stem}-depth.jpg"))
    do_depth = payload.get("do_depth", True)
    do_caption = payload.get("do_caption", True)
    tag_models = payload.get("tag_models")

    result: dict = {"ok": True, "device": pick_device()}

    if do_depth:
        try:
            result["depth_path"] = run_depth(image_path, depth_output)
            result["depth_mode"] = "depth_anything_v2"
        except Exception as exc:  # noqa: BLE001
            try:
                result["depth_path"] = fallback_depth(image_path, depth_output)
                result["depth_mode"] = "fallback_luminance"
                result["depth_warning"] = str(exc)
            except Exception as exc2:  # noqa: BLE001
                result["depth_path"] = None
                result["depth_error"] = str(exc2)

    if do_caption:
        try:
            caption, tag, backend, errors = run_caption_cascade(image_path, tag_models)
            result["caption"] = caption
            result["tag"] = tag
            result["caption_mode"] = backend
            if errors:
                result["caption_attempts"] = errors
            if not caption:
                result["caption_error"] = "; ".join(errors) or "all backends failed"
        except Exception as exc:  # noqa: BLE001
            result["caption"] = None
            result["tag"] = None
            result["caption_error"] = str(exc)
            result["caption_trace"] = traceback.format_exc()

    return result


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        result = process(payload)
        print(json.dumps(result))
        if not result.get("ok"):
            sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
