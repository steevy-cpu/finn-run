# Finn Run — Phase 7 (Arturo pursuer): status packet

Branch `phase2-environment`, 2026-09-13. Phases 2, 3, 4, 5 (batch 1) and 6 are intact; Phase 6 default remains `original`, Phase 4 remains opt-in.

## Honest status
| Stage | Status |
|---|---|
| Reference preparation | Done by the packets (study sheet + `Arturo_Neutral_Front.png`). Reference uploaded to Higgsfield storage as media `53fa11c9-1302-42dc-9b16-be6f29b87242` (free). |
| Actual model creation | **Not started — waiting for approval of the quoted spend (below).** No Arturo GLB exists in the repository; none was generated. |
| Rig / clip validation | Cannot run without the asset. The validation path is built and exercised with a labelled stand-in (see below). |
| Runtime integration | **Built and verified with a stand-in rig**, behind `?arturo=1` (default off). Not claimed complete for Arturo: the pursuer is inert until `public/assets/glb/arturo.glb` exists. |

## Route found (existing tools, no new subscription)
This Claude Code session's Higgsfield connection exposes `generate_3d` (the ChatGPT connection did not). Model catalogue: `image_to_3d` (Meshy) with texturing, auto-rigging and a 678-clip animation library; `3d_rigging` re-rigs/animates an existing 3D job. Account: plan `plus`, balance **1197 credits** at quote time.

Quoted (preflight, nothing submitted):
| Job | Settings | Quote |
|---|---|---|
| A. `image_to_3d` | texture on, rigging on, animation on → `run_fast_2_inplace` (id 658), 12k target polys, triangle, a-pose, height 1.86, no PBR, texture prompt from `model-settings.json` | **38 credits** |
| A′. same without animation | | 35 credits |
| B. `3d_rigging` on job A's GLB | height 1.86, animation `Idle` (id 0) | **8 credits** |
| **Total for run + idle on one mesh** | | **46 credits** (≈ 3.8 % of balance) |

Notes: the catalogue's default "run: 16 (RunFast)" is not in-place; the `_inplace` variants exist (ids 657–665, `Lean_Forward_Sprint_inplace` 644). Job B yields a second GLB with the idle clip on the same mesh/rig; the two clips are merged into one file before use (node-name merge; the loader also strips scale tracks and root-travel position tracks so both clips are guaranteed in-place). If Meshy's rig/clips fail inspection, the alternative is Steeve's Finn workflow: Mixamo-style rig + clips baked in Blender by Blender-Claude, using job A′ (35 credits) or the study sheet as the modelling reference — no further paid generation.

**Exact manual step required from Steeve:** reply "approve 46 credits" (or A only / A′ only). Nothing paid runs before that.

## Existing Arturo model in the repo?
None. `public/assets/glb/` holds Finn, the Mixamo donor `player1.glb`, coin/train/houses and the Phase 2/3 kits. Finn's own workflow, from the repo history: Tripo image-to-3D mesh (`tripo_material_…`) → 23-bone Mixamo-named rig → 9 clips baked in Blender by Steeve (the runtime borrows nothing from Tripo/Meshy at runtime).

