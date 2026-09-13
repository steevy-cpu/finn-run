# Catch video — integration handoff

Read README.md first. The video job is still rendering; this packet does not contain an MP4 or media-info.json yet. Apply the following integration instructions only after the original job completes and its result has been downloaded, inspected and accompanied by measured media-info.json. The video is a generated presentation asset based on the approved character references, not a render of the exact runtime GLBs. Keep it opt-in for visual review.

## Behavior

- Add the supplied MP4 as public/assets/video/arturo-catch.mp4. Keep its original file bytes unless a measured compatibility/size issue requires conversion.
- Add a separate catchVideo flag using existing conventions, default off. Play only when both Arturo and catchVideo are enabled, and the game reaches authoritative game over. Never infer a catch from actor distance, camera tracking loss, Stop, or an ordinary mistake.
- Commit score, leaderboard data and game-over state through their existing paths immediately. The cinematic may delay showing the results, never recording them. Continue to results exactly once when skipped, ended or unavailable.
- Use a DOM video overlay over the game viewport. Preserve aspect ratio with contain and a navy letterbox if needed. Keep the camera panel geometry and overlay alignment unchanged. A brief navy transition can separate the gameplay view from this different cinematic camera. No Three.js VideoTexture or live generation.
- Use muted, playsInline, no loop and no autoplay before the actual game-over event. This clip is intended to be silent; preserve the user's existing audio preferences. Do not introduce new music.
- Provide a clearly visible keyboard-accessible Skip button from the first frame; Escape also skips. Manage focus and restore it to the appropriate results/restart control. Do not trap the user on a failed video.
- For prefers-reduced-motion, bypass the moving cinematic and show results immediately. The cinematic has its own control, independent of particle effects.
- On play rejection, media error or prolonged loading, immediately fall back to results. Use a bounded watchdog based on measured clip duration with a small loading allowance. Clear it on every exit.
- A restart, Stop, teardown or hidden tab cancels playback. Invalidate stale events from previous runs. Repeated game-over events cannot create duplicate overlays, listener sets or results submissions.
- Stage/preload the asset once outside active play if appropriate; do not start downloads or decoding repeatedly during the run. No new animation-frame or inference loops, shaders, lights or modifications to protected gameplay/CV systems.

## Verification

Use existing tests where they cover these paths. Add focused coverage only for new risks: a single playback per game over; Skip/ended convergence without duplicate results; blocked or missing media fallback; restart/stale-event cancellation; reduced-motion bypass. Verify original behavior when disabled. Capture the real overlay in the narrow game viewport as well as fullscreen; avoid cropping either character.

Return changed files, commit, preview URL, relevant test results and any visual mismatch. Do not call it visually approved until the user has reviewed the clip in the game. No paid regeneration, upscaling or additional cutscenes in this integration task.
