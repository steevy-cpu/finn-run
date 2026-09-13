# Finn Run — Phase 5 VFX starter kit

Version 1.0 · 2026-09-13 · first batch only

Includes real Three.js effects for coin collection (220 ms), accepted jump takeoff (180 ms), and landing after a jump (200 ms). No generated images, textures, audio, webcam code, shaders, bloom, or external requests. No Higgsfield generation calls were made for this kit.

This is an integration candidate. It has not been installed into the game or measured alongside MediaPipe. Claude is handling that integration separately. The preview uses the same effect implementation as the handoff.

## Preview

Extract the ZIP. In this folder run `python3 -m http.server 8765`, then open http://localhost:8765/preview.html. On Windows, `py -m http.server 8765` may be the appropriate command. Opening HTML directly with file:// is insufficient for its ES modules. No internet is needed: Three.js 0.155.0 and its MIT license are included under `vendor/` exclusively for this preview.

Use Coin / Jump / Land to sample individual effects, Play sequence to loop, and Stop & clear to remove them. Slow motion is a preview inspection aid, not a proposed game feature. Reduced Effects honors the OS preference initially. `preview.png` is a still sample at 60 ms; actual effects last less than a quarter second.

## Contents

- `src/FinnEffects.mjs` — source with a pure bounded simulation pool and Three.js adapter.
- `CLAUDE_CODE_HANDOFF.md` — integration instructions and event wiring examples.
- `tests/effects.test.mjs` — meaningful lifecycle, overflow and timing checks.
- `VALIDATION.md` — checks performed and remaining in-game checks.
- `preview.html`, `preview.png`, `vendor/` — local visual review.

Run the six automated checks with `npm test` (Node.js required; no install step). To check another locally installed Three.js version, set `THREE_MODULE` to its absolute module path when running the tests.

## Budget and appearance

Default limits: 48 spark/dust particles combined and 8 simultaneous coin rings. Cosmetic overflow is dropped. The two particle types each use one InstancedMesh; each visible ring uses one mesh. The effect subtree therefore adds at most 10 draws per render pass with these settings; zero when empty. This is an implementation bound, not a frame-time guarantee. Dust is translucent with fixed shared opacity and shrinks to disappear; ring opacity fades independently. No object casts or receives shadows. No post-processing is required.

Three geometries and ten materials are allocated on construction; objects are reused. Update does not create geometries, materials, vectors, or a new animation loop. Transparent dust instances are not individually depth-sorted; keep small puffs near the feet and inspect overlap at the actual game camera. Effects use depth testing and do not force themselves above obstacles.

Gold: #FFD45A. Dust: #D5C9B5. Default scale is a starting point in game units; tune against Finn's actual foot position and the integrated camera. The preview exaggerates size to 1.5× for inspection.

Reduced Effects removes dust and diamond sparkles, retaining a smaller, quieter coin ring. This module does not change score, mistake notices, audio, controls, or calibration.

## References

The supplied repository report identifies Three.js 0.155 and WebGL1Renderer. The preview and adapter checks use that exact release, not an assumed upgrade. Claude must inspect the current lockfile after Phase 4.

- [Three.js InstancedMesh documentation](https://threejs.org/docs/pages/InstancedMesh.html): instance transforms, update flags, disposal, and batching.
- [Three.js MeshBasicMaterial documentation](https://threejs.org/docs/pages/MeshBasicMaterial.html): unlit materials.
- These current docs are reference context; compatibility verification here uses 0.155.0 locally.
