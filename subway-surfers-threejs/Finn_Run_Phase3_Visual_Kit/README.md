# Finn Run — Phase 3 train and obstacle kit
Source: Higgsfield Train & Obstacle Kit 01, committed revision 2.
Project: https://higgsfield.ai/3d-jutsu/c7199c32-c484-481d-b86d-c2e1f60e3414

Status: visual candidates and optimized standalone assets. Collision fitting and in-game tests are pending.

## Contents
- assets/train_a.glb: blue Ocean Line train.
- assets/train_b.glb: cream Coast Line skin, same body geometry and overall dimensions; route text differs.
- assets/barrier_a.glb: warning barrier intended as a candidate jump-obstacle visual.
- assets/maintenance_crate_a.glb: alternate candidate low-obstacle visual.
- source/: full catalogue GLB, editable Blender scene, preview, and build/refinement scripts.
- asset-manifest.json: measured dimensions, primitive and triangle counts, file sizes.
- COLLISION_FIT.md: contracts and measurements needed before integration.
- CLAUDE_CODE_HANDOFF.md: staged integration brief.
- tools/extract_and_batch.py: deterministic extraction, transform baking and per-material batching.
- validation.json and SHA256SUMS.txt: checks and file integrity.

## Runtime format
Each standalone asset has one ground-level authored root at [0,0,0], one static mesh node, and one primitive per used material. Front +Z; Y-up; authored metre-scale numbers.
All child transforms are baked into positions and normals; triangle winding is corrected if a mirrored transform occurs. Materials, opaque glazing, emissive strengths, UVs and exact triangle counts are retained.
Standalone files exclude display rails, ground, labels, lights, cameras, animation and skins. No image textures or external resources are required.
The source Blender file retains individual parts and modifiers. Standalone files sacrifice per-part animation hierarchy for fewer draw calls. Wheels and headlights do not animate. These are offline assets; Higgsfield does not run during gameplay.

## Integration boundary
Do not merge while the Phase 2 rollout is still being evaluated. Establish the Phase 2 baseline first.
The actual game repository is not available in this workspace. Neither game code nor MediaPipe settings were changed.
Do not use the legacy train scale 0.3 automatically. Obtain the loaded old train's world-space bounds and collision-plane offsets.
No claim is made that these assets satisfy the existing collision footprint, can be rolled under, or preserve the measured tracking FPS until tested inside the game.

## Budget
This kit uses one train design with two skins and two simple obstacles. No paid image/video generations were submitted. Check current balance from the account rather than assuming 3D operations are always free.
