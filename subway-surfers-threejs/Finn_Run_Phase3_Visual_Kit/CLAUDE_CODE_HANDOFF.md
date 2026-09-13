# Claude Code — Phase 3 staged integration
This pack was developed independently while Phase 2 was being integrated. Finish and benchmark Phase 2 first. Keep Phase 3 disabled by default.

Read the real repository and AGENTS.md. File/function leads from the supplied report:
- src/Game/environment.ts: loadObstacle(), loadmodelAndSize(), setThingName(), cloneModel(), section placement and pruning.
- src/Game/const.ts: Obstacal and status constants.
- Existing GLB loader/cache and texture/material handling.
- src/Game/contorlPlayer.ts: inspect collision contracts only; do not change physics or event logic in this visual change.

## First deliverable
Return the measurement list in COLLISION_FIT.md before enabling the new art. Export the old train and roadblock with their loaded-world dimensions if remote art fitting is needed.

## Then integrate one visual at a time
1. Put new files in public/assets/glb/finn-run-phase3/. Do not overwrite original GLBs.
2. Add an environment-art feature flag and retain the old assets as a fallback.
3. Preload once and share geometry/materials for repeated instances. Each standalone file is a static, material-batched mesh; no AnimationMixer is needed.
4. Adapt Train A to the existing collision proxy. Do not blindly apply the legacy scale 0.3 to the new model.
5. Preserve existing mesh-name registration (train/kerbStone) where the current collision path expects it. Do not register rails, display board or captions as obstacles; these are absent from individual files.
6. Check head-on approach, both side lanes, collision near the nose and coupling, leading/trailing clearances, jump contacts, section transitions and repeated restarts.
7. Benchmark the same device/route before and after. Track p50/p95 render frame time, pose FPS/latency, hand mode, draw calls and memory after pruning. Polygon count alone is not a performance guarantee.
8. After Train A passes, add Train B as a skin using identical bounds and transforms. Its hull/footprint matches A; route lettering differs.
9. Only then test Barrier A as a replacement visual for the existing low obstacle. Verify its complete depth and contact positions, not just its height.
10. Keep the maintenance crate as an optional alternate visual unless its footprint and existing obstacle classification fit without gameplay changes.

## Preserve
MediaPipe engine, pose/hand settings, calibration, person lock, synthetic keyboard bridge, input thresholds, player physics, collision state machine, ground plane, Finn model/rig/clip names and mimic order.

Do not add bloom, real headlight point lights, train movement, wheel animation or moving collision planes in this pass. Emissive materials provide the headlight look without new light sources.
The still preview is a design reference. Actual game tone mapping and lighting may require material tuning.

Return screenshots, exact selected transforms, collision checks, before/after performance, changed filenames and any remaining issues.
