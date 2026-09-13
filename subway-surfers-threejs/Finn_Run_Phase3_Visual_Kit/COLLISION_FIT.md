# Collision fitting — required before Phase 3 enablement
The following facts come from the user's supplied Claude repository report and must be confirmed against the checkout:
- Road width 15; lane centres X=-5,0,+5.
- Train is loaded at legacy scale 0.3 and identified by meshes named train; loadObstacle() also creates three invisible collision planes.
- Low obstacle uses kerb_stone.glb, clone scaling (1.7,3.5,6), an invisible 5 by 10 plane named kerbStone, and Obstacal.kerbStone.y=3.61.
- Rays and hit-height ratios drive collisions. A roll animation does not currently reduce the hitbox.
- Physics and MediaPipe are outside the scope of this visual work.

## Measured new asset envelopes, at native scale
Dimensions are glTF X width, Y height, Z depth; see asset-manifest.json for precise bounds and coupling offsets.
| Asset | Width | Height | Depth | Proposed mapping |
|---|---:|---:|---:|---|
| Train A / B | 4.581 | 6.5245 | 16.325 | Existing train visual, after full proxy fitting |
| Warning barrier | 4.4 | 3.5 | 1.8 | Candidate existing kerbStone visual, pending depth/footprint fit |
| Maintenance crate | 4.22 | 3.5 | 2.67 | Alternative existing low-obstacle skin, pending fit |

The train's width is below the reported 5-unit lane spacing at scale 1, but that alone does not validate a collision envelope. Nose, doors and coupling all count.
Barriers are the approximate reported low-obstacle height, but their native depths are different from the old asset's transformed depth. Do not assume matching height means matching collisions.

## Measurements Claude should return
1. Exact loaded old train Box3 min/max and size, after scale 0.3 and all rotations.
2. Train forward direction and pivot; each hidden collision plane's dimensions, position and orientation relative to the train root.
3. Current Obstacal.train and Obstacal.kerbStone values.
4. Exact old roadblock Box3 after its clone scaling, and the low-obstacle proxy transform.
5. Whether generated obstacle spacing uses raw GLB bounds, transformed bounds, constants or collision-plane dimensions.
6. Passing Phase 2 baseline FPS, pose/hand inference latency, draw calls and section-pruning behavior.

## Fit procedure
Keep the existing collision proxy as the source of truth. Match new art to it using a visual child group and measured transforms. Prefer a uniform scale and modest mesh edits to preserve train proportions; use nonuniform scaling only after judging the result.
Compute a candidate uniform scale from an explicitly chosen target dimension, then inspect ALL other dimensions. There is no universal scale that makes unequal aspect ratios identical.
Account for asymmetric front and rear extents; do not centre solely from max dimension. Align the base to the ground and the nose to the existing leading collision surface.
Keep proxy names, existing event logic, hit-height rules and spawn spacing unchanged for the first visual test.
If the crate would need a new obstacle classification, defer it. Do not add new mechanics merely to use an asset.
Do not create overhead duck gates with the current unchanged roll hitbox.
