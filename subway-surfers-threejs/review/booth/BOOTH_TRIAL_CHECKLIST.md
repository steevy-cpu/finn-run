# Finn Run — booth trial checklist (2026-09-13)

Not booth-ready until this trial has been done on the real laptop with its real camera. Everything below marked **[auto]** is already verified headless; **[person]** needs a human at the booth.

## Branch status (`phase2-environment`, head after this pass)
| Area | Status | Default | Persisted key |
|---|---|---|---|
| Phase 2 environment (city blocks, props) | integrated, verified | legacy (off) | `cv-envart` (`?env=phase2|legacy`) |
| Phase 3 trains + obstacles | integrated, verified | off | `cv-phase3` (`?phase3=1|0`) |
| Phase 4 UI polish | integrated, verified (85 checks in both modes); **unreviewed by Steeve** | original | `cv-ui` (`?ui=phase4|original`) |
| Phase 5 VFX batch 1 | integrated, verified | on; reduced follows OS preference | `cv-fx` (`?fx=1|0`), `cv-fx-reduced` (checkbox) |
| Phase 6 Finn material | integrated, verified; **no look chosen** | original | `cv-finn-polish` (`?finnPolish=original|soft|shaped`) |
| Phase 7 Arturo pursuer | integrated, verified (92 checks); tuning awaits this trial | off | `cv-arturo` (`?arturo=1|0`) |
| Catch cinematic | clip downloaded, probed (4.04 s, 720p, silent), frame-inspected, integrated (101 checks); fills the pane per Steeve; **visual approval pending** | off | `cv-catch-video` (`?catchVideo=1|0`; needs arturo) |
| Resource cleanup 1: section/prune/restart GPU release | complete; 6-restart counts flat, GL buffer audit 151 deletions per retired section | — | — |
| Resource cleanup 2: superseded shadow-casting light | complete; texture count flat across restarts | — | — |
| Low-power profile | available | off (auto on ARM Linux) | `cv-lowpower` (`?lowpower=1|0`) |
| Control mode / calibration / tuning / nickname / leaderboard | — | Body Control | `cv-mode`, `cv-calibration-<mode>`, `cv-tuning-v4-<mode>`, `cv-player`, `cv-leaderboard` |
| Camera denial → Retry camera (this pass) | added, verified headless (deny → message + focused Retry; grant → retry → running) | — | — |
| Draggable split (2026-09-15) | handle between the panes, 30–70 %, ←/→/Home on the handle; persisted | 50 % | `cv-split` |
| Landing snap (2026-09-15) | Finn rests exactly on the surface the ground ray found (fixes the sunk-into-the-floor runs after long frames) | — | — |

`?crossings=1` (Phase 2 tunnel/station) is NOT persisted and stays off for the trial.

## Trial URL
```
http://localhost:5180/?env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=1&catchVideo=1
```
Start the server inside `subway-surfers-threejs/` with `npm run serve` (serves `dist/`; rebuild with `npm run build-only` after code changes).

**How saved preferences affect it.** Every flag in the URL is written to localStorage on load, so after opening this URL once, plain `http://localhost:5180/` keeps the same set (phase2, phase3, fx, original Finn, Phase 4 UI, Arturo, catch video). To go back to the shipped defaults use
`http://localhost:5180/?env=legacy&phase3=0&fx=1&finnPolish=original&ui=original&arturo=0&catchVideo=0&lowpower=0`.
Calibration, tuning, control mode, nickname and leaderboard also persist per browser profile; a fresh Chrome profile (or clearing site data) is the only true fresh launch. The trial URL opts into unreviewed features (Phase 4 UI, Arturo, catch video) on purpose — they remain off by default in the code.

