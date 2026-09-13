# Finn Run — Phase 6 material polish: review packet

Branch `phase2-environment`, commit `ec2258a` (integration) — captured 2026-09-13.

## 1. Runtime model
- Configured path: `public/assets/glb/finn.glb` (served as `/assets/glb/finn.glb`, `PLAYER_MODEL` in `src/Game/player.ts`).
- sha256 before and after the integration: `aa15c58f7ebbdd63c87ecede68d4d0071418c79aa9878d46d50872d166ce7dd7` (bytes unchanged).
- `finn_v2_rigged.blend` not included (optional per the request).

## 2. Audit
`finn-audit.json` — output of `auditFinn(root, animations)` taken after the loader's legacy material pass (emissive = color, emissiveMap = map, metalness 0) and before polish.
Headline: one skinned mesh (8060 verts), one `MeshStandardMaterial`, color/emissive ffffff, emissiveIntensity 1, roughness 0.9, metalness 0, 4096² sRGB base map also bound as emissiveMap, 23 Mixamo bones, 9 native clips, no missing clips.

## 3. Matched screenshots (same pose, camera, lights, exposure; 560×620 clip at 1.5× around Finn)
| Scene | original | soft | shaped |
|---|---|---|---|
| Pre-game front (idle, faces camera, dimmed overlay) | polish-front-original.png | polish-front-soft.png | polish-front-shaped.png |
| Running rear (frozen 1.5 s into a run) | polish-rear-original.png | polish-rear-soft.png | polish-rear-shaped.png |
| Darkest section (frozen at z < −150, mid-section) | polish-tunnel-original.png | polish-tunnel-soft.png | polish-tunnel-shaped.png |

Observed in the captures: original is the flat, fully self-lit look (no shading on the body). Soft keeps the jersey art readable and adds visible shading on the arms, torso and head. Shaped goes further (darker shadowed side, slightly stronger speculars). No visible seam or UV defect in any mode. Coins differ between frames only because their spin is not frozen.

## 4. Integration and comparison results
- Flag: `?finnPolish=original|soft|shaped` (persisted in localStorage `cv-finn-polish`); default `original`. Invalid values fall back to original.
- Controller lifecycle: disposed before every respawn's legacy material pass, re-created after the audit; disposed in `Game.disposeGame`.
- `polish-identity-render.json`: original→soft→shaped→original restores the exact original material reference; soft is a single owned clone; shaped reuses it; values applied soft {0.35, 0.80, 0}, shaped {0.18, 0.72, 0}. Renderer draw calls, triangles, geometries, textures and programs are identical across all three modes.
- Kit unit tests against the game's three (0.155): 6/6. e2e suite with `?finnPolish=soft`: 77/77 (Finn material path exercised through restart/respawn, seated mode, VFX).
- Headless perf original vs soft (Phase 5 baseline machine, same harness): pose loop p50 16.4 → 13.5 ms, hands p50 11.2 → 8.2 ms, inference 10 → 13.3 ms, heap after restarts 36 → 55 MB — all within the harness's run-to-run variance; no systematic cost expected from a material-value change.

## 5. Not tested / open
- Real webcam session on the booth laptop with each mode (fps, ms overlay) — needs Steeve.
- Readability at booth viewing distance / projector exposure; the captures are from a 1440×900 headless render.
- No texture work commissioned: the captures show no concrete defect (jersey art legible, no damaged seam).
- Visual winner not chosen yet; default stays `original` until it is.
