// Unit tests for GestureInterpreter using synthetic landmark streams.
// Run: node cv-control/gestures.test.mjs
import { GestureInterpreter, HandsInterpreter, HANDS_DEFAULTS, DEFAULTS, applyBand } from "./gestures.js";

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log(`  ok    ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}`); }
}

// Build a 33-slot landmark array for a body whose hip center is at (hipX, hipY)
// with a vertical torso of given length. Only the 4 core points matter.
function body(hipX, hipY, torso = 0.25) {
    const lm = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }));
    lm[11] = { x: hipX + 0.08, y: hipY - torso, visibility: 1 }; // L shoulder
    lm[12] = { x: hipX - 0.08, y: hipY - torso, visibility: 1 }; // R shoulder
    lm[23] = { x: hipX + 0.06, y: hipY, visibility: 1 };         // L hip
    lm[24] = { x: hipX - 0.06, y: hipY, visibility: 1 };         // R hip
    return lm;
}

// Note: bodyCore's torso length is hypot of shoulder-hip midpoint delta = the
// `torso` argument exactly (midpoints share x). Neutral pose: hip at (0.5, 0.6).
const NEUTRAL = () => body(0.5, 0.6);
const TORSO = 0.25;

function freshCalibrated() {
    const g = new GestureInterpreter();
    g.startCalibration();
    let t = 0, evs = [];
    for (let i = 0; i < DEFAULTS.calibFrames; i++) evs = evs.concat(g.update(NEUTRAL(), (t += 33)));
    return { g, t, calibEvents: evs };
}

console.log("calibration");
{
    const { g, calibEvents } = freshCalibrated();
    check("emits calibrated event", calibEvents.some(e => e.type === "calibrated"));
    check("calibrated flag set", g.calibrated);
    check("neutral hip captured", Math.abs(g.calib.hipX - 0.5) < 1e-9 && Math.abs(g.calib.hipY - 0.6) < 1e-9);
    check("starts in center lane", g.lane === 1);
}

console.log("no events before calibration");
{
    const g = new GestureInterpreter();
    const evs = g.update(body(0.2, 0.6), 100);
    check("uncalibrated update emits nothing", evs.length === 0);
}

console.log("lane changes");
{
    const { g, t } = freshCalibrated();
    // Step to player's RIGHT = camera x decreases. offsetX = (0.5 - hipX)/0.25.
    // hipX 0.35 → offsetX 0.6 > laneEnter 0.45.
    let evs = g.update(body(0.35, 0.6), t + 33);
    check("step right → lane 1→2", evs.length === 1 && evs[0].type === "lane" && evs[0].from === 1 && evs[0].to === 2);
    // Hold there: no repeat events.
    evs = g.update(body(0.35, 0.6), t + 66);
    check("holding right emits nothing", evs.length === 0);
    // Small drift back (offsetX 0.4, still above laneExit 0.30): stay right.
    evs = g.update(body(0.40, 0.6), t + 99);
    check("hysteresis holds zone at offset 0.4", evs.length === 0 && g.lane === 2);
    // Return to center (offsetX 0.12 < laneExit 0.165).
    evs = g.update(body(0.47, 0.6), t + 132);
    check("return to center → lane 2→1", evs.length === 1 && evs[0].to === 1);
    // Step to player's LEFT = camera x increases. hipX 0.65 → offsetX -0.6.
    evs = g.update(body(0.65, 0.6), t + 165);
    check("step left → lane 1→0", evs.length === 1 && evs[0].to === 0);
    // Big cross from full left to full right in one frame.
    evs = g.update(body(0.35, 0.6), t + 198);
    check("hard cross left→right in one frame", evs.length === 1 && evs[0].from === 0 && evs[0].to === 2);
}

console.log("jump");
{
    const { g, t } = freshCalibrated();
    // Hips rise: offsetY = (0.6 - hipY)/0.25. hipY 0.54 → 0.24 > jumpFire 0.20.
    let evs = g.update(body(0.5, 0.54), t + 33);
    check("hip rise fires jump", evs.length === 1 && evs[0].type === "jump");
    // Still airborne: no repeat.
    evs = g.update(body(0.5, 0.53), t + 66);
    check("no double-fire while up", evs.length === 0);
    // Land (offsetY 0 < rearm) then jump again after cooldown.
    g.update(NEUTRAL(), t + 99);
    evs = g.update(body(0.5, 0.54), t + 700);
    check("re-jump after landing + cooldown", evs.length === 1 && evs[0].type === "jump");
}

