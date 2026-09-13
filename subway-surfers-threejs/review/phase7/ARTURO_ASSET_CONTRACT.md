# Arturo — runtime asset contract (Phase 7)

What `src/Game/pursuer.ts` expects from `public/assets/glb/arturo.glb`, and how it is validated. Targets come from `ARTURO_PRODUCTION_BRIEF.md` and `Arturo_3D_Input_Packet/README.md`; measured values are filled in by the loader's runtime report (`__cvtest.pursuer.report`).

## File
- One `.glb`, embedded resources (no external textures/bins), served at `/assets/glb/arturo.glb`.
- No embedded cameras or lights (the loader strips them and reports their names).
- Meshes must not use the reserved names `train`, `kerbStone`, `coin`, `plane`.

## Geometry & materials
| Item | Target | Checked by |
|---|---|---|
| Triangles | 8k–12k | report.triangles — **measured 12 523** (kept; no decimation) |
| Material slots | 1–2 | report.materials — **measured 1** (`Material_1`, double-sided; file omits metallicFactor → glTF default 1, roughness 0.41, KHR specular ×2; the loader sets metalness 0 / roughness 0.9 / specular 1 on Arturo's own material) |
| Textures | ≤ 2048², base colour only (no PBR maps needed) | report.textures — **measured one 2048² PNG**, bound as base map and emissive map (Finn's self-lit convention) |
| Transparency | none (opaque hair, cloth, skin) | material audit |
| Shadows | none cast/received by default | loader forces off |

## Rig
| Item | Target | Checked by |
|---|---|---|
| Skeleton | one humanoid rig, ≤ 40 joints | report.bones — **measured 24** (Hips…headfront, Mixamo-style names without prefix), armature node scale 0.01 with cm bones |
| Skin weights | ≤ 4 influences per vertex | report.maxInfluences — **measured 4** |
| Bind pose | A-pose, Y-up, soles at ground, authored facing +Z | **measured**: bounds 1.021 × 1.700 × 0.353 m, min y 0, faces +Z (head→face +0.10, foot→toe +0.12) — loader auto-detects and turns him to −Z |
| Scale | any (loader scales to Finn's measured runtime height) | **fitted 3.0828** → 5.241 world units = Finn's skinned height (Finn: scale 2.8, root 0.316 above the rails, soles at 0.262) |

## Animation
| Clip | Target | Checked by |
|---|---|---|
| `run` (name contains run/sprint/charge) | loops cleanly, **in place** (no root travel), ≈0.6–0.9 s cycle | **measured**: 0.5 s, 13 keys, hips travel 0.098 m (bob only), stride 1.245 m per cycle at scale 1; 24 scale tracks dropped |
| `idle` (name contains idle/stand/breath) | loops cleanly, in place | **measured**: 3.0 s, 72 keys, hips travel 0.056 m; 24 scale tracks dropped |
| Foot contact | soles at y≈0 through the loop | run-cycle minimum −0.058 m at scale 1 → the loader lifts the mesh so the cycle's lowest point sits on the rail surface; in-game lowest point 0.10 vs Finn's 0.15 |

Both clips live on the same 24-joint skeleton in the one delivered file (Blender glTF I/O 5.1.20, 8.3 MB, one embedded buffer). Editable source: `arturo_3d_work/arturo_rigged.blend`.

## Runtime behaviour (already implemented, opt-in `?arturo=1`)
- Loaded once per Game; failure → pursuer inert, game unaffected.
- Runs on Finn's trail (resting heights only — no jump arcs), base gap 4.5 behind (+Z), lateral 2.0 toward road centre, gap closes to 3.1 over ~2 s after each committed mistake, drifts back at 0.12/s to ≤ 7.2 while clean. Run cadence follows Finn's measured speed (stride-based), capped at timeScale 1.6.
- Hidden on `ready`, re-attached on `start`, idle on `end`; hidden while overlapping a passed obstacle.
- Never raycast-able, never inside collision groups, never writes game state.