## Checklist
### 0. Welcome screen (presentation pack, 2026-09-15)
- [auto] Shown once on entry in the game pane; mask + HUD hidden underneath; LET'S RUN enabled and focused once the camera is up; LET'S RUN → the existing nickname prompt (no run starts); camera-panel New Game hides it; "Go to game controls"/Escape dismiss to the panel; missing art → navy gradient; reduced motion → static title; not shown again after a run. Captures: `shots/intro-split-pane-1440x900.png`, `shots/intro-fullscreen-1920x1080.png`, `shots/intro-split-pane-1280x720.png` (button bottom at 595 / 586 / 559 px — no scrolling needed).
- [person] Title art likeness acceptable in context; LET'S RUN reachable from the booth's own resolution; Body/Hand chips read as labels (selection stays in the panel).

### 0b. Camera + booth settings (2026-09-15)
- [auto] Sensitivity settings → Camera: device picker (lists cameras after permission; saved as `cv-cam-device`), Resolution/fps presets (`cv-cam-res`, default 1280×720@60), Lock exposure (`cv-cam-lock`; disabled with a note when the camera/browser has no manual exposure), live readout (label · W×H @ fps · exposure mode). A changed aspect ratio asks for a re-calibration. Booth: Reset leaderboard (two clicks within 4 s; also in the Top 3 card).
- [person] Pick the Logitech in the Device list (or set it as Chrome's default camera), choose 1280×720 @ 60, tick Lock exposure once the light is set, confirm the readout says 60 fps. Press Reset leaderboard before opening.

### 1. Fresh launch and camera permission
- [person] Fresh profile → open the trial URL → loading screen → "Press New Game (you will calibrate first)"; stats chip shows `pose N fps · ms · searching`. Note the screen resolution from the OS display settings.
- [person] Deny the camera once: status reads "Camera blocked — allow the camera in the browser's address bar, then press Retry camera"; New Game/Calibrate disabled; `P` still starts a keyboard run. Allow the camera in the address bar → Retry camera → status returns to "Press New Game". [auto: verified]
- [person] Camera busy (another app holding it) → "Camera busy…" → close the app → Retry camera.

### 2. Body and Hand Control
- [person] Body Control: New Game → nickname → hold still → "Calibrated ✓" → 3-2-1 → run. Step left/right, jump, squat each register once per move (key flash on the panel). Yellow JUMP / orange SQUAT lines sit at 25 % / 75 % of the band around the hip point and follow the player.
- [person] Hand Control (segmented switch or the New Game checkbox): both hands in front → calibrate → hands up = jump, down = squat, right/left hand out = lanes; feed is letterboxed so the STEP lines are visible. Switch is locked during a run. [auto: both modes verified with synthetic landmarks]
- [person] Mimicry: pre-game full-body mirror; arms only during the run.

### 3. Tracking loss and recovery
- [person] Step out of frame mid-run → banner "Step into frame" within ~0.3 s, status "Can't see you — step back into frame"; step back → banner clears, controls resume without re-calibration.
- [person] Second person walks behind/beside the player → stats stays "locked on player"; the cyan band follows the calibrated player; lock re-searches after ~8 lost frames.
- [person] Too close / too far / head cut off banners read correctly at the booth distance.

### 4. Arturo and obstacle readability
- [person] Arturo runs behind-right (behind-left when Finn is in the right lane), on the rails, never covering Finn's upper body or the next obstacle; follows lane changes within ~1 s; closes in for ~3 s after a mistake; idles behind Finn on Stop/crash.
- [person] He disappears for the stretch where he would overlap a barrier Finn jumped — confirm this reads as intended, not as a glitch.
- [person] Foot cadence at full speed (capped) looks like sprinting, not sliding. Tunables if not: gap 4.5, lateral 2.0, cadence cap 1.6 (`src/Game/pursuer.ts` defaults).
- [person] Note real fps/ms in the stats chip with Arturo on vs off (`?arturo=0`), same lighting.

### 5. Game over, video, results, restart
- [person] Crash (2nd mistake) → crash sound → catch video fills the game pane, Skip visible and focused; both faces and the hand on the shoulder in frame; ends after ~4 s → "You crashed! Press New Game to play again" and the play-again mask are already there. [auto: single play, Skip/Escape/ended/restart/Stop/hidden-tab exits, missing-media fallback, focus to New Game]
- [person] Skip and Escape work; Stop during the video shows the Top 3 instead.
- [person] Stop during a run → no video, confetti + Top 3 (one row per nickname, best score). Leaderboard persists across reloads.
- [person] New Game after a crash → r → 3-2-1 → run; Arturo re-appears once; no leftover overlay.

### 6. Reduced motion, fullscreen, resolution
- [person] macOS/Windows "Reduce motion" on → crash goes straight to results (no video); Reduced effects checkbox defaults on; Phase 4 transitions off. [auto: bypass verified]
- [person] `F` / ⛶ → fullscreen; guides stay aligned with the body; exit fullscreen and check again. Note the W×H@dpr readout in fullscreen.
- [person] At the booth's actual resolution: HUD readable from playing distance, camera feed not cropped where it matters (hips + feet visible standing; hands visible seated), Phase 4 panel controls all reachable without scrolling (it scrolls only below ~1100 px wide).

### 7. Repeated runs and stability
- [person] 10 consecutive New Game → play → crash/Stop cycles: one Arturo, no duplicate videos, fps/ms in the stats chip stable, no growing hitching. [auto: renderer counts flat across 6 restarts with and without Arturo; heap flat after GC; 40 s run prunes cleanly]
- [person] Leave the tab hidden for a minute mid-run and return: game resumes without a teleport, video (if it was playing) has been cancelled to results.
- [person] Long session (20+ min) fps check.

## Soak test (2026-09-15 night, `e2e/soak.mjs`, 100 booth cycles ≈ 24 min headless)
Each cycle: New Game (nickname, Body Control; every 5th cycle Hand Control; every 7th a re-calibration) → run with injected steps/jumps/squats → game over by crash (catch video played to the end or skipped on alternate cycles) or by Stop (every 3rd) → results → restart. Snapshots after a forced GC:
| after | heap MB | DOM nodes | listeners | geometries | textures | programs | pursuer groups | errors |
|---|---|---|---|---|---|---|---|---|
| start | 10.5 | 747 | 53 | 93 | 6 | 11 | 0 | 0 |
| 10 cycles | 11.7 | 795 | 53 | 97 | 8 | 14 | 1 | 0 |
| 50 cycles | 12.0 | 795 | 53 | 97 | 8 | 14 | 1 | 0 |
| 100 cycles | 12.1 | 795 | 53 | 97 | 8 | 14 | 1 | 0 |
Nothing accumulates: one settle after the first run (+48 nodes for the results/intro state, +4 geometries/+2 textures for Arturo and the video), then flat. Pose loop 21 fps / 9–15 ms throughout, one video element pair, leaderboard capped, 0 exceptions.
Headless-only artefact: the virtual display drops to 30 Hz after the first video playback; a real Chrome window stays at 60 (verified headed). The stats chip now shows `game N fps` so this is visible on the day.
Photos: every New Game saves one ~250 KB face JPEG to `photos/` (~25 MB for 100 runs) — fine for a 2-hour session; the folder was cleared of test snapshots.

## Automated results reused (this pass re-ran the suites after the camera-retry change)
- e2e with the trial flags (`env=phase2&phase3=1&fx=1&finnPolish=original&ui=phase4&arturo=1&catchVideo=1`): **101/101**; with defaults (`env=legacy&phase3=0&ui=original&arturo=0&catchVideo=0`): **85/85**; 0 console errors.
- Units: gestures 68/68, effects 6/6, polish 6/6.
- Camera denial/retry probe: denied → message + Retry focused + New Game disabled + keyboard start available; granted + Retry → running, 1280 px feed, New Game enabled.
- Earlier this session (not re-run, unchanged code paths): Phase 4 85/85 both UI modes; pursuer 92/92; restart-growth and GL buffer audits; perf tables in `review/phase4` and `review/phase7`.

## Remaining blockers before "booth-ready"
1. The real-device trial above (all [person] items), in both control modes, with the real 30/60 fps webcam.
2. Steeve's visual decisions: Phase 4 UI, Phase 6 Finn look, Arturo tuning, catch video (crop vs. a portrait re-render).
3. Booth resolution unknown to the code; read it from the stats chip on the day.