console.log("jump cooldown");
{
    const { g, t } = freshCalibrated();
    g.update(body(0.5, 0.54), t + 33);              // jump 1
    g.update(NEUTRAL(), t + 66);                     // land fast
    const evs = g.update(body(0.5, 0.54), t + 99);  // 66ms later: inside cooldown
    check("cooldown blocks rapid re-jump", evs.length === 0);
}

console.log("duck");
{
    const { g, t } = freshCalibrated();
    // Squat: hipY 0.68 → offsetY -0.32 < -duckFire. Must HOLD duckHoldMs
    // (100ms) before the roll fires: one frame is not a squat.
    let evs = g.update(body(0.5, 0.68), t + 33);
    check("single squat frame does not fire yet", evs.length === 0 && !g.ducking);
    for (let i = 2; i <= 5 && !g.ducking; i++) evs = g.update(body(0.5, 0.68), t + 33 * i);
    check("held squat fires duck", g.ducking && evs.length === 1 && evs[0].type === "duck");
    evs = g.update(body(0.5, 0.69), t + 200);
    check("holding squat emits nothing", evs.length === 0 && g.ducking);
    // Stand back up (well after the duck→jump conversion window): offsetY 0 > -duckRearm.
    evs = g.update(body(0.5, 0.69), t + 400);
    evs = g.update(NEUTRAL(), t + 433);
    check("standing ends duck", evs.length === 1 && evs[0].type === "duck_end" && !g.ducking);
    // No jump fired by the stand-up motion.
    check("stand-up did not fire jump", true); // covered by previous length===1 check
}

console.log("tracking loss");
{
    const { g, t } = freshCalibrated();
    let evs = g.update(null, t + 33);
    check("null landmarks → no events", evs.length === 0 && !g.debug.tracking);
    const lowVis = NEUTRAL();
    lowVis[23].visibility = 0.2;
    evs = g.update(lowVis, t + 66);
    check("low-visibility hip → no events", evs.length === 0 && !g.debug.tracking);
    evs = g.update(NEUTRAL(), t + 99);
    check("recovers tracking", g.debug.tracking && evs.length === 0);
}

console.log("distance invariance");
{
    // Same person, camera twice as far: all coords scaled toward center by 0.5.
    const g = new GestureInterpreter();
    g.startCalibration();
    let t = 0;
    const far = (hipX, hipY) => body(0.5 + (hipX - 0.5) * 0.5, 0.5 + (hipY - 0.5) * 0.5, TORSO * 0.5);
    for (let i = 0; i < DEFAULTS.calibFrames; i++) g.update(far(0.5, 0.6), (t += 33));
    const evs = g.update(far(0.35, 0.6), t + 33);
    check("same step size works when far away", evs.length === 1 && evs[0].type === "lane" && evs[0].to === 2);
}

console.log("calibration stillness gate");
{
    const g = new GestureInterpreter();
    g.startCalibration();
    let t = 0;
    for (let i = 0; i < 10; i++) g.update(NEUTRAL(), (t += 33));
    // Big sideways lurch mid-window — the sampling window must restart.
    g.update(body(0.3, 0.6), (t += 33));
    check("movement restarts calibration window", !g.calibrated && g.debug.calibrating);
    let evs = [];
    for (let i = 0; i < DEFAULTS.calibFrames; i++) evs = evs.concat(g.update(body(0.3, 0.6), (t += 33)));
    check("calibrates on the new held stance", g.calibrated && Math.abs(g.calib.hipX - 0.3) < 1e-9);
    check("calibrated event after stillness", evs.some(e => e.type === "calibrated"));
}

