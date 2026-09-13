# Claude Code — Phase 2 integration brief
Task: integrate this environment kit into the existing Finn Run repository in small reviewable changes. The files named below come from the user's supplied Claude architecture report, not a fresh inspection of your current checkout. Inspect your actual repository and AGENTS.md before editing.

## Scope
Visual environment only. Start with city_block_a.glb, city_block_b.glb and city_block_c.glb. Add props only after baseline measurement. Keep station, bridge and tunnel behind a separate visual feature flag until clearance tests pass.
Use a branch and retain a fallback to existing scenery. Do not replace the original assets in place.

## Inspect first
- src/Game/environment.ts: Environment, setGroupScene(z, houseZ, first), loadmodelAndSize(), sceneMap, cloneModel(), pruneBehind().
- Existing load3DModel caching and disposal behavior.
- Actual roadWidth, roadLength, lane X positions, ground height, section group origins and facing directions.
The report describes roadWidth=15, roadLength=330, lanes X=-5,0,+5, and section append/prune behavior. Confirm these in the checkout.
- Current camera offset, jump apex, player collision volume, rolling behavior, and Finn's world scale.
The report describes Finn scale 2.8 and a source height around 1.86 (approximately 5.2 game units), with a camera offset around (0,9,17). Treat these as leads to verify, not certified measurements.

## Protected systems
Do not alter src/cv/, PoseEngine, HandsInterpreter, calibration, thresholds, person lock, synthetic keyboard bridge, ControlPlayer physics, collision state machine, or the two-loop architecture.
Preserve Finn's bone names, clips, mixer/mimic order and current model.
Keep collision objects/groups and names plane, train, kerbStone, coin intact. The new scenery must not be added to obstacle/coin/ground raycast groups.

## Suggested implementation
1. Capture a baseline in both Body and Hand modes on the same machine, lighting, camera setup, resolution, and repeatable route. Record render frame time, tracking FPS/latency, calls, triangles, and memory after repeated restarts and section pruning.
2. Copy assets to a new public/assets/glb/finn-run-phase2/ folder. Add an environment-art feature flag, defaulting to the old scenery until verified.
3. Preload the selected modules through existing loader/cache. Clone scene nodes while sharing geometry and materials. Do not copy the legacy per-model scales from house1...5 to these assets.
4. Place buildings outside the playable corridor. Each facade faces local +Z. Suggested initial rotations: left side +pi/2, right side -pi/2, so facades face the track. Confirm visually in the actual coordinate system.
5. Compute THREE.Box3 after rotation and scale; place left assets with max.x <= -8.5 and right assets with min.x >= 8.5 as an initial one-unit margin beyond track edges +/-7.5. This is scenery spacing, not a new collision rule. Use actual extents along Z for spacing to avoid overlaps.
6. Parent scenery to the existing section groups so pruning and world coordinates remain consistent. Avoid new input listeners and per-frame scene traversals.
7. Add a small number of lamps, fences, and palms after measurements pass. Place the platform fully outside the track; its raised surface is decorative and must not replace the ground collider.
8. Bridge/tunnel: use CLEARANCE.md and actual post-transform bounds. A suggested scale of 2.2 is an initial fit check, not a certified game-safe setting. Ensure the full camera/jump/player path clears geometry. Never solve visual overlap by disabling/changing gameplay collision.
9. Disable castShadow on new scenery initially. Match existing lighting first; do not import the source display lights.
10. Run repository-required gates and relevant existing tests, then perform the same Body/Hand mode baseline route, lane switches, jumps, restarts, and section-boundary crossings. Compare p50/p95 frame/inference time and dropped frames. Report regression measurements; do not call it MediaPipe-safe from polygon counts alone.

## Return to Steeve
Provide changed files, screenshots from actual gameplay, chosen scales and placement offsets, measured render/tracking before-after results, any material limitations, and a clear switch to restore the old scenery.
Stop the visual rollout if latency/FPS regresses; reduce object/material counts or placements first. No scope expansion into controls or new gameplay mechanics.
