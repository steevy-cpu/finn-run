# Finn Run — tonight's presentation pack

Delivery: 15 September 2026. This is a presentation handoff, not a change to the game repository.

## Included

- `assets/finn-intro-hero.png`: new 2688 × 1520 promotional illustration, generated from the Finn and Arturo references. It is title artwork, not an exact render of the runtime models. Inspect and accept its likeness in context.
- `src/FinnIntro.mjs`: a dependency-free DOM welcome screen with a start callback, loading readiness, dismissal, keyboard support, and cleanup.
- `src/finn-presentation.css`: responsive intro, brief one-shot entrance, reduced-motion support, and optional loading/countdown/results skins.
- `preview-standalone.html`: open locally after extracting the entire folder; uses the adjacent image and inlines the module and styles for easy preview. No camera access.
- `preview.html`: equivalent module-based preview for a local web server.
- `CLAUDE_CODE_PROMPT.md`: integration instructions.

## Integration contract

Import the CSS once. Copy the PNG into the existing public asset tree and pass its served URL. Create the intro once under the game pane's existing positioned DOM wrapper, beside the canvas. This pack owns no Three.js objects or gameplay state.

```js
import { createFinnIntro } from './FinnIntro.mjs';
// Import the stylesheet with the project's existing stylesheet pipeline.
const intro = createFinnIntro({
  host: gamePaneElement, // existing DOM wrapper, position: relative
  artUrl: '/assets/images/finn-intro-hero.png',
  ready: gameAssetsAreReady,
  onStart: () => existingStartFlow(),
  onDismiss: () => showExistingReadyControls()
});
intro.show();
// Use existing asset readiness, not a new timer:
intro.setReady(true);
// Before any other existing start path advances the game:
intro.hide();
// During final application teardown:
intro.dispose();
```

The variable/function names in this example are placeholders; inspect the actual repository and reuse its real handlers. The start callback is invoked synchronously from the user click. It must preserve all existing nickname, camera, calibration, countdown, and permission gates. Do not auto-start on a timer, after camera permission, or after image load.

Show the introduction once on initial page entry. Keep the existing results/restart behavior after a run. The camera panel remains usable. If its New Game action starts a run, hide the introduction first. Dismissal/Escape reveals the existing ready controls; it must not start or stop a run. Do not leave the obscured pre-game controls keyboard-focusable: hide or make only those underlying game-pane controls inert while this intro is visible, restoring their prior state when hidden. Do not make the camera panel inert.

Only one initial welcome mask should be visible. Keep existing DOM IDs if code/tests depend on them. A public loader failure falls back to a navy gradient; the user can still access game controls while asset readiness is false. The module does not request a webcam, persist preferences, register global hotkeys, use animation frames, or modify a MediaPipe threshold.

Body/Hand chips are informational, equally styled labels. Actual mode selection stays in the existing panel. How-to copy deliberately delegates movement instructions to the real calibration prompts.

## Optional finishing touches

Add `.frp-loading-card` and `.frp-loading-label` to suitable existing loading elements. Add `.frp-countdown-value` to the existing number, preserving the countdown's current clock, events and duration. `.frp-results-heading` styles an existing heading only. Do not replace leaderboard content or the integrated catch-video controller.

## Validation and remaining checks

- Generated illustration opened and visually inspected.
- JavaScript passes `node --check`.
- Source reviewed for scoped CSS, reduced motion, no game loop, start callback, error fallback, and cleanup.
- Browser preview was blocked by this session's browser URL security policy. No browser interaction, responsive layout, focus behavior, or actual game integration is claimed as tested.
- Claude must check the real split-pane size and fullscreen, start via both buttons, keyboard dismissal, restart, and reduced motion. The overlay scrolls on short viewports; keep the primary button visible at the actual booth size by tightening spacing if needed.

## Cost and provenance

One Higgsfield image generation: 1.5 credits. Confirmed account balance after generation: 1131.5 credits. Job: `bd925e12-4802-4e6c-bb3f-bb2f874dc877`. No intro video, alternate generations, or paid retries submitted.