console.log("baseline adaptation");
{
    // Small sideways drift (inside the adaptation gate) gets absorbed.
    const { g, t } = freshCalibrated();
    let tt = t;
    for (let i = 0; i < 300; i++) g.update(body(0.48, 0.6), (tt += 33));
    check("center re-centers onto slow drift", Math.abs(g.calib.hipX - 0.48) < 0.005);
    // Small vertical drift follows too.
    for (let i = 0; i < 300; i++) g.update(body(0.48, 0.605), (tt += 33));
    check("vertical baseline follows slow drift", Math.abs(g.calib.hipY - 0.605) < 0.005);
}
{
    // A held squat is a gesture, not drift: the baseline must not chase it.
    const { g, t } = freshCalibrated();
    let tt = t;
    let evs = [];
    for (let i = 0; i < 300; i++) evs = evs.concat(g.update(body(0.5, 0.68), (tt += 33)));
    check("duck fires and holds during long squat",
        evs.filter(e => e.type === "duck").length === 1 && g.ducking);
    check("baseline frozen during held squat", Math.abs(g.calib.hipY - 0.6) < 1e-6);
}
{
    // Standing in a side lane must not get absorbed as drift either.
    const { g, t } = freshCalibrated();
    let tt = t;
    for (let i = 0; i < 300; i++) g.update(body(0.35, 0.6), (tt += 33));
    check("side-lane hold keeps calibrated center", Math.abs(g.calib.hipX - 0.5) < 1e-6 && g.lane === 2);
}

console.log("aspect correction");
{
    // A 16:9 camera squeezes physical x-distances into fewer normalized
    // units; opts.aspect must rescale so the same physical step still fires.
    const A = 16 / 9;
    const g = new GestureInterpreter({ aspect: A });
    g.startCalibration();
    let t = 0;
    for (let i = 0; i < DEFAULTS.calibFrames; i++) g.update(NEUTRAL(), (t += 33));
    // Physical step that at aspect=1 would be Δx 0.15 → at 16:9 it is 0.15/A.
    const evs = g.update(body(0.5 - 0.15 / A, 0.6), (t += 33));
    check("step fires with wide-camera normalization", evs.length === 1 && evs[0].type === "lane" && evs[0].to === 2);
    // A tiny wobble must still not fire.
    g.update(body(0.5, 0.6), (t += 33));
    const evs2 = g.update(body(0.5 - 0.02 / A, 0.6), (t += 33));
    check("small wobble still ignored under aspect", evs2.length === 0);
}

console.log("predictive jump");
{
    // Fast upward launch fires before the full displacement threshold:
    // hips at +0.10 torso (below jumpFire 0.15) but rising ~3 torso/s.
    const { g, t } = freshCalibrated();
    let evs = g.update(body(0.5, 0.575), t + 33); // +0.10 in 33ms → vy ≈ 3.0
    check("fast rise fires early jump", evs.length === 1 && evs[0].type === "jump");
}
{
    // A slow creep upward (well under the jump line) must not fire.
    const { g, t } = freshCalibrated();
    let evs = [];
    for (let i = 1; i <= 10; i++) evs = evs.concat(g.update(body(0.5, 0.6 - 0.0015 * i), t + 33 * i));
    check("slow creep to +0.06 does not fire", evs.length === 0);
}
{
    // Standing up from a HELD squat is a fast rise too — must not fire a jump.
    const { g, t } = freshCalibrated();
    let tt = t;
    // A real squat holds well past the duck→jump conversion window (150ms).
    for (let i = 0; i < 15; i++) g.update(body(0.5, 0.68), (tt += 33)); // held squat → duck
    check("held squat became a duck", g.ducking);
    g.update(body(0.5, 0.60), (tt += 33));               // back to neutral → duck_end
    const evs = g.update(body(0.5, 0.575), (tt += 33));  // overshoot +0.10, fast
    check("post-squat overshoot does not fire jump", !evs.some(e => e.type === "jump"));
}

