# Finn Run — catch video production brief

STATUS: VIDEO GENERATION IN PROGRESS. This archive contains the production request and integration instructions, not a finished MP4. No result has been visually inspected. Do not claim the cutscene is ready or create a replacement generation merely because the render is slow.

## Submitted take

- Higgsfield job: 648f1e44-f785-496c-8700-1f9d2035eeb2
- Model: Seedance 2.5, omni-reference mode
- Requested output: four seconds, 720p, 16:9, silent, one take
- Quoted cost: 26 credits. Balance before submission: 1159.
- References: existing canonical Finn mascot and Arturo neutral modeling reference. No new character images were generated for this batch.
- Exact prompt and parameters: generation-request.json

## Intended action

Finn and Arturo slow from a jog in a colorful rail corridor. Arturo gently rests a hand on Finn's shoulder. Finn turns with a sheepish grin; Arturo smiles. Hold the final pose briefly. One continuous side-view shot; no tackling, dialogue, HUD, webcam imagery or baked-in results text.

This is a separate cinematic camera based on character references, not a render of the actual game GLBs. A brief navy transition separates it from gameplay. The actual output must be checked for character identity, hand/shoulder contact, outfit continuity and final pose before approval.

## Next steps when the same job completes

Download the original result; verify actual duration, dimensions, video codec and absence of audio. Inspect sampled frames across the whole clip, including the reach and contact. Save the verified asset as arturo-catch.mp4 and record media metadata in media-info.json. Report any generated-art mismatch honestly. No automatic paid rerolls or upscale.

Then follow CLAUDE_HANDOFF.md to add an opt-in game-over presentation. Until the verified MP4 exists, leave the current results screen behavior intact. Do not start runtime playback using an assumed URL or missing asset.
