# Finn Run — Phase 4 HUD, menus & calibration visual polish: review packet

Branch `phase2-environment`. Captured 2026-09-13 on the built app served by `node serve.mjs 5180`.
The redesign is **opt-in** (`?ui=phase4`); the default stays the original interface until a look is chosen.

## Switching between designs
Server: `http://localhost:5180` (start with `npm run serve` inside `subway-surfers-threejs/`; rebuild with `npm run build-only`).
Supported parameters (all verified in code): `env=phase2|legacy`, `phase3=1|0`, `crossings=1`, `fx=1|0`, `finnPolish=original|soft|shaped`, `ui=phase4|original`, `lowpower=1|0`.

- Redesigned: `http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4`
- Original:   `http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=original`

`ui=` persists in localStorage `cv-ui` (like the other flags) and touches nothing else: it only stamps `<html data-ui="…">`. Every other flag, setting and the game state are read independently.

## What changed (8 files, all UI layer)
| File | Change |
|---|---|
| `src/assets/phase4.css` (new, 303 lines) | The whole redesign as one scoped stylesheet: every rule starts with `html[data-ui="phase4"]`. Tokens, buttons, HUD, pre-game mask, loading, camera panel, dialogs, narrow layout, reduced-motion. |
| `src/Game/envart.ts` | `UI_MODE` flag (`?ui=`, key `cv-ui`, default original) next to the existing flags. |
| `src/main.ts` | Imports the stylesheet; sets `document.documentElement.dataset.ui` before mount. |
| `src/components/ScorePanel.vue` | Adds a gold coin icon (inline SVG) and two mistake pips against the real limit (run ends at the 2nd mistake, `ControlPlayer.checkGameStatus`). Both carry class `p4` and are `display:none` unless the redesign is on. Same props, same `.score_panel .stat` structure, numbers still text. |
| `src/components/GameGuide.vue` | Adds the "FINN RUN / Your moves. Finn runs." brand block above the existing key hint (class `p4`, hidden by default). Message/key markup unchanged. |
| `src/App.vue` | Adds a "FINN RUN" line to the loading screen (class `p4`, hidden by default). |
| `src/cv/index.ts` | (a) Panel header with the wordmark and a **Body Control / Hand Control** switch (`#cv-modes`, `#cv-mode-pose`, `#cv-mode-hands`, `aria-pressed`) that calls the existing `setMode()` — same persistence (`cv-mode`), same interpreter swap, locked while a run is live. (b) Section titles inside the settings block ("Control & sensitivity", "Effects"). (c) `#cv-stats` and `#cv-guide` moved *inside* `#cv-stage` (they were positioned "10px from the panel top", which equalled the stage top only while the stage was the first child). (d) Dialogs get `role="dialog" aria-modal aria-labelledby`, remember the control that opened them and return focus on Cancel/Escape/Close (not on Start, where the run takes over). All existing ids, handlers, events, storage keys and the `__cvtest` seam are unchanged. |
| `e2e/threejs-e2e.mjs` | Collects uncaught exceptions/console errors for the whole run; new section 11 (8 checks): root attribute follows the flag, phase-4 elements have no box in the original UI, the mode switch locks during a live run and drives `setMode`/persistence afterwards, dialog focus in/out, hidden dialog controls not focusable, dialog ARIA, HUD contract, zero console errors. |

Not changed: `src/cv/pose.js`, `src/cv/gestures.js`, `src/cv/mimic.ts`, everything under `src/Game/` except the flag file, all assets, lighting, effects, Finn presets (Phase 6 default remains `original`).