## What was built (all opt-in, default off)
| File | Change |
|---|---|
| `src/Game/pursuer.ts` (new) | `Pursuer`: owns one actor + one `AnimationMixer`; loads once (GLTFLoader, not the shared cache); normalises pivot (soles y=0, centred), scale (to runtime height 5.3 ≈ Finn's measured 5.21), facing (+Z authored → −Z run direction); strips embedded cameras/lights; forces no shadows, `raycast = noop`, frustumCulled off; sanitises clips (drops scale tracks and position tracks whose travel ≥ 25 % of model height); maps `run`/`idle` by name; publishes a `report` (bounds, triangles, materials, textures, bones, influences, clips, dropped tracks). Runs on Finn's recorded trail a gap behind (+Z), lateral offset toward road centre, hides while overlapping a passed obstacle (one short upward ray against the obstacle groups), reacts once per committed mistake (gap closes 1.4 for ~3 s, then drifts back, bounded, delta-seconds smoothing). `ready` → hidden (scene is emptied by the restart handler), `start` → re-attached + `run`, `end` → `idle`. `dispose()` frees owned geometry/materials/textures, uncaches the mixer, removes the listener. |
| `src/Game/envart.ts` | `PURSUER` (`?arturo=1|0`, persisted `cv-arturo`, default off) and `PURSUER_URL` (`?arturoModel=/assets/…glb`, not persisted, tests only). |
| `src/Game/index.ts` | Creates the pursuer when flagged; updates it right after `player.update` inside the existing loop (no new RAF); disposes it in `disposeGame`. Loop order otherwise unchanged. |
| `src/cv/index.ts` | `__cvtest.pursuer` seam getter only. |
| `e2e/threejs-e2e.mjs` | Section 12 (7 checks, runs only when a pursuer loaded). |
| `review/phase7/ARTURO_ASSET_CONTRACT.md` | The asset contract the loader enforces/reports. |

Untouched: `src/cv/pose.js`, `gestures.js`, `mimic.ts`, `player.ts`, `contorlPlayer.ts`, `environment.ts`, all Phase 2/3/5/6 code and assets, Finn's GLB (sha256 still `aa15c58f…`).

## Verification (headless, fake camera)
- Type-check + build clean.
- e2e with the stand-in pursuer (`?ui=phase4&arturo=1&arturoModel=/assets/glb/player1.glb`): **92/92** (85 existing + 7 pursuer). Covers: single load with run+idle mapped; meshes unpickable and no reserved names; hidden on `ready` with the scene emptied, exactly one group re-attached on `start` (after a New Game → r → countdown restart); behind Finn (+Z, 2–9 units) on the ground with the gap reset; one reaction per committed mistake and no repeat on later frames; mistakes/game status exactly as the game set them; `idle` on Stop with no death caused; `dispose()` leaves no mixer/group/listener.
- e2e with the pursuer off (`?ui=original&arturo=0`): 85/85. Unit suites unchanged (gestures 68, fx 6, polish 6).
- Console: 0 errors/exceptions in all runs.

### Stand-in disclosure
`player1.glb` (the game's Mixamo animation donor, 8 050 tris, 83 bones, 4 materials, one 4096² texture) was used ONLY to exercise the loader and lifecycle. It is not Arturo, is not shipped as Arturo, and is only reachable through the unpersisted `?arturoModel=` test parameter. Its rig also proved the loader's robustness: without skinned-bounds measurement and track sanitising it rendered 10.9× too large.

### Cost of one extra skinned actor (stand-in, phase2+phase3+fx, 1440×900, 10 s god-mode run, two rounds)
| | draw calls | triangles | textures | heap MB | rAF p50/p95 ms | pose fps | inference ms |
|---|---|---|---|---|---|---|---|
| arturo off | 231 | 131 921 | 6 | 22 / 20 | 16.7 / 16.8 | 20.7 / 20.4 | 14.4 / 13.4 |
| arturo on | 239 / 233 | 140 373 / 139 893 | 11 | 29 / 26 | 16.7 / 16.7 | 20.6 / 20.6 | 11.0 / 10.1 |

Headless frame pacing is vsync-bound and cannot show the GPU cost; the real cost (≈ +8 draws, +8k tris, +5 textures, +5–7 MB) must be measured on the booth laptop with its camera in both control modes. The inference-ms swing is run-to-run noise (it moved the "wrong" way).

## Camera-fit measurements (stand-in, real camera rig: Finn +17 z / +9 y, look-at +5.8 y, fov 45)
- Finn: runtime height 5.21, root at y 0.32 (soles). Lanes at x = −5 / 0 / +5, obstacles fill a lane (train 5.6 wide), so a lateral placement outside Finn's trail would clip neighbouring obstacles — hence trail-following + small lateral offset + overlap-hide.
- Chosen start values: gap 4.5 (Arturo 12.5 from camera → ~1.3× Finn's screen size), lateral 2.0 toward road centre (clears Finn's silhouette at that size; 1.6 overlapped his arm), pressure −1.4 for ~3 s per mistake (floor 3.1), drift +0.12/s to max 7.2. See `shots/pursuer-run-standin.png`. These are starting points for a real camera trial, not final.

## Blockers / remaining
1. **Approval of the 46-credit generation** (or an alternative route) — nothing else is blocked on code.
2. After generation: inspect likeness, hands, hidden surfaces, textures, bounds, skeleton (≤ 40 joints, ≤ 4 influences), both clips looping in place; merge idle into the run GLB; drop `arturo.glb` in `public/assets/glb/`; run the same e2e without `arturoModel`; capture front/back/run next to Finn under the game's lighting; tune gap/lateral on the booth laptop.
3. Real-device performance with Arturo on/off, both control modes.
4. `reach`/`catch`/`celebrate` clips and any cinematic remain out of scope.

Preview URL (stand-in, for the placement only): `http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=1&arturoModel=/assets/glb/player1.glb`
Once `arturo.glb` exists: `http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=1`
