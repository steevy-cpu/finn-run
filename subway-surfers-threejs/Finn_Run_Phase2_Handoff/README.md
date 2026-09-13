# Finn Run — Phase 2 environment handoff
Source: Higgsfield Environment Kit 01, committed revision 4.
Project: https://higgsfield.ai/3d-jutsu/be39c9df-be5e-49b8-ad92-ecb4dee97ef5

## What this pack contains
- assets/: 12 standalone static GLBs, with only the selected module and its descendants.
- asset-manifest.json: measured bounds in glTF coordinates, dimensions, mesh/primitive counts, triangles, and initial placement guidance.
- CLEARANCE.md: native openings and suggested initial scales for the 15-unit game track.
- CLAUDE_CODE_HANDOFF.md: a scoped integration brief.
- source/: the full display GLB, editable Blender scene, and source preview.
- tools/extract_modules.py: deterministic extraction and structural validation code.
- validation.json: checks performed on the exported module files.

This is an asset handoff. The user's game repository was not available here and was not changed. A runtime integration, full game performance benchmark, or camera/jump-envelope test has NOT been performed.

## Coordinate and rendering contract
glTF Y-up, front +Z. Source Blender front -Y becomes glTF +Z. Numeric units are authored metres, but the game's unit scale must be checked against its existing Finn model.
Every root's display-board translation is reset to zero. Child transforms and authored base pivot are preserved. Pivots are ground-level authored pivots, not necessarily the centre of the entire asymmetric bounding box.
No rig, animation, runtime lights, camera, presentation ground, display captions, external textures, or MediaPipe dependency is included in the individual assets. Lettering belonging to signs stays in its module.
Principled materials and emissive material strength are preserved. Keep the game's existing GLTFLoader path and verify emissive appearance with its renderer/tone mapping.
The source display uses three directional lights. Those are presentation-only; importing source/environment_catalogue.glb wholesale is NOT the intended integration.

## Resource budget
All 12 modules together contain 7,176 triangles and 125 mesh primitives before further runtime batching. A primitive can require a draw call per render pass, so repeated placements and shadows can still be expensive despite small file sizes.
The kit has no image textures; this saves texture memory, but the original draft's goal of one or two materials per asset has not been achieved for the buildings and larger structures.
Load each GLB once, reuse geometry/materials, and avoid disposing shared resources when a section is pruned. No per-frame loading, material creation, or geometry creation.
The sources remain editable. For production, merge static parts by material or instance repeated parts where compatible. Do not add bloom, dynamic per-prop lights, new mixers, or shadow-casting flags by default.

## Quick inspection
Open any assets/*.glb in Blender or your existing Three.js GLTFLoader viewer. For catalogue appearance, use source/preview.png.
Read asset-manifest.json before placement: dimensions are width X, height Y, depth Z.
Run tools/extract_modules.py with a source GLB and a new output directory to reproduce extraction. It does not contact external services.
