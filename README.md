# Finn Run

A webcam-controlled endless runner for the MDC AI and Robotics Club booth. Finn, the shark mascot, runs a tropical rail city; the player steers with their body (step, jump, squat) or with both hands (seated mode), tracked in the browser by MediaPipe. Arturo, a human rival, chases behind, and a short cinematic plays when he catches Finn.

Created by Steeve A. Celestin with the MDC AI and Robotics Club.

## Layout

| Path | What |
|---|---|
| `subway-surfers-threejs/` | The game (Vue 3 + Vite + three.js 0.155, MediaPipe tasks-vision vendored under `public/mediapipe/`). |
| `subway-surfers-threejs/src/cv/` | Pose/hand tracking, calibration, gesture → key bridge, arm mimicry, camera panel UI, welcome screen. |
| `subway-surfers-threejs/src/Game/` | Runner (physics, collisions, sections), Phase 2/3 scenery kits, Phase 5 effects, Phase 6 Finn material, Phase 7 pursuer. |
| `subway-surfers-threejs/e2e/` | Headless-Chrome end-to-end suite (`threejs-e2e.mjs`) and probes. |
| `subway-surfers-threejs/review/` | Review packets, measured contracts and captures per phase; `booth/BOOTH_TRIAL_CHECKLIST.md` is the run sheet. |
| `Subway-Surfers/`, `cv-control/` | The first prototype and its gesture unit tests (still run by `npm run test:gestures`). |
| `*.blend`, `arturo_3d_work/` | Editable character sources. |

## Run

```
cd subway-surfers-threejs
npm install
npm run build-only && npm run serve      # serves dist/ on http://localhost:5180
```

Booth URL (opts into the reviewed-on-site features; every flag persists in localStorage once used):

```
http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=1&catchVideo=1
```

Reset to shipped defaults: `?env=legacy&phase3=0&fx=1&finnPolish=original&ui=original&arturo=0&catchVideo=0&lowpower=0`.

Use current Google Chrome. Allow the camera once; pick the booth camera and 1280×720 @ 60 in Sensitivity settings → Camera.

## Checks

```
npm run type-check
npm run test:gestures && npm run test:fx && npm run test:polish
# e2e: launch headless Chrome as described at the top of e2e/threejs-e2e.mjs, then
node e2e/threejs-e2e.mjs 9377
```

## Flags

| Flag | Values | Default |
|---|---|---|
| `env` | `phase2` / `legacy` scenery | legacy |
| `phase3` | `1` / `0` train + obstacle kit | 0 |
| `fx` | `1` / `0` effects | 1 |
| `finnPolish` | `original` / `soft` / `shaped` | original |
| `ui` | `phase4` / `original` | original |
| `arturo` | `1` / `0` pursuer | 0 |
| `catchVideo` | `1` / `0` game-over cinematic (needs `arturo=1`) | 0 |
| `lowpower` | `1` / `0` | 0 |
