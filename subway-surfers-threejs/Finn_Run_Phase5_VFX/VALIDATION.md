# Validation record

2026-09-13 · First batch · Candidate for integration, not a game benchmark

## Passed

- Six Node.js tests: running-state event gating and copied positions; expiry at 30/60/144 Hz and after a long delayed frame; a 10,000-iteration overflow sequence with fixed pools and object reuse; stop/restart/reduced-effects clearing; invalid inputs and origin shifts; actual Three.js object lifecycle, collision-ray exclusion and idempotent disposal.
- Adapter exercised against Three.js **0.155.0**, matching the version listed in the supplied repository report. `npm test` uses the bundled module and needs no dependency installation.
- Browser preview rendered using **WebGL1Renderer** in headless Chromium with software graphics. No page JavaScript errors were recorded. This does not measure the user's GPU performance.
- A simultaneous preview sample at 60 ms contained **9 particles and 1 ring**. The isolated preview scene increased from **9 to 12 draw calls**. Reduced Effects showed zero particles, one ring and 10 total scene draws. Stop returned to zero active effects and the 9-draw scene baseline after rendering.
- **500 repeated samples** retained the expected active effect counts and draw count. A burst saturation check reached exactly **48 particles and 8 rings**. Resource allocation bounds also follow directly from construction; long-running GPU memory was not profiled.
- Desktop (1280 px) and narrow (390 px) preview layouts inspected. No horizontal page overflow at the narrow width. Coin/jump/land buttons, sequence restart, Stop and Reduced Effects exercised.
- The preview still uses a lower shared dust opacity after visual review, keeping overlapping puffs less visually heavy. The browser checks were repeated after this adjustment.

## Still required in Claude's current checkout

- Compile/type checks against the current project and its actual locked Three.js version after Phase 4.
- Event hook correctness, real foot-anchor offsets, coin-world positions, ground depth and obstacle occlusion.
- Game lifecycle wiring and world-origin behavior; the preview simulates accepted events.
- Body and Hand control regression checks, original gameplay tests and real-device FPS/latency comparisons.
- Renderer geometry/texture memory across repeated in-game restarts and teardown.

No claim is made about MediaPipe latency, production collision behavior, or integration completion. The kit uses no Higgsfield generation calls; no account balance was queried during this task.
