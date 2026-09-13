# Arturo — 3D modeling input

This packet advances Phase 7 from the character study to a single-character modeling reference. It contains no GLB, skeleton, animation or runtime integration.

Use Arturo_Neutral_Front.png as the single image for reconstruction. Use the earlier Finn_Run_Phase7_Arturo_Design.zip as supporting art direction, not as a multi-character reconstruction input. The new reference preserves Arturo's face, curls, earrings, black/ivory sports outfit and cyan accents in a neutral front A-pose. It is an artistic reference, not a measured orthographic drawing. Inspect fingers, hidden surfaces and the back of clothing in any resulting mesh.

## Actual status and budget

- One isolated reference image generated and visually inspected.
- Higgsfield job: 98dcee78-a60d-43f8-8a17-693881981551.
- Image cost: 1.5 credits; verified remaining balance: 1197 at generation time.
- Arturo study plus this reference: 3 image credits total.
- No 3D generation was submitted. Its cost is unknown.
- The connected model catalog lists image_to_3d with texturing, rigging and animation options. This connection does not expose its required generate_3d submission action. The image endpoint explicitly rejects that model. This does not establish whether it is available in your account's website or another supported interface.

## Production targets, subject to output inspection

One textured GLB, embedded resources; 8–12k triangles initially; preferably 1–2 material slots; textures at most 2048 square. Y-up, ground-level pivot, authored facing +Z; document measured bounds. An authored height of 1.86 is a scale target, not Arturo's real height. Keep hair opaque and simple. Prefer one humanoid skeleton with at most 40 joints and four weights per vertex. Initial clips: idle and run, looping and in place. These are targets, not guaranteed generator outputs.

Do not replace Finn or change his rig. Introduce the pursuer only after the mesh and animation contract is validated. Confirm camera visibility before choosing chase distances. Runtime performance must be measured on the booth laptop with its real camera; low file size alone is insufficient evidence.

See CLAUDE_NEXT_STEP.md for the implementation handoff and model-settings.json for proposed catalog settings. Settings are documentation, not an executable request.
