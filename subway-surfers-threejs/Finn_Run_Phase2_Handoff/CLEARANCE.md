# Size and clearance checks
These are geometry-derived native asset dimensions and conservative starting suggestions. They are not collision validation in the actual game.
The user's architecture report says the road is 15 units wide, with lanes at X=-5,0,+5. Native GLB coordinates are Y-up and front +Z.

| Crossing module | Native opening width | Native vertical clearance | Suggested uniform scale | Scaled opening width | Scaled vertical clearance |
|---|---:|---:|---:|---:|---:|
| bridge_a.glb | 9.90 | 4.85 (lowest hanging sign) | 2.20 | 21.78 | 10.67 |
| tunnel_a.glb | 7.80 (between ribs) | 7.04 (underside of inner ceiling) | 2.20 | 17.16 | 15.49 |

Opening widths assume centred placement, no yaw, and uniform scale. Signs over the bridge approach determine clearance before the main deck. Both ends of the tunnel are open. The native tunnel fails the 15-unit corridor width check; the native bridge does too.
At 2.2, the tunnel allows about 1.08 units of margin on each side of a 15-unit road. The bridge allows about 3.39 on each side. These margins do not account for camera motion or character width beyond the track.
The native bridge sign bottom is 4.85. If the camera's height or jump envelope exceeds 10.67 after scaling, increase scale, reposition the sign, or defer the bridge. Do not change input or physics to make scenery fit.

## Station and side scenery
The station platform is raised 0.70 native units, has a 12 by 7 native footprint, and is decorative. Do not put it across the track or rely on it as a walkable surface.
For the city blocks, orient the facade toward the track and calculate transformed bounds before placement; the width/depth swap after a 90-degree rotation matters. Initial outside-track margin: one game unit beyond X=+/-7.5, subject to confirmation of the real repository dimensions.
Lamp, fence, bench, utility box and palm use authored ground pivots. The palm canopy is asymmetric, so check its full canopy extent rather than the trunk alone.

## Unverified in this session
Actual game unit mapping, camera path during jumps/mistakes, jump apex, section placement, collision behavior, FPS, inference latency, and device-specific memory. No game repository was changed or executed.
