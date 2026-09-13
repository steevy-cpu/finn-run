# Claude Code handoff — Phase 5, batch 1

Implement only coin pickup, jump takeoff dust and landing dust using the included source. Preserve the completed Phase 2 environment, Phase 3 trains/obstacles, Phase 4 UI, both input modes, gameplay physics and Finn's rig/animations. Inspect current code first: the original report is a 2026-09-12 snapshot, not a current checkout.

## Locate real event sites

The supplied report points to `src/Game/contorlPlayer.ts` (spelling intentional) for accepted jump physics, collision/coin handling and `endRun()`. It points to `src/Game/` for the game loop. Verify these against the current repository. No new event bus is required for three cosmetic method calls.

1. Coin: invoke once in the successful pickup branch that actually awards the coin. Copy the coin's world position before removal. Never call just because a proximity check runs; repeated detection must not award repeated bursts.
2. Jump: invoke when grounded physics actually accepts the jump, including buffered jumps. Use a world-space position at Finn's soles, slightly above the track to prevent depth clipping. Do not use the imported character's origin without checking its offset. Do not hook keyboard, MediaPipe or raw gesture events.
3. Land: track a small presentation-only `jumpAirborne` flag. Set it on accepted takeoff; consume it on the first subsequent airborne-to-grounded transition. Clear it on stop, death, respawn or reset. This avoids dust on every grounded frame and on initial spawn. Inspect existing physics state and reuse it. Do not change jump thresholds or make an extra ground raycast.

## API example — adapt to actual ownership

```js
import * as THREE from 'three'; // Use the game's existing installation.
import { FinnEffects } from './FinnEffects.mjs'; // Adjust to chosen destination.

const fx = new FinnEffects(THREE, scene, { scale: 1 });
const coinWorld = new THREE.Vector3(); // Reuse event-position temporaries.
const feetWorld = new THREE.Vector3();

// Start only when actual gameplay enters running, after countdown.
fx.setRunning(true);

// In accepted coin pickup branch, BEFORE removing the coin:
coinObject.getWorldPosition(coinWorld);
fx.coin(coinWorld);

// In accepted takeoff branch, after updating feetWorld from the real sole anchor:
fx.jump(feetWorld);

// In the one-time landing transition:
fx.land(feetWorld);

// Existing game loop only. Convert the game's delta to SECONDS if necessary.
// Update after current gameplay positions/camera are ready, before the next render.
fx.update(deltaSeconds, camera);

// Stop / pause / death / reset / tracking-loss pause / hidden tab:
fx.setRunning(false); // Clears all current effects immediately.
// Resume actual gameplay explicitly with fx.setRunning(true).

// Existing Phase 4 settings UI and persistence should own this preference:
fx.setReduced(reducedEffectsSetting);

// Teardown only. Detach any integration-owned listeners here too.
fx.dispose();
```

Examples name conceptual variables; they are not claims that those identifiers exist in the game. Adapt or convert the source to TypeScript using the project's conventions. Do not disable strict checking globally to accommodate this file. Do not copy the preview's vendor directory into the game or install another Three.js version.

## Loop, world and lifecycle details

- The report describes rendering before gameplay updates. Verify the present loop order; place VFX update before an existing render using the best available current transforms. If accepted events occur after that render, they appear on the next frame. Do not reorder the game/CV loops as part of this visual patch.
- The module creates no renderer, requestAnimationFrame, event listener, timeout or webcam access. It uses the game's existing loop. Call update once per game frame with seconds; don't pass milliseconds.
- Add it under an identity-transformed world scene/root outside collision/obstacle groups. Its positions are world-space. All effect objects disable raycasting, and none use reserved names such as coin, train, kerbStone or plane.
- Effects remain at their event positions while Finn advances. If the game rebases its world origin, call `fx.shiftOrigin(delta)` with the same signed translation; if the current implementation scrolls world segments, translate effects consistently with that world. No camera-relative parenting.
- Reset, stop, game over and destruction must clear the effect pool and any presentation landing flag. Pausing should clear effects and suppress new emissions until resumed. No stale burst should appear after countdown/restart or tab return.
- Reduced Effects should default from `prefers-reduced-motion` when no saved user preference exists. A saved explicit user preference may override the OS default. Use the current Phase 4 settings components/IDs. The module does not persist settings or own DOM listeners.
- There are no hit sparks, speed trails or camera changes in this batch. Existing hit feedback should remain as it is.

## Integration acceptance

Confirm exactly one burst per collected coin; rejected jump inputs produce no dust; each accepted jump has one takeoff and one landing burst; stop/reset/death clear the pool; collisions ignore effects; both Body and Hand modes behave identically. Check foreground obstacle occlusion, correct feet placement and visibility against the new track.

Keep changes isolated so effects can be disabled with one setting during comparisons. Compare effects disabled/enabled with the same device, camera resolution, quality settings, warmup and repeatable route in BOTH control modes. Record render frame time (median/p95), pose FPS and inference latency (median/p95), plus renderer calls/geometries/textures before and after repeated restarts. If telemetry lacks these measures, say so; do not invent numbers. Use any existing project performance gate. Otherwise agree the acceptable margin from repeated baseline variability before calling it passed.

Deliver a concise summary with actual modified files, event hook sites, tests, measurements and screenshots. Do not claim MediaPipe safety from the isolated preview. Hold the next VFX batch until this baseline passes.
