# Claude — Phase 7 Arturo integration contract

**This package supplies a design sheet and proposed contract, not a runtime model.** Do not wire the PNG into gameplay as a finished pursuer. Finish Phase 4 and keep the existing Phase 5/6 work intact. No paid generation or arbitrary placeholder is requested by this brief.

The first production actor should arrive as a verified `arturo.glb` with `idle` and `run`. While that asset is pending, this document defines where it will connect. Do not claim Phase 7 integration is complete without the actor and its tests.

## Ownership

Create a separate `Pursuer` component, proposed location `src/Game/pursuer.ts`, following the current game's ownership conventions. It owns Arturo's model and mixer, listens to existing game-state changes, and receives Finn's current transform plus confirmed mistake/progress state. Verify current event names and setup order rather than trusting the original report.

No changes to MediaPipe, gesture thresholds, player locking, Body/Hand input mapping, Finn's mixer, Finn's bones, `ArmMimic`, scoring or collision rules. Arturo is not a second tracked character. Do not register him with `__cvAfterMixer`.

## First gameplay slice

- Separate development flag, disabled by default: proposed `?arturo=1|0`.
- During a run, place him behind Finn relative to the actual running direction and use `run`. The supplied report says Finn travels toward negative Z, so behind would be a positive-Z offset; verify this in current code.
- Start with a camera-fit gap that keeps Arturo, Finn and the next obstacles readable. Do not copy the old report's suggested numeric gap blindly. Check player/camera distances and full actor bounds; a character closer to the camera can cover Finn or fill the frame.
- Drive tension from changes in the committed mistake count, not every repeated collision callback. React once to each increase; stop/reset clears history. Clean running may gradually increase the visual gap, with bounded smoothing using delta seconds.
- These changes are cosmetic. Arturo must never decide whether Finn loses, award points, add damage or cause collisions. Existing game-over rules remain authoritative.
- Initially, stop/hide or idle Arturo on the existing end state. Do not invent a grab animation, delay score submission, or insert a cutscene before a real catch asset exists.

The exact gap, follow rate, lateral placement and mistake response are tuning decisions for actual camera trials. Report them after measurement. Do not add new jump/duck mechanics to the pursuer. If running through obstacles or intersecting world scenery is visible, resolve presentation placement or defer visibility in that section; do not let an untested actor silently clip through the environment in a final release.

## Lifecycle and rendering

- Load the actor once per owned lifecycle and share geometry/materials appropriately. Avoid repeated network/model loads on respawn.
- Give it a dedicated mixer and only update it from the existing game loop; no new RAF or inference loop.
- Keep Arturo outside all collision collections, with raycasting disabled for cosmetic meshes as appropriate. Do not use reserved mesh names `train`, `kerbStone`, `coin` or `plane`.
- Phase 5 found that restart clears the entire scene. Ensure the owned pursuer group is reattached after restart without accumulating duplicate actors, lights, listeners or mixers.
- Pause animation and progression when gameplay pauses or the tab is hidden. Dispose owned resources/listeners at final teardown and respect any shared cache ownership.
- Do not add a new dynamic light, post-processing pass or shadow by default. Tune materials under current lighting first.

## Acceptance once a real actor exists

Verify startup, loading failure, mode toggles, direct/repeated mistake events, clean running, death, stop, hidden-tab resume and repeated restarts. Confirm one actor/mixer, correct gap reset, no duplicate reactions and zero influence on collision/game-over rules. Check both input modes and accessibility UI visibility.

Inspect idle/run loops and crossfades, world intersections, foot sliding and camera occlusion with real gameplay screenshots. Run the existing game suite and focused pursuer lifecycle checks.

Compare the same completed Phase 4/5/6 baseline with Arturo off/on, using repeatable runs, warmup and both control modes. Record draw calls, triangles, texture memory, median/p95 frame time and inference latency where available. Report headless limitations. An extra skinned character has a real cost; do not promise it is free because it has a separate class.

After those checks, return the actual asset report, code changes, tests, measurements and screenshots. Keep advanced catch/intro/game-over cinematics for their separately approved scope.
