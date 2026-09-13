# Arturo — runtime asset contract (Phase 7)

What `src/Game/pursuer.ts` expects from `public/assets/glb/arturo.glb`, and how it is validated. Targets come from `ARTURO_PRODUCTION_BRIEF.md` and `Arturo_3D_Input_Packet/README.md`; measured values are filled in by the loader's runtime report (`__cvtest.pursuer.report`).

## File
- One `.glb`, embedded resources (no external textures/bins), served at `/assets/glb/arturo.glb`.
- No embedded cameras or lights (the loader strips them and reports their names).
- Meshes must not use the reserved names `train`, `kerbStone`, `coin`, `plane`.

## Geometry & materials
| Item | Target | Checked by |
|---|---|---|
| Triangles | 8k–12k | report.triangles |
| Material slots | 1–2 | report.materials |
| Textures | ≤ 2048², base colour only (no PBR maps needed) | report.textures |
| Transparency | none (opaque hair, cloth, skin) | material audit |
| Shadows | none cast/received by default | loader forces off |

## Rig
| Item | Target | Checked by |
|---|---|---|
| Skeleton | one humanoid rig, ≤ 40 joints | report.bones |
| Skin weights | ≤ 4 influences per vertex | report.maxInfluences |
| Bind pose | A-pose, Y-up, soles at ground, authored facing +Z | loader normalises pivot/scale; facing via `facing` option |
| Scale | any (loader scales to runtime height 5.3 ≈ Finn's 5.21) | report.bounds / runtimeScale |

## Animation
| Clip | Target | Checked by |
|---|---|---|
| `run` (name contains run/sprint/charge) | loops cleanly, **in place** (no root travel), ≈0.6–0.9 s cycle | loader strips scale tracks and root-travel position tracks; e2e plays it |
| `idle` (name contains idle/stand/breath) | loops cleanly, in place | same |
| Foot contact | soles at y≈0 through the loop | visual check in-game |

Both clips must live on the SAME skeleton in the SAME file. If the generator delivers them as two GLBs (one per animation job), merge the second clip into the first file by node name before dropping it in `public/assets/glb/` (see `merge-clips` note in REVIEW_PACKET.md).

## Runtime behaviour (already implemented, opt-in `?arturo=1`)
- Loaded once per Game; failure → pursuer inert, game unaffected.
- Runs on Finn's trail, base gap 4.5 behind (+Z), lateral 1.6 toward road centre, gap closes by 1.4 for ~3 s after each committed mistake, drifts back to ≤ 1.6× base while clean.
- Hidden on `ready`, re-attached on `start`, idle on `end`; hidden while overlapping a passed obstacle.
- Never raycast-able, never inside collision groups, never writes game state.
