# Live wall image transitions — research note

**Date:** 2026-08-31  
**Repo context:** Next.js 16 App Router, React 19, Framer Motion / Motion `^13`, Three.js + `@react-three/fiber` + `@react-three/drei`, existing `DepthParallax` for depth-map idle motion.

**Problem:** The LiveLens live wall cycles guest wedding/event photos every ~7s, but the swap is a soft opacity+scale fade. Guests and hosts experience it as “images just fade into each other.” We need tasteful, modern alternatives — shader/WebGL, View Transitions, CSS, Motion patterns, Ken Burns, multi-image layouts, and depth-aware transitions — that fit a TV/projector live wall, reuse the existing stack where possible, and avoid clubby gimmicks or abandoned deps.

---

## Current behavior

[`components/LiveWall.tsx`](../components/LiveWall.tsx) filters approved media, advances `index` on a 7s interval, and wraps the current item in Framer Motion `AnimatePresence mode="wait"`:

- **Enter:** `opacity: 0 → 1`, `scale: 1.04 → 1`, ~0.7s ease
- **Exit:** `opacity → 0`, `scale → 0.98`
- **Content:** `<img>`, `<video>`, or `DepthParallax` (R3F plane + custom depth parallax shader) when `depth_map_url` is present

So the “interesting” motion today is mostly **within** a depth slide (idle parallax), not **between** slides. Flat images get a near-crossfade. Videos remount on swap.

---

## Options catalog

### 1. Shader / WebGL transitions (two textures + progress)

#### 1a. Custom GLSL on the existing R3F canvas (best stack fit)

**What it does differently:** One fullscreen plane samples `textureFrom` and `textureTo` and mixes them with UV warps, displacement maps, wipes, pixelation, etc., driven by a `progress` uniform `0→1`. Not a DOM crossfade — the GPU paints the blend.

