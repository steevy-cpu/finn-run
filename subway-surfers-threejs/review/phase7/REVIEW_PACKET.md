# Finn Run — Phase 7 (Arturo pursuer): integration packet

Branch `phase2-environment`, 2026-09-13. Phases 2, 3, 4, 5 (batch 1) and 6 intact; Phase 6 default `original`, Phase 4 opt-in. Finn's GLB sha256 unchanged (`aa15c58f…`).

## Status
| Stage | Status |
|---|---|
| Asset | `public/assets/glb/arturo.glb` delivered (Blender-rigged, editable `arturo_3d_work/arturo_rigged.blend`). Inspected in the game's own three.js: see `ARTURO_ASSET_CONTRACT.md` for measured values. Two delivery notes were wrong and are handled by measurement: the file faces **+Z** only when measured before the pivot (it is turned to −Z), and the material omits `metallicFactor` (glTF default 1). |
| Rig / clips | 24 joints, 4 influences, both clips in place (hip travel 0.10 / 0.06 m), looping; scale tracks stripped. |
| Runtime integration | **Done, opt-in** `?arturo=1` (default off, persisted `cv-arturo`). Missing/failed asset → pursuer inert, game unchanged (the e2e's `arturo=0` run and the earlier missing-file state both pass). |
| Catch video / cinematics | Not part of this phase; results behaviour unchanged. |

## Preview
- On: `http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=1`
- Off: `http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=0`

## Actual scale and placement (measured in-game, camera at Finn +17 z / +9 y, look-at +5.8 y, fov 45)
| Quantity | Value |
|---|---|
| Finn runtime height / root / sole | 5.241 / 0.316 / 0.262 (scale 2.8) |
| Arturo authored height → runtime scale | 1.700 → **3.0828** (= Finn's height 5.241; the 1.094 note is not used — Finn's runtime bounds are) |
| Armature | node scale 0.01, cm bones; skinned bounds measured after `updateMatrixWorld`, so the 0.01 is honoured, not re-applied |
| Facing | authored +Z (head→face +0.10, foot→toe +0.12) → pivot rotated π to run −Z; verified in captures |
| Feet | run-cycle minimum lifted to the rail surface; in-game lowest point 0.10 (Finn 0.15) |
| Base gap | 4.5 behind (+Z), drifting to ≤ 7.2 while clean |
| Lateral | 2.0 toward the road centre (Finn at x=5 → Arturo at 3; Finn at 0 → Arturo at 2) |
| Mistake reaction | once per committed increase: gap 4.64 → 3.10 in ~2 s, then recovers |
| Lane follow | trail-based; a lane change is followed in ~0.75 s (2.0 → 2.6 → 3.0) |
| Speed sync | Finn 20 u/s; stride 1.245 × 3.08 = 3.84 u/cycle → exact cadence would be timeScale 2.6 (5.2 cycles/s); **capped at 1.6** (3.2 cycles/s, vs Finn's 1.14). Residual foot slide ≈ 38 % at full speed — deliberate; exact sync looked like a blur. Tunable: `maxCadence`. |
| Hidden while overlapping a passed obstacle | yes (one short upward ray; e.g. sample 4 in the probe) |

Captures (`shots/`, gameplay camera, 720×900 game pane): `arturo-run.png`, `arturo-run-lane.png` (after a lane change), `arturo-run-pressure.png` (after a mistake), `arturo-idle-end.png` (Stop → idle behind Finn). See `shots/CAPTURES.md`; `shots/superseded/` holds the stand-in captures and one real-asset capture taken before the facing/material corrections.

## Code (changed files)
| File | Change |
|---|---|
| `src/Game/pursuer.ts` | `Pursuer` (one actor + one mixer per Game): loads once with its own GLTFLoader; skinned-bounds normalisation (pivot at soles, centred, scaled to Finn's measured height on first update); facing auto-detected from the bind pose; material normalised on Arturo's own material (metalness 0, roughness 0.9, specular 1, emissive = base map like Finn); clip sanitising (scale tracks and root-travel position tracks dropped, measured in world units through the 0.01 armature); stride + run-cycle-minimum measured by stepping the mixer once at load; run cadence follows Finn's measured speed (clamped); trail-following with resting heights only; hidden on `ready`, re-attached on `start`, `idle` on `end`; load race handled (run starts before the asset arrives → plays on arrival); `dispose()` frees owned geometry/material/textures, uncaches the mixer, removes the listener. |
| `src/Game/envart.ts` | `PURSUER` (`?arturo=1|0`, `cv-arturo`, default off), `PURSUER_URL` (`?arturoModel=` test-only). |
| `src/Game/index.ts` | create when flagged; `pursuer.update(delta, finn, ctl)` right after `player.update` in the existing loop; dispose in `disposeGame`. |
| `src/cv/index.ts` | `__cvtest.pursuer` getter. |
| `e2e/threejs-e2e.mjs` | section 12 (7 pursuer checks; runs only when an actor loaded). |
| `public/assets/glb/arturo.glb`, `arturo_3d_work/` | the asset and its editable source (committed as delivered). |

Untouched: MediaPipe engines/scheduling, gestures/thresholds, calibration, person lock, input mapping, physics, collisions, scoring, Finn's model/rig/clips/mimic, Phase 4 CSS, Phase 5 effects, Phase 6 presets, lighting/exposure.

## Verification (headless Chrome, fake camera, 1440×900)
- Type-check and build clean.
- e2e `?ui=phase4&arturo=1` (real asset): **92/92**. e2e `?ui=original&arturo=0`: **85/85**. Unit suites unchanged: gestures 68, effects 6, polish 6. 0 console errors/exceptions.
- Lifecycle probe: New Game → r → ready (hidden, scene emptied) → 3-2-1 → start: exactly one `pursuer` group, one actor, one mixer, `run` playing, gap reset — repeated 4×; Stop → `idle`, inactive; dispose leaves nothing.
- Hidden tab: the game loop is rAF-driven, so `Game.update` (and with it the pursuer's mixer and gap logic) stops while hidden; on return `Time` clamps the delta to 50 ms so nothing jumps. No extra handling needed or added.

### Cost of Arturo (same conditions: god-mode run through obstacles, actor animated and forced visible, 10 s, two rounds)
| | draw calls | triangles | textures | geometries | heap MB | rAF p50/p95 ms | pose fps | inference ms |
|---|---|---|---|---|---|---|---|---|
| off | 391 / 392 | 252 355 / 252 435 | 6 | 100 | 27 / 25 | 16.7 / 16.7–16.8 | 20.5 / 20.6 | 13.4 / 12.1 |
| on | 390 / 386 | 264 876 / 264 556 | 8 | 101 | 25 / 28 | 16.7 / 16.7 | 20.6 / 20.5 | 14.8 / 13.0 |

Arturo = **+12.5k triangles, +1 geometry, +2 texture objects (one 2048² image), ~1 draw call**. Headless frame pacing is vsync-bound at 60 Hz in both, so it cannot show the GPU cost of a second skinned character; inference deltas are noise (they move both ways). **Real-camera measurement on the booth laptop, both control modes, is still needed.**

### Restart growth — traced and fixed (separate commit after 44a5665)
Ownership trace: each road section creates five `PlaneGeometry`s (two ground planes in `setPlane`, three collider planes in `loadObstacle`) plus their materials and per-clone material copies; each Finn respawn creates a new shadow-casting `DirectionalLight`. The restart key handler empties the scene and `pruneBehind` removes old sections, but nothing was disposed, so renderer-tracked GPU resources grew linearly — it did not settle. Post-GC JS heap was flat throughout (18–20 MB), so this was GPU/renderer bookkeeping, not JavaScript retention.

Fix (`environment.ts`, `player.ts` only): resources a section creates are tagged as section-owned; `disposeSection()` disposes only tagged geometry/materials and calls `InstancedMesh.dispose()`; it never touches the cached model geometry, the kit's shared geometry/materials, or any texture (all textures come from the shared loader cache and are reused by the next section). `startGame()` disposes the previous sections before rebuilding, `pruneBehind()` disposes what it removes, and `createPlayer()` disposes the superseded light's shadow-map render target. Delayed loads cannot reattach obsolete objects: the section builders only await cached promises after the first section, so they complete before any later restart, and the pursuer owns a single group that it re-adds to the surviving scene object.

Six New Game → Stop cycles, forced GC before each read (renderer counts; heap separately):
| | geometries (baseline → 1 → 6) | textures | post-GC heap MB |
|---|---|---|---|
| before, off | 93 → 95 → 120 (+5/cycle) | 6 → 6 → 11 (+1/cycle) | 18.3 → 18.9 |
| before, on | 93 → 96 → 121 | 6 → 8 → 13 | 19.4 → 20.2 |
| **after, off** | 93 → 95 → **95** | 6 → 6 → **6** | 18.2 → 19.2 |
| **after, on** | 93 → 96 → **96** | 6 → 8 → **8** | 18.9 → 19.9 |

40 s single run after the fix (sections created and pruned): geometries 93 → 100 (2 alive) → 105 (3 alive) and **stay 105 when the 4th section is made and the 1st pruned**; textures constant. Arturo's constant share is +1 geometry / +2 textures.

**Correction (instance buffers).** An earlier version of this packet claimed the installed three (0.155.0) could not free instance-matrix buffers. That was wrong: the check had looked in `WebGLRenderer.js`; the handler lives in `src/renderers/webgl/WebGLObjects.js` (`onInstancedMeshDispose` → `attributes.remove(instanceMatrix)` and `instanceColor`, and `WebGLAttributes.remove` → `gl.deleteBuffer`), and the bundled `three.module.js` in `node_modules` contains it. The renderer registers that listener on every `InstancedMesh` the first time it renders it, so `disposeSection()`'s `InstancedMesh.dispose()` already releases the GPU buffers. No engine upgrade and no further code change were needed.

Direct verification (`e2e/gl-buffer-audit.mjs`, instrumentation injected from the probe into the page — nothing in the app bundle): spies on `gl.createBuffer`/`gl.deleteBuffer` of the game's context, a `dispose` listener on every per-section `InstancedMesh`, and the count of instance attributes in the sections being retired.
| | retired instanced meshes / instance attrs | dispose events fired | `gl.deleteBuffer` calls | live GL buffers after |
|---|---|---|---|---|
| restart 2…5, Arturo off | 131 / 131 each | 131 each | 151 each (= 131 instance buffers + 5 owned geometries × 4 attribute buffers) | 159, 159, 159, 159 |
| restart 2…5, Arturo on | 131 / 131 each | 131 each | 151 each | 165, 165, 165, 165 |
| long run, 4th section made / 1st pruned | 131 / 131 | +131 | +151 (while +151 were created for the new section) | plateau 461 (off) / 467 (on) with 3 sections alive |

(Restart 1 retires nothing by design: the first New Game from a fresh page counts down without an `r` restart. The Arturo on/off difference of 6 live buffers is his one skinned geometry's attribute buffers.) Per-section instanced meshes are always retired through `disposeSection()` before the section is dropped; the shared kit geometry/materials, cached model geometry and all textures are untouched, and the pursuer's actor is never disposed by the section path.

Regression after the fix: e2e 92/92 (`arturo=1`), 85/85 (`arturo=0`); gestures 68, effects 6, polish 6.

### Memory after restarts — original measurement (4 cycles, before the fix)
| | geometries | textures | heap MB |
|---|---|---|---|
| off | 95 → 100 → 105 → 110 | 6 → 7 → 8 → 9 | 21 → 22 → 22 → 31 |
| on | 96 → 101 → 106 → 111 | 8 → 9 → 10 → 11 | 21 → 23 → 25 → 30 |

The +5 geometries / +1 texture per restart is identical with Arturo off: a **pre-existing** leak in the restart path (scene children are removed without disposal while the environment rebuilds), not the pursuer. Left as found (protected system); worth a separate fix.

## Limitations
- All numbers are headless. Real webcam fps/latency with Arturo on/off, body and hand modes, and how he reads on the booth screen are Steeve's checks.
- Cadence cap (1.6) and gap/lateral are first values from the real camera geometry, not a booth trial.
- Foot slide is reduced, not eliminated (see Speed sync).
- Arturo is hidden for the stretch where Finn's trail crosses a jumped barrier; he never jumps.
- `arturo.glb` is 8.3 MB (one buffer; texture ~PNG). Load happens once per page; it is not preloaded before the first run, so on a slow disk the first run may start before he appears (handled: he joins on arrival).
- 12 523 triangles vs the 12k target: kept as delivered (no decimation, per instruction).

---

# Catch cinematic (game-over video) — integration packet

Opt-in `?catchVideo=1` (persisted `cv-catch-video`, default off). Plays only when the pursuer flag is also on and the game itself reaches game over. Not visually approved: Steeve has not yet reviewed the clip in the game.

## The clip (job `648f1e44-f785-496c-8700-1f9d2035eeb2`, Seedance 2.5 omni-reference, 26 credits already spent by the brief; nothing regenerated)
Measured with ffprobe on the downloaded original (`catch/media-info.json`):
| duration | size | codec | fps / frames | audio | bytes | sha256 |
|---|---|---|---|---|---|---|
| 4.042 s | 1280×720 (16:9) | H.264 High, yuv420p | 24 / 97 | none | 2 261 664 | `57a31d9a…0475` |

Original bytes kept as `public/assets/video/arturo-catch.mp4` (no conversion needed: H.264/AAC-less MP4 plays in Chrome, Safari and Edge).

Frame inspection (`catch/contact-sheet-0.5s-steps.png`, `frame-1.6s-contact.png`, `frame-3.9s-final.png`): jog and slow (0–1 s); Arturo's near hand rests visibly on Finn's near shoulder from ~1.5 s and stays there; Finn turns with a sheepish grin (~2.5 s); Arturo's amused smile; held final pose. Arturo's identity and outfit are consistent throughout. Finn reads as the mascot (white face, blue body, gray SHARKS jersey with black sleeve bands, black shorts, glove hands). No text, HUD, borders, watermark or extra characters.

**Mismatches, reported honestly:** (1) from the contact onward both characters are framed from the knees up, so feet are out of the clip's own frame — the brief asked for full bodies; (2) Finn's dorsal fin is visible only during the opening jog; (3) the shot is a near-static three-quarter side view rather than a tracking shot. None of these are caused by the overlay (it letterboxes the full 16:9 frame with `object-fit: contain`).

## Behaviour (src/cv/index.ts, UI layer only)
- Trigger: the game's own `end` when it was not the Stop button. Stop, actor distance, tracking loss and ordinary mistakes never trigger it. Score and leaderboard are recorded first (unchanged `recordRun` path); the crash status line and "play again" mask are set before the video starts, so the cinematic only delays their reveal.
- Overlay `#cv-catch`: DOM `<video muted playsinline preload="none">` over the game pane only (navy `#071521` letterbox, `object-fit: contain`); the camera panel and overlay canvas are untouched. Staged once at startup when both flags are on (`preload="auto"` + `load()`), never reloaded per run.
- Skip button visible from the first frame and focused; Escape skips. On any exit focus goes to New Game.
- Exits (exactly once per game over, stale events ignored via a generation token): `ended`, Skip, Escape, media `error`, `play()` rejection, 2.5 s loading allowance, watchdog at measured duration + 1.5 s, restart (`ready`/`start`), Stop, hidden tab. Repeated `end` events while active cannot start a second playback.
- `prefers-reduced-motion: reduce` bypasses the cinematic (OS preference; independent of the Effects/Reduced-effects controls). Audio: the clip is silent; the existing crash sound and theme behaviour are unchanged.
- Nothing in gameplay, collisions, MediaPipe, controls, Finn or the pursuer changed.

## Verification
- e2e `?ui=phase4&arturo=1&catchVideo=1` with the real clip: **101/101** (9 new checks: reduced-motion bypass; missing-media fallback with one play/one exit and focus on New Game; real clip plays with Skip focused; Skip exits once and hides; Escape; restart cancels; natural `ended` converges exactly once; leaderboard and results text preserved). With the flag off (`?ui=original&arturo=0&catchVideo=0`): 85/85. 0 console errors.
- Captures in `catch/`: `catch-overlay-game-pane-1440x900.png` (narrow game viewport) and `catch-overlay-fullscreen-1920x1080.png` (fullscreen-sized viewport), both taken ~1.7 s into a real game over (second mistake ends the run through the game's own `checkGameStatus`). Neither character is cropped by the overlay.

Preview: `http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=1&catchVideo=1` — crash into anything; Stop still shows the Top 3 without the video.
