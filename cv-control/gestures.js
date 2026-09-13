// GestureInterpreter — turns pose landmarks into discrete game intents.
// Pure logic, no DOM: usable from the browser page and from Node unit tests.
//
// Conventions:
// - Landmarks are MediaPipe normalized coords (x,y in 0..1, y grows downward).
// - All distances are normalized by torso length (shoulder-center to
//   hip-center), so the player's distance from the camera doesn't matter.
// - offsetX is positive when the player steps to THEIR right (raw camera x
//   decreases), matching the mirrored on-screen view and the game's
//   right-arrow direction.
//
// Events emitted by update():
//   {type:'calibrated'}
//   {type:'lane', from, to}          lane 0=left 1=center 2=right
//   {type:'jump'}
//   {type:'duck'} / {type:'duck_end'}

const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
const L_ANKLE = 27, R_ANKLE = 28;
const L_WRIST = 15, R_WRIST = 16;

// ===== TUNING KNOBS =====
// All distances are in TORSO LENGTHS (shoulder-center → hip-center), so the
// same numbers work at any distance from the camera. Smaller = more
// sensitive. The in-game sliders override laneEnter / jumpFire / duckFire
// (and rescale the matching *Exit/*Rearm values proportionally).
export const DEFAULTS = {
    laneEnter: 0.25,      // |offsetX| to enter a side zone (step size)
    laneExit: 0.165,      // |offsetX| to return to center (hysteresis)
    // Vertical command band around the (smoothed) hip point: the JUMP line
    // sits jumpRatio of the band above it, the SQUAT line the rest below.
    // Default 0.32 torso → jump at +0.08, squat at -0.24 (25% / 75%).
    vertBand: 0.32,
    jumpRatio: 0.25,
    jumpFire: 0.08,       // = vertBand * jumpRatio (derived; see applyBand)
    jumpRearm: 0.032,     // must come back below this before next jump
    jumpCooldownMs: 350,  // min time between jumps
    jumpVelFire: 1.6,     // torso/s upward: predictive early jump...
    jumpVelMinY: 0.04,    // ...once the hips have risen at least this much
    duckFire: 0.24,       // = vertBand * (1 - jumpRatio) (derived)
    duckRearm: 0.103,     // rise back above this ends the duck
    duckHoldMs: 100,      // squat must persist this long before a roll fires
    duckCancelMs: 150,    // a launch this soon after a roll converts it to a jump
    ankleJumpFire: 0.035, // both ankles up this much = feet off the ground → jump
    ankleRearm: 0.015,    // ankles back below this (plus hips) re-arms the jump
    launchRise: 0.08,     // hip rise from the recent dip bottom (at speed) → jump
    launchMinY: -0.03,    // ...but only once the hips are back near neutral
    launchWindowMs: 300,  // how far back to look for the dip bottom
    minVisibility: 0.5,   // required visibility of shoulders + hips
    calibFrames: 20,      // consecutive still frames required to calibrate (~0.7s)
    calibStillTol: 0.15,  // movement (in torso units) that restarts calibration
    adaptRate: 0.08,      // per-frame tracking of the box toward the player (~0.4s)
    aspect: 1,            // video width/height — makes x and y distances share units
};

// Derive the jump/squat thresholds from the band + ratio (keeps 25%/75%).
export function applyBand(opts, band = opts.vertBand, ratio = opts.jumpRatio) {
    opts.vertBand = band;
    opts.jumpRatio = ratio;
    opts.jumpFire = band * ratio;
    opts.duckFire = band * (1 - ratio);
    opts.jumpRearm = opts.jumpFire * 0.4;
    opts.duckRearm = opts.duckFire * 0.43;
    return opts;
}