## Design notes
- Tokens as briefed: bg `#071521`, panel `#102332`, border `#304A59`, Finn blue `#159FD6`, cyan `#45CFFF`, gold `#FFD45A`, coral `#FF7868`, text `#F5F5EC` / `#B2C4CE`. Display face: Avenir Next Condensed → Arial Narrow → Helvetica/Arial (system fonts only). No new assets, no web fonts.
- Contrast (WCAG ratio, computed): text on bg 16.8, text on panel 14.6, secondary on panel 8.9, cyan labels on panel 8.9, gold on bg 13.0, coral on panel 6.2. **Primary buttons use navy text on Finn blue (6.1:1)**; white on Finn blue would have been 2.75:1, so it was rejected. Hover uses cyan (10.2:1), Stop hover coral (7.2:1), key chip gold (13.0:1).
- HUD: score first with visual priority (34px, tinted cell), coins gold with icon, mistakes coral with 2 pips. `min-width` in `ch` + tabular numerals keep the row from shifting. Same Vue update path (one `gameData` event per frame, as before); no new per-frame work.
- Camera stage: same flex box (`flex: 1`), framed with a 12px side margin, border and radius. `#cv-fit` sizes from the stage's `clientWidth/Height`, so guides, mirroring and overlay alignment are untouched; no transforms/filters on video or overlay; countdown keeps its mirror transform.
- Warnings: the framing banner keeps its icon + two lines of text, now coral-edged; status text is the live status string (never a static "Ready").
- Buttons: consistent height (44px), hover/focus-visible (cyan double ring)/active/disabled states; keyboard operation unchanged (`P`/`R`/`F` still global).
- Motion: 120ms transitions on buttons only; none under `prefers-reduced-motion`; no backdrop blur (the original banner's 6px blur is removed in phase4), no animated backgrounds.
- Narrow (≤1100px): panel scrolls, stage fixed at 46vh (full frame still shown), brand tagline hidden, mode switch full width, action buttons wrap, fullscreen stays compact.

## Verification
- `npm run type-check`: clean. `npm run build-only`: clean.
- e2e (`e2e/threejs-e2e.mjs`, headless Chrome, fake camera): **85/85 with `?ui=original` and 85/85 with `?ui=phase4`** (77 existing + 8 new). Covers calibration → countdown → run, jump/roll, lanes, restart, Stop/leaderboard/confetti, hands mode, multi-person lock, coins, VFX, prune, tuning persistence, and now the UI-mode checks and "no console errors".
- Unit suites unchanged: gestures 68/68, effects 6/6, polish 6/6.
- Effects preferences: the `cv-fx` / `cv-fx-reduced` controls and their storage/OS-preference logic are untouched (same ids, same handler block); the e2e tuning-persistence checks still pass in both modes.
- Console: 0 uncaught exceptions / console errors in both modes across the full e2e and the screenshot runs.

### Performance (headless, same conditions: god-mode run, 10 s, settings open, env=phase2 phase3=1 fx=1, 1440×900, two rounds)
| | rAF frame p50 / p95 (ms) | pose fps | inference ms | long tasks | heap MB |
|---|---|---|---|---|---|
| original r1 | 16.7 / 16.8 | 20.4 | 11.9 | 0 | 23 |
| phase4 r1 | 16.7 / 16.8 | 20.6 | 13.6 | 0 | 25 |
| original r2 | 16.7 / 16.7 | 20.6 | 12.5 | 0 | 25 |
| phase4 r2 | 16.7 / 16.8 | 20.5 | 10.4 | 0 | 22 |

Frame pacing is vsync-bound at 60 Hz in both; pose rate identical; inference and heap differences are inside run-to-run noise (they flip sign between rounds). No long tasks in either mode.

## Screenshots (`shots/`, all 1440×900 unless noted; same state in each pair)
| # | Original | Redesigned | State |
|---|---|---|---|
| 1 | `1-pregame-body-original.png` | `1-pregame-body-phase4.png` | Pre-game, Body Control, calibrated guides (JUMP/SQUAT/STEP) |
| 2 | `2-newgame-dialog-original.png` | `2-newgame-dialog-phase4.png` | Nickname / start dialog |
| 3 | `3-hand-mode-original.png` | `3-hand-mode-phase4.png` | Hand Control, calibrated (letterboxed feed as before) |
| 4 | `4-gameplay-original.png` | `4-gameplay-phase4.png` | Live run, HUD (score / 7 coins / 1 mistake), settings open |
| 5 | `5-leaderboard-original.png` | `5-leaderboard-phase4.png` | Stop → Top 3 + confetti |
| 6 | `6-narrow-900-original.png` | `6-narrow-900-phase4.png` | 900×700 narrow layout |
| — | `e2e-final-original.png` | `e2e-final-phase4.png` | End state of the e2e run |

The green camera image is Chrome's fake device; the framing banner shows because no person is in it.

## Limitations / not yet verified
- **No real camera or booth laptop in this pass.** Perf is headless (fake camera, software timing); fps/ms with a real 30 fps webcam, Body and Hand Control with a person, and readability at the booth's actual resolution and projector/monitor exposure need Steeve's check in both modes.
- Booth resolution assumed 1440×900 for captures; if the laptop is 1920×1080, the layout scales but was not captured at it.
- Fullscreen alignment was exercised only through the existing resize path (same `layoutStage`); a manual `F` toggle on the device is still worth a look.
- Font: "Avenir Next Condensed" exists on macOS; on Windows the stack falls to Arial Narrow/Arial (heavier, less condensed wordmark).
- Kept as-is on purpose: the "Sensitivity settings" disclosure label and the dialog checkbox wording, since they are existing strings; the mode switch is the new, equally prominent Body/Hand control.
