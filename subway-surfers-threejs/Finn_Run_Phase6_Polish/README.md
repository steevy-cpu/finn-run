# Finn Run — Phase 6: Finn material polish

First-pass integration kit · 2026-09-13

**Status: code and handoff prepared; Finn's actual visual result is not yet reviewed.** The available files and Higgsfield projects contained the environment, train and VFX kits, but not the runtime `finn.glb`. This package contains no replacement character, generated texture, or claim that Finn has already been visually improved.

## Why this pass

The supplied repository report identifies `public/assets/glb/finn.glb` as one textured mesh/material with 23 Mixamo-named bones and nine clips. It says `Player.createPlayer()` copies the color into emissive, reuses the base map as the emissive map, and sets metalness to zero. That reported setup suggests excessive self-illumination is worth testing before commissioning new textures. It is not a finding from the current checkout or a confirmed explanation for every visual issue.

The first experiment retains all artwork and texture references and changes three scalar material values on owned material clones. Emission is reduced relative to the original loaded runtime material. Geometry, bones, transforms, skinning, animations, inputs, lights, camera and renderer settings are outside this module.

## Candidates for comparison

| Mode | Emission relative to runtime baseline | Roughness factor | Metalness | Purpose |
| --- | --- | --- | --- | --- |
| original | Unchanged | Unchanged | Unchanged | Restore original material references |
| soft | 35% | 0.80 | 0 | First candidate: retain some self-illumination while showing light/shade |
| shaped | 18% | 0.72 | 0 | Comparison candidate with more reliance on the scene's lighting |

These values are hypotheses, not approved art. If there is already no effective emissive contribution, lowering its intensity may have no visible effect. A roughness texture continues to modulate the scalar roughness factor. Do not compensate for a too-dark Finn by changing global exposure or adding lights in this pass; compare or adjust the Finn-only preset first.

## Included

- `src/FinnPolish.mjs`: `auditFinn(root, clips)` and cached `createFinnPolish(root)` controller.
- `CLAUDE_CODE_HANDOFF.md`: current-code audit, placement, lifecycle, visual criteria and rollout.
- `REVIEW_REQUEST.md`: exact screenshots and runtime facts needed to finish visual selection.
- `tests/polish.test.mjs`: six tests with real Three.js material and skeleton objects.
- `vendor/`: Three.js 0.155.0 plus MIT license, for isolated tests only.

Run `npm test` with Node.js; no installation needed. Set `THREE_MODULE` to an absolute local module path to test the current game's locked version instead. Do not copy `vendor/` into the game or install a second Three.js version. Integrate only the source using current project conventions.

## Ownership and limits

One controller is cached per model root. Material clones are created lazily once per unique source material, reused by all matching slots, and restored/disposed on teardown. Toggling 500 times is covered by the tests. The normal reported single-material case adds one retained material clone and no new draw calls, geometry or textures. First-use compilation and actual performance still require a warm in-game comparison.

The controller is called only at setup or when changing modes; it has no per-frame callback, RAF, DOM listener, webcam logic, network access or timers. It supports existing Standard/Physical materials. Other material types or custom shader hooks require explicit adaptation in the current game. A detected external material reassignment fails visibly instead of silently overwriting another system's ownership.

The existing texture, including Finn's face, jersey, shorts and shoes, stays exactly referenced. A single material means these regions cannot each receive different uniform settings in this pass. Future region-specific polish needs the actual UV layout/texture first. Do not split the mesh, re-rig, re-export, rename clips, repaint identifying details, introduce normal maps or enlarge textures as part of this experiment.

## Verification performed

Six isolated Node.js tests passed against Three.js 0.155.0. They cover preservation of geometry, skeleton/bind data, bone transforms, texture references and clip data; non-compounding repeated toggles and controller reuse; material sharing and original array identity; owned-resource disposal; unsupported materials and foreign reassignment; and a read-only runtime audit.

The tests use a small synthetic skinned fixture, **not Finn**. Actual Finn rendering, shader compilation, mimic behavior, visual comparison and in-game latency have not been verified. They remain integration acceptance work. No Higgsfield image, video or 3D generation was requested for this pass.

## Technical reference

[Three.js MeshStandardMaterial documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html) describes emissive intensity and roughness factors. Emissive color is unaffected by scene lighting; this is why reducing the reported emissive contribution is a useful experiment. Current documentation is background; the supplied tests use the reported game release 0.155.0.