function median(values) {
    const s = [...values].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function bodyCore(landmarks, minVisibility, aspect = 1) {
    const pts = [landmarks[L_SHOULDER], landmarks[R_SHOULDER], landmarks[L_HIP], landmarks[R_HIP]];
    if (pts.some(p => !p)) return null;
    if (pts.some(p => p.visibility !== undefined && p.visibility < minVisibility)) return null;
    const shoulder = mid(landmarks[L_SHOULDER], landmarks[R_SHOULDER]);
    const hip = mid(landmarks[L_HIP], landmarks[R_HIP]);
    // Normalized x spans the video width and y its height, so scale x by the
    // aspect ratio to measure real proportions regardless of camera format.
    const torso = Math.hypot((shoulder.x - hip.x) * aspect, shoulder.y - hip.y);
    if (torso < 1e-6) return null;
    // Ankles are optional (feet may be out of frame): null when not visible.
    const la = landmarks[L_ANKLE], ra = landmarks[R_ANKLE];
    const vis = p => p && (p.visibility === undefined || p.visibility >= minVisibility);
    const ankleY = vis(la) && vis(ra) ? (la.y + ra.y) / 2 : null;
    return { shoulder, hip, torso, ankleY };
}

export class GestureInterpreter {
    constructor(options = {}) {
        this.opts = { ...DEFAULTS, ...options };
        this.calibrated = false;
        this.calib = null;          // {hipX, hipY, torso}
        this._calibSamples = null;  // collecting when non-null
        this.zone = 0;              // -1 left, 0 center, +1 right
        this.lane = 1;
        this.jumpArmed = true;
        this.ducking = false;
        this._lastJumpAt = -Infinity;
        this._duckEndAt = -Infinity;
        this._duckStartAt = -Infinity;
        this._belowDuckSince = -1;  // when the hips first dropped below duckFire
        this._lastAt = 0;           // for hip vertical velocity
        this._lastOffsetY = 0;
        this._hist = [];            // recent {t, y} for launch-from-dip detection
        // Live values for the debug UI (normalized by torso length).
        this.debug = {
            tracking: false, offsetX: 0, offsetY: 0,
            zone: 0, lane: 1, ducking: false, calibrating: false,
            calibProgress: 0,
        };
    }

    // Begin collecting frames for a neutral-pose calibration.
    startCalibration() {
        this._calibSamples = [];
        this.debug.calibrating = true;
    }

    // Feed one frame of landmarks. Returns an array of events (possibly empty).
    update(landmarks, nowMs) {
        const events = [];
        const core = landmarks ? bodyCore(landmarks, this.opts.minVisibility, this.opts.aspect) : null;
        this.debug.tracking = !!core;
        if (!core) return events;

        if (this._calibSamples) {
            // Stillness gate: calibration only completes after `calibFrames`
            // consecutive frames without movement, so frames polluted by the
            // player settling into place (post-click sway, arm coming down)
            // never bias the neutral pose. Movement restarts the window.
            const sample = { hipX: core.hip.x, hipY: core.hip.y, torso: core.torso, ankleY: core.ankleY };
            if (this._calibSamples.length > 0) {
                const medT = median(this._calibSamples.map(v => v.torso));
                const tol = this.opts.calibStillTol * medT;
                if (Math.abs(sample.hipX - median(this._calibSamples.map(v => v.hipX))) * this.opts.aspect > tol ||
                    Math.abs(sample.hipY - median(this._calibSamples.map(v => v.hipY))) > tol ||
                    Math.abs(sample.torso - medT) > tol) {
                    this._calibSamples = [];
                }
            }
            this._calibSamples.push(sample);
            this.debug.calibProgress = this._calibSamples.length / this.opts.calibFrames;
            if (this._calibSamples.length >= this.opts.calibFrames) {
                // Median, not mean: robust against single-frame tracking blips.
                const med = key => median(this._calibSamples.map(v => v[key]));
                // Ankle reference only if the feet were visible most of the time.
                const ankles = this._calibSamples.map(v => v.ankleY).filter(v => v !== null);
                const ankleY = ankles.length * 2 >= this._calibSamples.length ? median(ankles) : null;
                this.calib = { hipX: med("hipX"), hipY: med("hipY"), torso: med("torso"), ankleY };
                this._calibSamples = null;
                this.calibrated = true;
                this.debug.calibrating = false;
                // Reset dynamic state to a clean center.
                this.zone = 0;
                this.lane = 1;
                this.jumpArmed = true;
                this.ducking = false;
                this._belowDuckSince = -1;
                this._lastAt = nowMs;
                this._lastOffsetY = 0;
                this._hist = [];
                events.push({ type: "calibrated" });
            }
            return events;
        }
        if (!this.calibrated) return events;

        // Positive offsetX = player stepped to their right (camera x decreases).
        const offsetX = (this.calib.hipX - core.hip.x) * this.opts.aspect / this.calib.torso;
        // Positive offsetY = hips above neutral (jump); negative = below (squat).
        const offsetY = (this.calib.hipY - core.hip.y) / this.calib.torso;
        this.debug.offsetX = offsetX;
        this.debug.offsetY = offsetY;

        // --- Slow baseline adaptation ---
        // While the player stands near neutral, the reference pose glides
        // toward what the camera actually sees (~1.5s time constant). This
        // absorbs leftover calibration bias and slow drift (shuffling
        // sideways, stepping closer/farther, camera settling). Gestures are
        // fast and cross the gates below, so they never get absorbed.
        const k = this.opts.adaptRate;
        const vGate = this.opts.jumpFire * 0.5;
        if (Math.abs(offsetY) < vGate) {
            this.calib.hipY += (core.hip.y - this.calib.hipY) * k;
            this.calib.torso += (core.torso - this.calib.torso) * k;
            if (this.calib.ankleY !== null && core.ankleY !== null) {
                this.calib.ankleY += (core.ankleY - this.calib.ankleY) * k;
            }
        }
        if (this.zone === 0 && Math.abs(offsetX) < this.opts.laneExit * 0.5) {
            this.calib.hipX += (core.hip.x - this.calib.hipX) * k;
        }

        // --- Lanes with hysteresis ---
        let zone = this.zone;
        if (zone === 0) {
            if (offsetX > this.opts.laneEnter) zone = 1;
            else if (offsetX < -this.opts.laneEnter) zone = -1;
        } else if (zone === 1) {
            if (offsetX < this.opts.laneExit) zone = offsetX < -this.opts.laneEnter ? -1 : 0;
        } else if (zone === -1) {
            if (offsetX > -this.opts.laneExit) zone = offsetX > this.opts.laneEnter ? 1 : 0;
        }
        if (zone !== this.zone) {
            const from = this.lane;
            this.zone = zone;
            this.lane = zone + 1;
            events.push({ type: "lane", from, to: this.lane });
        }

        const o = this.opts;

        // --- Hip vertical velocity (torso/s) + recent dip bottom ---
        const dt = (nowMs - this._lastAt) / 1000;
        const vy = dt > 0 && dt < 0.25 ? (offsetY - this._lastOffsetY) / dt : 0;
        this._lastAt = nowMs;
        this._lastOffsetY = offsetY;
        this._hist.push({ t: nowMs, y: offsetY });
        while (this._hist.length && nowMs - this._hist[0].t > o.launchWindowMs) this._hist.shift();
        let dipMin = offsetY;
        for (const h of this._hist) if (h.y < dipMin) dipMin = h.y;

        // --- Feet off the ground (ankles), when the feet are in frame ---
        // The earliest and cleanest jump signal: ankles only rise when you
        // actually leave the floor — never when standing up from a squat.
        const ankleRise = (this.calib.ankleY !== null && core.ankleY !== null)
            ? (this.calib.ankleY - core.ankleY) / this.calib.torso
            : null;
        this.debug.ankleRise = ankleRise;

        // --- Jump triggers (any one is enough) ---
        // 1. plain displacement: hips above jumpFire
        // 2. feet off the ground: both ankles up ankleJumpFire
        // 3. fast rise past jumpVelMinY (suppressed right after a squat —
        //    standing back up is a fast rise too)
        // 4. launch from the dip: rose launchRise from the recent bottom at
        //    speed and hips are back near neutral (natural jumps always dip
        //    first, so this fires before the hips even reach neutral)
        const afterSquat = nowMs - this._duckEndAt <= 350;
        const feetOff = ankleRise !== null && ankleRise > o.ankleJumpFire;
        const risingFast = !afterSquat && vy > o.jumpVelFire && offsetY > o.jumpVelMinY;
        const launched = !afterSquat && vy > o.jumpVelFire
            && (offsetY - dipMin) > o.launchRise && offsetY > o.launchMinY;
        const wantJump = feetOff || (!afterSquat && (offsetY > o.jumpFire || risingFast || launched));
        const canJump = this.jumpArmed && nowMs - this._lastJumpAt > o.jumpCooldownMs;

        const fireJump = () => {
            this.jumpArmed = false;
            this._lastJumpAt = nowMs;
            this._belowDuckSince = -1; // a dip that became a jump is not a squat
            events.push({ type: "jump" });
        };

        if (!this.ducking) {
            if (canJump && wantJump) {
                fireJump();
            } else if (!this.jumpArmed && offsetY < o.jumpRearm
                       && (ankleRise === null || ankleRise < o.ankleRearm)) {
                this.jumpArmed = true;
            }
        } else if (canJump && (feetOff || launched || risingFast)
                   && nowMs - this._duckStartAt < o.duckCancelMs) {
            // Duck→jump conversion: the "squat" was really a deep wind-up.
            this.ducking = false;
            this._duckEndAt = nowMs;
            events.push({ type: "duck_end" });
            fireJump();
        }

        // --- Duck: squat that HOLDS for duckHoldMs (a jump wind-up passes
        // through the bottom faster than that), with hysteresis to end ---
        if (!this.ducking) {
            if (offsetY < -o.duckFire) {
                if (this._belowDuckSince < 0) this._belowDuckSince = nowMs;
                if (nowMs - this._belowDuckSince >= o.duckHoldMs) {
                    this.ducking = true;
                    this._duckStartAt = nowMs;
                    this._belowDuckSince = -1;
                    events.push({ type: "duck" });
                }
            } else {
                this._belowDuckSince = -1;
            }
        } else if (offsetY > -o.duckRearm) {
            this.ducking = false;
            this._duckEndAt = nowMs;
            events.push({ type: "duck_end" });
        }

        this.debug.zone = this.zone;
        this.debug.lane = this.lane;
        this.debug.ducking = this.ducking;
        return events;
    }
}


// ===== Seated / hands mode (accessibility) =====
// Same command box, driven by the hands instead of the hips: the centroid is
// the midpoint of both wrists; both hands up = jump, both down = squat, the
// right hand reaching out right = right lane, the left hand out left = left
// lane, both hands back near their rest position = center. Distances are in
// SHOULDER WIDTHS (seated players' hips may be hidden), so bigger defaults.
export const HANDS_DEFAULTS = applyBand({
    ...DEFAULTS,
    laneEnter: 0.30,      // hand reach (shoulder widths) to enter a lane — a short reach
    laneExit: 0.20,
    adaptRate: 0.05,
}, 0.52, 0.25);           // jump at +0.13, squat at -0.39 shoulder widths

// Size unit: shoulder width when the pose model sees the shoulders; with the
// hand tracker (landmarks.palm = mean palm length, wrist→middle knuckle) the
// palm scaled to a typical shoulder width — so no upper body is required.
const PALM_TO_SHOULDER = 4.4;
function handsCore(landmarks, minVisibility, aspect = 1) {
    const vis = p => p && (p.visibility === undefined || p.visibility >= minVisibility);
    if (!vis(landmarks[L_WRIST]) || !vis(landmarks[R_WRIST])) return null;
    let scale;
    if (landmarks.palm > 1e-6) {
        scale = landmarks.palm * PALM_TO_SHOULDER;
    } else {
        if (!vis(landmarks[L_SHOULDER]) || !vis(landmarks[R_SHOULDER])) return null;
        scale = Math.abs(landmarks[L_SHOULDER].x - landmarks[R_SHOULDER].x) * aspect;
    }
    if (scale < 1e-6) return null;
    const lw = landmarks[L_WRIST], rw = landmarks[R_WRIST];
    return { cx: (lw.x + rw.x) / 2, cy: (lw.y + rw.y) / 2, lx: lw.x, rx: rw.x, scale };
}

export class HandsInterpreter {
    constructor(options = {}) {
        this.mode = "hands";
        this.opts = { ...HANDS_DEFAULTS, ...options };
        this.calibrated = false;
        // Same shape as the pose calib so the guide drawing can share code:
        // hipX/hipY = hands centroid, torso = shoulder width, lx/rx = wrist rests.
        this.calib = null;
        this._calibSamples = null;
        this.zone = 0;
        this.lane = 1;
        this.jumpArmed = true;
        this.ducking = false;
        this._lastJumpAt = -Infinity;
        this._belowDuckSince = -1;
        this.debug = {
            tracking: false, offsetX: 0, offsetY: 0,
            zone: 0, lane: 1, ducking: false, calibrating: false,
            calibProgress: 0, ankleRise: null,
        };
    }

    startCalibration() {
        this._calibSamples = [];
        this.debug.calibrating = true;
    }

    update(landmarks, nowMs) {
        const events = [];
        const o = this.opts;
        const core = landmarks ? handsCore(landmarks, o.minVisibility, o.aspect) : null;
        this.debug.tracking = !!core;
        if (!core) return events;

        if (this._calibSamples) {
            const sample = { cx: core.cx, cy: core.cy, lx: core.lx, rx: core.rx, scale: core.scale };
            if (this._calibSamples.length > 0) {
                const medS = median(this._calibSamples.map(v => v.scale));
                const tol = o.calibStillTol * medS;
                if (Math.abs(sample.cx - median(this._calibSamples.map(v => v.cx))) * o.aspect > tol ||
                    Math.abs(sample.cy - median(this._calibSamples.map(v => v.cy))) > tol) {
                    this._calibSamples = [];
                }
            }
            this._calibSamples.push(sample);
            this.debug.calibProgress = this._calibSamples.length / o.calibFrames;
            if (this._calibSamples.length >= o.calibFrames) {
                const med = key => median(this._calibSamples.map(v => v[key]));
                this.calib = { hipX: med("cx"), hipY: med("cy"), torso: med("scale"),
                               lx: med("lx"), rx: med("rx"), ankleY: null };
                this._calibSamples = null;
                this.calibrated = true;
                this.debug.calibrating = false;
                this.zone = 0; this.lane = 1;
                this.jumpArmed = true; this.ducking = false;
                this._belowDuckSince = -1;
                events.push({ type: "calibrated" });
            }
            return events;
        }
        if (!this.calibrated) return events;

        const c = this.calib;
        // Both hands up = positive. Right hand reaching to the player's right
        // (raw x decreases) = dR positive; left hand to their left = dL positive.
        const offsetY = (c.hipY - core.cy) / c.torso;
        const dR = (c.rx - core.rx) * o.aspect / c.torso;
        const dL = (core.lx - c.lx) * o.aspect / c.torso;
        this.debug.offsetY = offsetY;
        this.debug.offsetX = dR >= dL ? dR : -dL;

        // Slow re-centering while the hands rest near their calibrated spot.
        const k = o.adaptRate;
        const restX = Math.abs(dR) < o.laneExit * 0.5 && Math.abs(dL) < o.laneExit * 0.5;
        if (Math.abs(offsetY) < o.jumpFire * 0.5 && restX && this.zone === 0) {
            c.hipY += (core.cy - c.hipY) * k;
            c.hipX += (core.cx - c.hipX) * k;
            c.lx += (core.lx - c.lx) * k;
            c.rx += (core.rx - c.rx) * k;
            c.torso += (core.scale - c.torso) * k;
        }

        // --- Lanes: one hand reaching out, with hysteresis ---
        let zone = this.zone;
        if (zone === 0) {
            if (dR > o.laneEnter && dR >= dL) zone = 1;
            else if (dL > o.laneEnter) zone = -1;
        } else if (zone === 1) {
            if (dR < o.laneExit) zone = dL > o.laneEnter ? -1 : 0;
        } else if (zone === -1) {
            if (dL < o.laneExit) zone = dR > o.laneEnter ? 1 : 0;
        }
        if (zone !== this.zone) {
            const from = this.lane;
            this.zone = zone;
            this.lane = zone + 1;
            events.push({ type: "lane", from, to: this.lane });
        }

        // --- Jump: both hands up (edge-triggered, rearm + cooldown) ---
        if (!this.ducking) {
            if (this.jumpArmed && offsetY > o.jumpFire && nowMs - this._lastJumpAt > o.jumpCooldownMs) {
                this.jumpArmed = false;
                this._lastJumpAt = nowMs;
                this._belowDuckSince = -1;
                events.push({ type: "jump" });
            } else if (!this.jumpArmed && offsetY < o.jumpRearm) {
                this.jumpArmed = true;
            }
        }

        // --- Squat: both hands down, held briefly ---
        if (!this.ducking) {
            if (offsetY < -o.duckFire) {
                if (this._belowDuckSince < 0) this._belowDuckSince = nowMs;
                if (nowMs - this._belowDuckSince >= o.duckHoldMs) {
                    this.ducking = true;
                    this._belowDuckSince = -1;
                    events.push({ type: "duck" });
                }
            } else {
                this._belowDuckSince = -1;
            }
        } else if (offsetY > -o.duckRearm) {
            this.ducking = false;
            events.push({ type: "duck_end" });
        }

        this.debug.zone = this.zone;
        this.debug.lane = this.lane;
        this.debug.ducking = this.ducking;
        return events;
    }
}