**How (pattern):** Keep previous + next `THREE.Texture` on a `ShaderMaterial`; animate `uProgress` over ~0.8–1.2s on index change; then promote “to” → “from” and preload the next. Same architecture already used in `DepthParallax` (custom vertex/fragment + uniforms). R3F discussions describe the dual-index + `uProgress` pattern explicitly: [pmndrs/react-three-fiber#2168](https://github.com/pmndrs/react-three-fiber/discussions/2168). Drei’s `shaderMaterial` / `useTexture` helpers fit this workflow ([Codrops R3F reveal tutorial](https://tympanus.net/codrops/2024/12/02/how-to-code-a-shader-based-reveal-effect-with-react-three-fiber-glsl/) — secondary tutorial, but APIs are first-party drei/R3F).

**Integration:** No new runtime deps if shaders are inlined (as today). Optional: pull GLSL snippets from gl-transitions (below) and wrap them for Three.

**Complexity:** Medium — one shared canvas for the wall, texture preload/dispose, aspect/cover math, video path needs separate handling.

**Performance (fullscreen photos):** Excellent if textures are sized reasonably (e.g. max edge 1920–2560), `dpr` capped (LiveWall already uses `dpr={[1, 1.75]}` in DepthParallax), and only two textures live on GPU during the transition. Avoid per-frame texture reloads.

**License:** Own code + Three.js MIT.

**Primary refs:** [three.js RenderTransitionPass](https://threejs.org/docs/pages/RenderTransitionPass.html), [three.js WebGL transition example](https://threejs.org/examples/#webgl_postprocessing_transition) ([source](https://github.com/mrdoob/three.js/blob/master/examples/webgl_postprocessing_transition.html)).

#### 1b. `gl-transitions` shader collection

**What it does differently:** Large open catalog of GLSL transitions (`fade`, `displacement`, `morph`, liquid-ish, wipe, pixelate, etc.) implementing a standard `transition(vec2 uv)` with `progress`, `getFromColor` / `getToColor`. Browse: [gl-transitions.com](https://gl-transitions.com/). Spec + package: [github.com/gl-transitions/gl-transitions](https://github.com/gl-transitions/gl-transitions), npm `gl-transitions@1.71.0` (MIT, last publish mid-2026).

**Integration:** Prefer **copy/adapt selected shaders into an R3F material** rather than mounting the full React/gl-react stack. Official React wrapper `react-gl-transition` targets **gl-react**, not R3F ([gl-transition-libs](https://github.com/gre/gl-transition-libs)) — adding gl-react would **duplicate** WebGL stacks. Low-level `gl-transition` (raw WebGL) is usable but still a second GL path.

**Complexity:** Low–medium if cherry-picking 2–4 tasteful shaders (soft wipe, subtle displacement, gentle morph). High if wiring gl-react + Next SSR.

**Wedding aesthetic filter:** Prefer soft directional wipes, gentle blur/displacement, “fade through soft light” — skip Doom-screen, flashy glitch, aggressive pixelation for the default event theme (optional “party” mode later).

#### 1c. Three.js `RenderTransitionPass` (postprocessing)

**What it does:** Official addon mixes **two scenes** with optional mask texture + threshold (`setTransition(0…1)`, `setTexture`, `useTexture`). Docs: [RenderTransitionPass](https://threejs.org/docs/pages/RenderTransitionPass.html). Demo: [webgl_postprocessing_transition](https://threejs.org/examples/#webgl_postprocessing_transition).

**Fit:** Good if the live wall is already a persistent WebGL scene (two photo planes as scene A/B). Heavier than a single dual-texture plane if you only need image→image. EffectComposer adds pass overhead — fine on desktop/TV Chromium, avoid stacking many other passes at 4K.

**License:** Three.js MIT.

#### 1d. Curtains.js

**What it does:** Maps DOM images to WebGL planes and animates with shaders ([curtainsjs.com](https://www.curtainsjs.com/), MIT).

**Fit for LiveLens:** **Weak** — duplicates Three/R3F already in the tree; `react-curtains` is another integration surface. Use only if abandoning R3F (not recommended).

---

### 2. View Transitions API (CSS/JS)

**What it does differently:** Browser snapshots old UI and animates to new UI via `document.startViewTransition(() => updateDOM())`. Default is a crossfade; customize with `::view-transition-old(*)` / `::view-transition-new(*)` (clip-path wipes, slides, etc.). MDN: [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API), [Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using). Chrome guide: [Smooth transitions with the View Transition API](https://developer.chrome.com/docs/web-platform/view-transitions). Same-document SPA support from Chrome 111+; MDN demo includes an **image gallery** SPA.

**Integration with LiveWall:** On interval tick, wrap `setIndex` in `startViewTransition` (with feature detect fallback). Optionally set `view-transition-name` on the media frame vs caption for separate animations. Motion’s `animateView()` wraps the same API with springs / clipPath helpers ([motion.dev/docs/animate-view](https://motion.dev/docs/animate-view)); React `AnimateView` exists but docs note Motion+ / React ViewTransition constraints — for a timer-driven wall, imperative `startViewTransition` or `animateView` is enough.

**Caveats (from Motion’s own comparison + MDN):** Not interruptible like layout animations; blocks interaction during transition (less relevant on a passive TV); snapshot-based (can be heavier at fullscreen); skips when document visibility is `hidden` (screensaver / tab background). Smart TVs / Chromecast / projector browsers vary — treat as progressive enhancement.

**Complexity:** Low for wipe/slide over the existing DOM `<img>`; does **not** compose cleanly with remounting a new R3F `Canvas` each slide (snapshot of WebGL canvas is often a frozen frame). Best for flat images; depth slides need a stable canvas or WebGL-owned transitions instead.

**License:** Platform API (no package).

---

### 3. CSS-only modern techniques

#### 3a. `clip-path` reveals / wipes

**What:** Animate `clip-path` between compatible shapes (`inset`, `circle`, `polygon` with **same point count**). MDN: [`clip-path`](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path), [Introduction to CSS clipping](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Masking/Clipping). Spec: [CSS Masking Module Level 1](https://www.w3.org/TR/css-masking-1/).

**Fit:** With Motion already installed, animate `clipPath` on enter/exit of the slide layer — e.g. soft inset wipe or expanding circle — without WebGL. Works well on fullscreen photos; keep shapes simple for compositor friendliness.

#### 3b. `mask-image` / gradient masks

**What:** Gradient or image masks for soft edge dissolves. Spec properties in CSS Masking Level 1. Smooth interpolation of `mask-image` itself is limited; animating custom properties that feed a gradient (as Motion documents for view transitions) is the modern path.

**Fit:** Tasteful soft dissolves; less “shader morph,” more editorial.

#### 3c. Scroll-driven animations

**What:** CSS scroll-timeline / view-timeline driven effects.

**Fit for live wall:** **Not relevant** as the primary driver — the wall advances on a timer, not scroll. Skip unless a future “browse gallery” mode scrolls.

---

### 4. Framer Motion / Motion — beyond opacity

Stack already has `framer-motion@^13` (peers React 18/19). Product is now **Motion**; recommended import is `motion/react` ([upgrade guide](https://motion.dev/docs/react-upgrade-guide)); `framer-motion` package still published (`13.1.1`). Changelog notes React 19 `AnimatePresence` fixes.

| Pattern | Difference from fade | Docs |
|--------|----------------------|------|
| **`clipPath` / `filter: blur()`** on enter/exit | Wipe or soft blur dissolve instead of pure opacity | [Motion component](https://motion.dev/docs/react-motion-component), animate CSS-animatable props |
| **`layout` / `layoutId`** | Shared-element morph between layout states | [Layout animations](https://motion.dev/docs/react-layout-animations) |
| **`animateView` / VT** | Snapshot wipes using View Transitions | [animateView](https://motion.dev/docs/animate-view) |
| **Spring transitions** | Less “linear fade,” more physical settle | Transition docs |
| **`mode="sync"` / dual layers** | Crossfade without wait-gap (two images briefly overlap) | AnimatePresence modes |

**Live-wall note:** `layoutId` shines for grid→hero morphs; a single fullscreen cycler gains more from **clipPath + mild blur + Ken Burns** than from shared layout. Multi-image layouts (below) are where `layoutId` / Flip earn their keep.

**Complexity:** Low–medium; stays in DOM path; coexists poorly with tearing down WebGL every swap unless the canvas is persistent.

---

### 5. Ken Burns / cinematic hold (on-screen motion, not just transition)

**What it does differently:** During the ~7s hold, slowly `scale` + `translate` the image (documentary zoom/pan). Transition can stay soft; the wall feels alive because **still photos move**.

**Implementation (no new dep):** CSS `@keyframes` with `transform: scale() translate()` (compositor-friendly), or Motion `animate` from `{ scale: 1, x, y }` → slight zoom toward `focal_x` / `focal_y` already stored on `MediaRow`. Classic writeup: [Kirupa — Ken Burns with CSS](https://www.kirupa.com/html5/ken_burns_effect_css.htm). Historical JS KenBurns + glsl-transition stack lived in **archived** [diaporama](https://github.com/gre/diaporama) — do not adopt the package; steal the *idea*.

**Complexity:** Lowest high-impact change. Respect `prefers-reduced-motion` (disable pan/zoom). Cap zoom (~1.0→1.08) so faces stay framed via focal point.

**Performance:** Excellent (transform-only). Pair with existing fade or a clip wipe.

---

### 6. Multi-image layouts (TV/projector suitable)

| Idea | Feel | Live-wall suitability |
|------|------|------------------------|
| **Dual/triple filmstrip** | Two photos side-by-side, slow horizontal drift | Good for landscape TV if crops are careful |
| **Stacked cards / polaroid cascade** | Offset rotated frames | Risky — cute on mobile, busy/gimmicky on a projector; avoid as default |
| **Mosaic → hero morph** | Grid of recent uploads → one expands (`layoutId` / GSAP Flip) | Strong “event energy” when many photos arrive; complex |
| **Picture-in-picture next** | Small preview of upcoming slide | Modern, subtle; helps anticipation |

**GSAP Flip:** Records layout state then animates to new layout ([GSAP Flip docs](https://gsap.com/docs/v3/Plugins/Flip/)). Excellent for mosaic morphs; **adds GSAP** alongside Motion — duplicate animation systems. Prefer Motion `layout`/`layoutId` first; add GSAP only if Flip-specific needs appear.

**yet-another-react-lightbox:** Already installed for lightbox UX, not a live-wall cycler — don’t stretch it into the TV slideshow.

---

### 7. Depth / 3D — leverage existing depth maps *during* transitions

Today depth is **idle parallax only** (`DepthParallax` fragment samples depth for UV offset). Stronger options:

1. **Depth-as-displacement map between two color textures:** Use outgoing (or incoming) depth to warp UVs while `progress` advances — subject “pulls apart” / soft 3D dissolve. Same dual-texture plane as §1a; third sampler `uDepth`.
2. **Focus-pull dissolve:** Mix images weighted by depth (near subjects resolve first) — subtle, wedding-friendly if kept soft.
3. **Parallax hold + soft clip wipe exit:** Keep current R3F parallax for 7s; transition with CSS/Motion only when leaving depth mode — hybrid, less coherent than a single WebGL pipeline.

**Complexity:** Medium–high; need depth present on both slides for best results (fallback to non-depth shader when missing). Aligns uniquely with LiveLens data model.

---

### 8. Libraries — maintenance & React/Next fit (summary)

| Library | Maintained? | React/Next fit | Notes |
|---------|-------------|----------------|-------|
| **three + R3F + drei** (already in) | Yes | Excellent (R3F 9 / React 19) | Prefer extending this |
| **gl-transitions** (GLSL only) | Yes (npm 2026) | Use shaders inside Three | MIT |
| **gl-transition-libs / react-gl-transition** | Repo modernizing; npm React wrapper historically gl-react | Avoid gl-react dual stack | Prefer R3F |
| **Motion / framer-motion** | Yes; React 19 peers | Already used | Optional migrate import to `motion/react` |
| **View Transitions API** | Platform Baseline expanding | SPA `startViewTransition` | Progressive enhancement on TVs |
| **GSAP + Flip** | Yes | Works with React; careful with render timing | Extra animation runtime |
| **diaporama / diaporama-react** | **Archived** | No | Do not use |
| **curtains.js** | Alive | Duplicates Three | Skip |
| **react-kenburns-view** etc. | Small niche pkgs | Unnecessary | 20 lines of CSS/Motion suffice |

---

## What NOT to use

- **Archived slideshow engines:** [diaporama](https://github.com/gre/diaporama), [diaporama-react](https://github.com/glslio/diaporama-react) — Ken Burns + GLSL were good ideas; the packages are archived.
- **Second WebGL stack** (curtains.js, Pixi filters, gl-react) while Three/R3F already powers depth — cost and SSR/hydration pain without benefit.
- **Club / glitch defaults** from gl-transitions (heavy pixelate, RGB split, Doom dissolve) as the wedding default.
- **Cube / coverflow / flip-card carousels** (Swiper-style 3D) — dated and gimmicky on a ceremonial live wall.
- **Heavy particle overlays / confetti shaders** — distract from guest photos.
- **Scroll-driven-only techniques** as the slide advance mechanism.
- **GSAP + Motion + custom shaders all at once** for v1 — pick one primary system for transitions.
- **Remounting a new `<Canvas>` every 7s** if adopting shader transitions — use one persistent WebGL surface and swap textures.

---

## Recommended shortlist for LiveLens (top 5)

1. **Ken Burns hold (CSS/Motion) toward `focal_x`/`focal_y`**  
   **Why:** Smallest change, biggest “cinematic” lift on a 7s dwell; no new deps; TV-friendly; tasteful for weddings. Complements any transition.

2. **Persistent R3F dual-texture transition plane (+ optional depth displacement)**  
   **Why:** Reuses DepthParallax stack; can unify flat + depth slides; soft wipe/displacement from gl-transitions catalog without gl-react; unique LiveLens differentiator when depth maps exist.

3. **Motion `clipPath` + light blur dissolve (DOM path)**  
   **Why:** Already installed; modern editorial look without WebGL for simple images; easy A/B vs fade; pairs with Ken Burns.

4. **View Transitions API wipe (progressive enhancement)**  
   **Why:** Zero weight; MDN gallery pattern maps to index swaps; good for flat `<img>` path and captions; degrade to current fade. Less ideal alone for depth WebGL remounts.

5. **Occasional multi-image “recent uploads” strip or PiP next** (not polaroid cascade)  
   **Why:** Feels live and event-specific when the feed is busy; keep rare or as a mode so the wall doesn’t become a dashboard. Prefer Motion layout over GSAP Flip initially.

---

## Suggested next experiments (smallest first)

### Experiment A — Ken Burns + softer Motion exit (½–1 day)

1. On the flat `<img>` (and optionally video poster), animate `scale`/`x`/`y` over ~6.5s using focal point as pan bias; `overflow: hidden` on the frame.
2. Replace exit with `filter: blur(8px)` + opacity, or `clipPath: inset(0 0 0 0)` → `inset(0 40% 0 0)` wipe — still Motion-only.
3. Honor `prefers-reduced-motion: reduce` (static frame).
4. Compare on a large display: does the wall stop feeling like a PowerPoint fade?

**Success:** Stakeholders prefer A over current fade without calling it “gimmicky.”

### Experiment B — Single persistent WebGL slideshow plane (2–3 days)

1. Extract a `LiveWallCanvas` that always mounts one R3F `Canvas`.
2. Shader: `uTex0`, `uTex1`, `uProgress`, optional `uDepth` / soft directional wipe (port one calm gl-transition or a custom inset wipe).
3. Preload next texture via existing [`preloadLiveMedia`](../lib/media-preload.ts) + `THREE.TextureLoader` / drei `useTexture`.
4. When `depth_map_url` exists, either (i) idle parallax while `progress===0|1`, or (ii) depth-weighted dissolve during transition.
5. Keep DOM caption/QR overlays; feature-flag vs Experiment A.

**Success:** Transition reads as intentional morph/wipe; 60fps on target TV hardware at ~1080p–1440p texture size; depth photos feel continuous rather than fade-remount.

---

## Decision cheat sheet

| Goal | Prefer |
|------|--------|
| Ship something better this week | Experiment A |
| Own a signature LiveLens look | Experiment B + depth-aware mix |
| Avoid WebGL for simple events | Motion clipPath / View Transitions |
| Many simultaneous photos “event vibe” | Filmstrip / PiP mode later |
| Don’t | diaporama, gl-react dual stack, cube carousels, glitch defaults |

---

## Source index (primary)

- LiveWall current pattern: `live-lens/components/LiveWall.tsx`, `DepthParallax.tsx`
- [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [MDN Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)
- [Chrome: Smooth transitions with the View Transition API](https://developer.chrome.com/docs/web-platform/view-transitions)
- [MDN clip-path](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path) · [CSS Masking Level 1](https://www.w3.org/TR/css-masking-1/)
- [gl-transitions README / spec](https://github.com/gl-transitions/gl-transitions) · [gl-transitions.com](https://gl-transitions.com/) · [npm gl-transitions](https://www.npmjs.com/package/gl-transitions)
- [gl-transition-libs](https://github.com/gre/gl-transition-libs)
- [three.js RenderTransitionPass](https://threejs.org/docs/pages/RenderTransitionPass.html) · [example](https://threejs.org/examples/#webgl_postprocessing_transition)
- [Motion layout animations](https://motion.dev/docs/react-layout-animations) · [animateView](https://motion.dev/docs/animate-view) · [upgrade guide](https://motion.dev/docs/react-upgrade-guide)
- [GSAP Flip](https://gsap.com/docs/v3/Plugins/Flip/)
- [diaporama archived](https://github.com/gre/diaporama) · [curtains.js](https://www.curtainsjs.com/)
- [R3F dual-texture discussion](https://github.com/pmndrs/react-three-fiber/discussions/2168)
