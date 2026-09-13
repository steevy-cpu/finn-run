# Claude Code — Phase 6 material-only Finn polish

Finish the Phase 5 integration and capture its baseline before applying this experiment. Work on the existing branch, with an independent mode/flag and the original appearance as the default until visual selection. Do not treat this package as an approved replacement model.

## 1. Inspect the actual current implementation

The old report points to `src/Game/player.ts`, `Player.createPlayer()`, `PLAYER_MODEL` and `public/assets/glb/finn.glb`. Confirm paths in the current checkout. Read the current player material setup, cached loading/respawn behavior and any changes made during Phases 2–5.

Capture the loaded runtime audit **after existing material setup, before applying polish**:

```js
import { auditFinn, createFinnPolish } from './FinnPolish.mjs';

const before = auditFinn(finnRoot, gltf.animations);
console.log(JSON.stringify(before, null, 2)); // Development-only, once.
const finnPolish = createFinnPolish(finnRoot);
finnPolish.setMode('original');
```

These variable names are illustrative. Use the current game-owned root and actual clip collection, not guessed globals. Adapt the .mjs module to TypeScript if appropriate; preserve strict checks. The audit inspects the objects without posing the skeleton or updating the animation mixer. Save its output with the test report.

If the material is not Standard/Physical, has custom shader hooks, or the model contract differs from the report, inspect and adapt deliberately. Do not change the material class, strip shader hooks or force an asset swap just to make the helper accept it.

## 2. Add independent modes

Suggested development parameter: `?finnPolish=original|soft|shaped`. Treat this as a proposal and use the project's existing flag conventions. Invalid values fall back to original at the URL parsing layer. Keep flags for environment, Phase 3, UI and Phase 5 unchanged while comparing. The helper validates mode names and has no URL or persistence logic itself.

```js
finnPolish.setMode('soft');   // First candidate.
finnPolish.setMode('shaped'); // Alternate.
finnPolish.setMode('original'); // Exact original material references.
```

Do not call setMode or recreate the controller every animation frame. There are no runtime texture uploads, extra lights, bloom, outlines, material subdivisions or changes to exposure. All existing mesh/material sharing and original objects stay available.

## 3. Handle cached respawns correctly

The report says the same loaded model is reused on respawn and existing setup writes its material fields. Verify this carefully in current code. Restoring originals before the legacy setup prevents that code from overwriting polished clones.

- When reusing a cached model, dispose the existing controller **before** the old createPlayer material pass reruns or another system replaces materials. Dispose restores original bindings and releases only the controller's clones.
- Run the unchanged original material setup, then create a fresh controller for that setup lifecycle and apply the selected mode once.
- When no material setup reruns, reuse the cached controller for that same model. Repeated createFinnPolish(root) calls return it.
- On final player/game destruction: call controller.dispose() before the game's own model/material cleanup. Do not dispose shared textures through the controller.
- Audit and remove any integration-owned settings listeners when their owning UI is destroyed.

The module intentionally detects foreign material bindings. Resolve the setup ordering instead of catching and ignoring the error or overriding unrelated material edits. Animated material properties, if discovered, also require inspection; the old report describes bone clips only.

## 4. Preserve the character contract

Keep the exact current `finn.glb` bytes unchanged: record a file hash before/after. Do not rewrite/export the file in this pass. Preserve its mesh/UVs/weights, 23 reported Mixamo bones, bind pose, runtime scale/facing and these nine names:

`run`, `jump`, `roll`, `fall`, `die`, `dance`, `idle`, `lookback`, `runlookback`.

Do not change `AnimationMixer`, animation switching/blending, `skeleton.pose()`, `__cvAfterMixer`, `ArmMimic`, gesture thresholds or hand accessibility behavior. The helper never touches those systems.

## 5. Make a real visual choice

Use the same current camera, section, timestamp/pose, environment flags, lights, render settings and exposure for all three captures. Compare front (pre-game), rear (running), side/three-quarter and the darkest current environment area. Restore the same pose between captures; do not compare different animation instants.

Look for blue/white separation, facial and jersey readability, visible silhouette, retained black shorts/shoes, and believable form without an overly shiny surface. If reducing emissive makes Finn hard to see, adjust the Finn-only candidate or keep original. Neither candidate is automatically the winner.

One material means these are whole-character settings. Do not claim independent fabric/skin roughness or new expression detail. Original UV artwork is retained.

## 6. Verify and report

- Build/type-check and existing game tests. Compare all nine animations and pre-game/body/hand mimic behavior.
- Original → soft → shaped → original restores the exact original material references and appearance. Verify after repeat restarts, stop/death/reset and cached respawn.
- GLB file hash unchanged; no added geometry, texture uploads, meshes or render passes. Check renderer counts after warmup and memory over repeated restarts.
- Compare Phase 5-complete baseline with each material candidate enabled, in both input modes. Use the same repeatable route. Record median/p95 render frame time and inference latency where existing instrumentation supports them, plus pose FPS. Do not infer latency safety from the small patch size.
- Return actual modified files, runtime material audit, tests, before/after screenshots and performance measurements. Leave the new look disabled by default until a visual winner is selected.

Use `REVIEW_REQUEST.md` to prepare the short packet for Steeve to bring back here. No need to regenerate Finn or consume Higgsfield credits for this material comparison.