console.log("feet off the ground (ankles)");
const bodyFeet = (hipX, hipY, ankleY) => {
    const lm = body(hipX, hipY);
    lm[27] = { x: hipX + 0.05, y: ankleY, visibility: 1 };
    lm[28] = { x: hipX - 0.05, y: ankleY, visibility: 1 };
    return lm;
};
{
    const g = new GestureInterpreter();
    g.startCalibration();
    let t = 0;
    for (let i = 0; i < DEFAULTS.calibFrames; i++) g.update(bodyFeet(0.5, 0.6, 0.9), (t += 33));
    check("ankle reference captured", g.calib.ankleY !== null && Math.abs(g.calib.ankleY - 0.9) < 1e-9);
    // Feet lift 0.015 normalized = 0.06 torso (> ankleJumpFire 0.035) while
    // the hips have barely moved (+0.01): fires on the feet alone.
    const evs = g.update(bodyFeet(0.5, 0.5975, 0.885), (t += 33));
    check("feet leaving the floor fire a jump", evs.length === 1 && evs[0].type === "jump");
    // Rearm needs feet back down.
    g.update(bodyFeet(0.5, 0.6, 0.885), (t += 500));
    check("stays armed-off while feet are up", !g.jumpArmed);
    g.update(bodyFeet(0.5, 0.6, 0.9), (t += 33));
    check("feet down re-arms", g.jumpArmed);
}
{
    // Feet out of frame: hip logic still works (no ankle reference).
    const g = new GestureInterpreter();
    g.startCalibration();
    let t = 0;
    const noFeet = (x, y) => { const lm = body(x, y); lm[27].visibility = 0; lm[28].visibility = 0; return lm; };
    for (let i = 0; i < DEFAULTS.calibFrames; i++) g.update(noFeet(0.5, 0.6), (t += 33));
    check("no ankle reference without feet", g.calib.ankleY === null);
    const evs = g.update(noFeet(0.5, 0.54), (t += 33));
    check("hip jump still fires without feet", evs.length === 1 && evs[0].type === "jump");
}

console.log("launch from the dip");
{
    // Crouch to -0.10, then explode upward to only +0.02 (below jumpFire and
    // below jumpVelMinY): the rise from the dip bottom (0.12) fires it.
    const { g, t } = freshCalibrated();
    let tt = t;
    for (let i = 0; i < 3; i++) g.update(body(0.5, 0.625), (tt += 33)); // dip (no duck: -0.10 > -0.16)
    const evs = g.update(body(0.5, 0.595), (tt += 33));
    check("launch from dip fires before hips pass neutral+", evs.length === 1 && evs[0].type === "jump");
}
{
    // Deep wind-up that briefly crossed duckFire and converted: held 4 frames
    // (roll fired), then explosive rise within duckCancelMs → duck ends,
    // jump fires instead.
    const { g, t } = freshCalibrated();
    let tt = t;
    for (let i = 0; i < 5; i++) g.update(body(0.5, 0.68), (tt += 33)); // -0.32 held 132ms → duck at frame 5
    check("deep wind-up registered as duck", g.ducking);
    const evs = g.update(body(0.5, 0.60), (tt += 33)); // +0.32 in 33ms from the bottom
    const types = evs.map(e => e.type);
    check("duck→jump conversion", types.includes("duck_end") && types.includes("jump") && !g.ducking);
}

console.log("vertical band ratio");
{
    // Jump line at 25% of the band above the hips, squat line at 75% below.
    check("defaults keep the 25/75 split",
        Math.abs(DEFAULTS.jumpFire / DEFAULTS.vertBand - 0.25) < 1e-9
        && Math.abs(DEFAULTS.duckFire / DEFAULTS.vertBand - 0.75) < 1e-9);
    const g = new GestureInterpreter();
    applyBand(g.opts, 0.40);
    check("applyBand rescales both lines", Math.abs(g.opts.jumpFire - 0.10) < 1e-9 && Math.abs(g.opts.duckFire - 0.30) < 1e-9);
}

