# Arturo — production brief v0.1

Status: follows Character Study 01; visual selection and 3D production pending.

## Character

Arturo is a human rival in a friendly chase with Finn. Determined, competitive, expressive and approachable. Preserve the supplied portrait's identity cues. Keep the familiar warm smile for the character sheet and idle; a focused grin or mildly frustrated face can be authored for pursuit later. Avoid a threatening expression.

Keep the black sports jersey, ivory undershirt/collar, charcoal joggers, black/ivory trainers and restrained cyan piping shown on the sheet. Retain small hoop earrings and a close-fitting chain as simple rigid detail. Do not add loose accessories needing physics. Clothing should support the face and silhouette at gameplay camera distance.

Art direction: stylized 3D arcade character with a slightly enlarged head and readable hands/shoes. It must sit comfortably beside Finn. The sheet's facial and cloth detail should be simplified for runtime; individual curls and jersey holes do not need individual geometry.

## Proposed runtime targets — validate, do not assume

| Item | Initial target |
| --- | --- |
| Asset | `arturo.glb`, embedded resources |
| Geometry | Approximately 8–12k triangles; review silhouette before raising budget |
| Materials | Prefer 1–2 shared material slots |
| Textures | At most 2048² per texture initially; reuse a small atlas where practical |
| Surfaces | Standard metallic/roughness PBR; matte clothing, restrained skin highlights |
| Transparency | Prefer opaque geometry; no hair cards, cloth cutouts or skin subsurface shader |
| Skeleton | One deformation rig, ideally no more than 40 joints; skip individually animated fingers initially |
| Skin weights | Maximum 4 joint influences per vertex |
| Pose/orientation | Document the chosen bind pose; Y-up, soles at ground; authored facing +Z |
| Scale | Document actual bounds; size against Finn's current runtime height and camera |
| Initial animations | `idle`, `run`; both loop cleanly, baked, in place |
| Initial extras | No dynamic cloth, hair simulation, facial rig or dynamic shadow requirement |

These are authoring targets, not performance guarantees or measured output. Arturo does not need Finn's exact 23-bone contract: he has his own rig and mixer. If choosing Mixamo-compatible naming for animation reuse, verify the actual hierarchy and retargeting instead of assuming clips are interchangeable.

Preserve the rig's documented bind pose through export. Do not use the running pose as a reconstruction source for the neutral base model. The front/back sheet is for design guidance; if an image-to-3D workflow is chosen, prepare one approved isolated neutral view suitable for that workflow and inspect the resulting geometry before rigging. Do not feed a multi-character contact sheet to it as if it were one object.

## Build sequence

1. Select the identity, clothing and stylization from this sheet.
2. Build one neutral base mesh with a clean silhouette, UVs and economical materials.
3. Rig and weight it; inspect shoulders, elbows, hips, knees and ankle deformation.
4. Deliver one GLB with in-place `idle` and `run`, plus editable source and a material/triangle/texture report.
5. Preview next to the actual Finn in the current camera and lighting, then integrate a cosmetic pursuer behind a development flag.
6. Author `reach`, `catch` and `celebrate` only after the core actor reads well and passes performance checks. Those clips and cinematic sequencing are future scope.

The image design cannot substitute for steps 2–4. Do not present a static model as animation-ready or a generated video as a runtime character.

## Required model inspection

Open the GLB in the game's actual Three.js release. Check all textures, colors, bounds, ground contact and forward direction. Run both clips through multiple loops and crossfades; check skinning, joint seams, foot sliding, root drift and missing tracks. Confirm no lights/cameras were embedded unintentionally and that repeated load/unload does not leak owned resources.

Save front, back and running captures next to Finn, with the same exposure and camera. The two characters should be readable without changing global lighting to rescue one asset.