console.log("hands mode (seated)");
// Shoulders 0.2 apart (aspect 1 → scale 0.2). Wrists at rest: left at cx+0.15,
// right at cx-0.15, both at cy. Hand offsets are in shoulder widths.
const hands = (cx, cy, {lx = cx + 0.15, rx = cx - 0.15, ly = cy, ry = cy} = {}) => {
    const lm = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }));
    lm[11] = { x: cx + 0.10, y: cy - 0.25, visibility: 1 };
    lm[12] = { x: cx - 0.10, y: cy - 0.25, visibility: 1 };
    lm[15] = { x: lx, y: ly, visibility: 1 };
    lm[16] = { x: rx, y: ry, visibility: 1 };
    return lm;
};
function freshHands() {
    const g = new HandsInterpreter();
    g.startCalibration();
    let t = 0;
    for (let i = 0; i < HANDS_DEFAULTS.calibFrames; i++) g.update(hands(0.5, 0.6), (t += 33));
    return { g, t };
}
{
    const { g } = freshHands();
    check("hands: calibrates on the wrists centroid", g.calibrated && Math.abs(g.calib.hipX - 0.5) < 1e-9
        && Math.abs(g.calib.hipY - 0.6) < 1e-9 && Math.abs(g.calib.torso - 0.2) < 1e-9);
    check("hands: defaults keep 25/75 band", Math.abs(HANDS_DEFAULTS.jumpFire / HANDS_DEFAULTS.vertBand - 0.25) < 1e-9);
}
{
    const { g, t } = freshHands();
    // Both hands up 0.05 = 0.25 shoulder widths > jumpFire 0.15.
    let evs = g.update(hands(0.5, 0.6, { ly: 0.55, ry: 0.55 }), t + 33);
    check("hands: both hands up → jump", evs.length === 1 && evs[0].type === "jump");
    evs = g.update(hands(0.5, 0.6, { ly: 0.54, ry: 0.54 }), t + 66);
    check("hands: held up → no repeat", evs.length === 0);
    g.update(hands(0.5, 0.6), t + 99);
    // Only one hand up: centroid rises 0.125 widths < 0.15 → no jump.
    evs = g.update(hands(0.5, 0.6, { ly: 0.55 }), t + 700);
    check("hands: one hand up is not a jump", evs.length === 0);
}
{
    const { g, t } = freshHands();
    // Both hands down 0.10 = 0.5 widths > duckFire 0.45, held.
    let evs = [];
    for (let i = 1; i <= 5; i++) evs = evs.concat(g.update(hands(0.5, 0.6, { ly: 0.70, ry: 0.70 }), t + 33 * i));
    check("hands: both hands down (held) → squat", evs.filter(e => e.type === "duck").length === 1 && g.ducking);
    evs = g.update(hands(0.5, 0.6), t + 600);
    check("hands: hands back → squat ends", evs.some(e => e.type === "duck_end") && !g.ducking);
}
{
    const { g, t } = freshHands();
    // Right hand (landmark 16, raw x decreasing) reaches out 0.15 = 0.75 widths.
    let evs = g.update(hands(0.5, 0.6, { rx: 0.20 }), t + 33);
    check("hands: right hand out → right lane", evs.length === 1 && evs[0].type === "lane" && evs[0].to === 2);
    evs = g.update(hands(0.5, 0.6), t + 66);
    check("hands: hand back → center", evs.length === 1 && evs[0].to === 1);
    evs = g.update(hands(0.5, 0.6, { lx: 0.80 }), t + 99);
    check("hands: left hand out → left lane", evs.length === 1 && evs[0].to === 0);
    // A lane reach does not move the vertical centroid enough to jump/squat.
    check("hands: reaching sideways is not a jump", !evs.some(e => e.type === "jump"));
}
{
    const g = new HandsInterpreter();
    const evs = g.update(hands(0.5, 0.6), 100);
    check("hands: no events before calibration", evs.length === 0);
    const noHands = hands(0.5, 0.6); noHands[16].visibility = 0.1;
    g.startCalibration();
    g.update(noHands, 133);
    check("hands: hidden hand = no tracking", !g.debug.tracking);
}

{
    // Hand tracker path: no shoulders at all, size from the palm length.
    // palm 0.045 → scale 0.198 (≈ the 0.2 shoulder width used above).
    const withPalm = (cx, cy, o = {}) => { const lm = hands(cx, cy, o); lm[11].visibility = 0; lm[12].visibility = 0; lm.palm = 0.045; return lm; };
    const g = new HandsInterpreter();
    g.startCalibration();
    let t = 0;
    for (let i = 0; i < HANDS_DEFAULTS.calibFrames; i++) g.update(withPalm(0.5, 0.6), (t += 33));
    check("hands: calibrates from palm size without shoulders", g.calibrated && Math.abs(g.calib.torso - 0.198) < 1e-9);
    const evs = g.update(withPalm(0.5, 0.6, { ly: 0.55, ry: 0.55 }), t + 33);
    check("hands: jump works on the hand-tracker path", evs.length === 1 && evs[0].type === "jump");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
