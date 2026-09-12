// CV control layer for the three.js Subway Surfers.
// Webcam PiP panel + pose calibration + gesture→key bridge + arm mimicry.
// Loaded dynamically from App.vue after the Game singleton exists.
// @ts-ignore — plain JS module
import {PoseEngine} from './pose.js';
// @ts-ignore — plain JS module
import {GestureInterpreter} from './gestures.js';
import {ArmMimic} from './mimic';
import Player from '@/Game/player';
import Game from '@/Game';
import {roadLength} from '@/Game/environment';
import {LOW_POWER} from '@/Game/perf';

const KEY_LABELS: Record<string, string> = {a: '←', d: '→', w: '↑', s: '↓', p: 'P', r: 'R'};

function pressKey(key: string) {
    window.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
    flashKey(key);
    console.log('[CV] key', key);
}

// ---------- Panel UI ----------
const style = document.createElement('style');
style.textContent = `
#cv-panel {
    position: fixed; right: 0; top: 0; z-index: 9999;
    width: 50vw; height: 100vh; background: #111418;
    display: flex; flex-direction: column; overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif; color: #e8eaed;
}
#cv-stage {
    flex: 1; min-height: 0; position: relative; background: #000;
    overflow: hidden;
}
#cv-fit {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, -50%) scaleX(-1);
}
#cv-video { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#cv-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
#cv-countdown {
    position: absolute; inset: 0; display: none; align-items: center;
    justify-content: center; font-size: 120px; font-weight: 800;
    color: #ffeb3b; text-shadow: 0 2px 10px rgba(0,0,0,.8);
    transform: scaleX(-1);
}
#cv-stats {
    position: absolute; top: 10px; left: 14px; z-index: 5;
    font-size: 13px; color: #c5cad1; background: rgba(0,0,0,.5);
    padding: 4px 10px; border-radius: 7px;
    font-variant-numeric: tabular-nums;
}
#cv-bar { display: flex; align-items: center; gap: 12px; padding: 14px 18px 6px; }
#cv-status { flex: 1; font-size: 15px; color: #9aa0a6; line-height: 1.35; }
#cv-key {
    min-width: 44px; text-align: center; font-size: 32px; font-weight: 800;
    color: #00e676; opacity: 0; transition: opacity .25s;
}
#cv-key.flash { opacity: 1; transition: none; }
.cv-btn {
    padding: 12px 20px; font-size: 16px; font-weight: 700; border: 0;
    border-radius: 10px; background: #7c4dff; color: #fff; cursor: pointer;
}
.cv-btn:disabled { background: #333; color: #777; }
#cv-restart { background: #ff5252; display: none; }
#cv-fullscreen {
    background: #2a2f36; padding: 12px 14px; font-size: 18px; line-height: 1;
}
#cv-mimic-row {
    display: flex; align-items: center; gap: 8px; padding: 0 18px 6px;
    font-size: 14px; color: #9aa0a6;
}
#cv-tuning { padding: 0 18px 14px; display: none; }
#cv-tuning.open { display: block; }
#cv-tuning label {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: #9aa0a6; margin-top: 6px;
}
#cv-tuning input[type=range] { flex: 1; accent-color: #7c4dff; }
#cv-tuning .val { width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
#cv-tuning-toggle {
    background: none; border: 0; color: #8ab4f8; font-size: 13px;
    cursor: pointer; padding: 0 18px 12px; text-align: left;
}
`;
document.head.appendChild(style);

const panel = document.createElement('div');
panel.id = 'cv-panel';
panel.innerHTML = `
    <div id="cv-stage">
        <div id="cv-fit">
            <video id="cv-video" autoplay playsinline muted></video>
            <canvas id="cv-overlay"></canvas>
            <div id="cv-countdown"></div>
        </div>
    </div>
    <div id="cv-stats"></div>
    <div id="cv-bar">
        <button id="cv-calibrate" class="cv-btn" disabled>Calibrate</button>
        <button id="cv-restart" class="cv-btn">Restart</button>
        <div id="cv-status">Loading…</div>
        <div id="cv-key"></div>
        <button id="cv-fullscreen" class="cv-btn" title="Fullscreen (F)">⛶</button>
    </div>
    <div id="cv-mimic-row">
        <input type="checkbox" id="cv-mimic" checked>
        <label for="cv-mimic">Character mimics your body</label>
    </div>
    <button id="cv-tuning-toggle">Sensitivity settings ▾</button>
    <div id="cv-tuning">
        <label>Step size
            <input type="range" id="cv-lane" min="0.15" max="0.60" step="0.01">
            <span class="val" id="cv-lane-val"></span>
        </label>
        <label>Jump
            <input type="range" id="cv-jump" min="0.06" max="0.30" step="0.01">
            <span class="val" id="cv-jump-val"></span>
        </label>
        <label>Squat
            <input type="range" id="cv-duck" min="0.10" max="0.40" step="0.01">
            <span class="val" id="cv-duck-val"></span>
        </label>
    </div>
`;
document.body.appendChild(panel);

const $ = (id: string) => document.getElementById(id)!;

// Size #cv-fit to COVER the stage (fill it completely, cropping the sides
// or top/bottom evenly) while keeping the camera's aspect ratio, so the
// skeleton overlay stays pixel-aligned with the video.
function layoutStage() {
    const stage = $('cv-stage');
    const fit = $('cv-fit');
    const videoEl = $('cv-video') as HTMLVideoElement;
    const vw = videoEl.videoWidth || 1280;
    const vh = videoEl.videoHeight || 720;
    const scale = Math.max(stage.clientWidth / vw, stage.clientHeight / vh);
    fit.style.width = `${Math.ceil(vw * scale)}px`;
    fit.style.height = `${Math.ceil(vh * scale)}px`;
}
window.addEventListener('resize', layoutStage);
$('cv-video').addEventListener('loadedmetadata', layoutStage);
layoutStage();

let keyFlashTimer: ReturnType<typeof setTimeout>;
function flashKey(key: string) {
    const el = $('cv-key');
    el.textContent = KEY_LABELS[key] || key;
    el.classList.add('flash');
    clearTimeout(keyFlashTimer);
    keyFlashTimer = setTimeout(() => el.classList.remove('flash'), 350);
}

function setStatus(text: string) {
    $('cv-status').textContent = text;
    console.log('[CV]', text);
}

// ---------- Game wiring ----------
const interpreter = new GestureInterpreter();
const mimic = new ArmMimic();
let latestLandmarks: any = null;
let landmarksAt = 0;
let lastCalibPct = -1;
let lastStatsAt = 0;
let gameStarted = false;
let gameEnded = false;

const CALIB_KEY = 'cv-calibration';
function saveCalibration() {
    try {
        localStorage.setItem(CALIB_KEY, JSON.stringify(
            {...interpreter.calib, aspect: interpreter.opts.aspect}
        ));
    } catch {}
}
function restoreCalibration(): boolean {
    try {
        const saved = JSON.parse(localStorage.getItem(CALIB_KEY) || 'null');
        // A calibration made with a different camera format is geometrically
        // wrong (its units don't match) — discard it instead of restoring.
        if (saved && saved.torso > 0
            && Math.abs((saved.aspect ?? 0) - interpreter.opts.aspect) < 0.01) {
            interpreter.calib = {
                hipX: saved.hipX, hipY: saved.hipY, torso: saved.torso,
                ankleY: saved.ankleY ?? null,
            };
            interpreter.calibrated = true;
            return true;
        }
    } catch {}
    return false;
}

function controlPlayer() {
    return (Player as any).instance?.controlPlayer;
}

function startRun() {
    if (gameStarted) return;
    // The game's 'start' event (fired synchronously by the key press)
    // updates gameStarted/gameEnded — no manual bookkeeping here.
    pressKey('p');
}

// One-button restart: after any restart ('r'), count down 3-2-1 on the feed
// while the player model reloads, then start the run automatically.
let countdownGen = 0;
async function restartCountdown() {
    const gen = ++countdownGen;
    const cd = $('cv-countdown');
    cd.style.display = 'flex';
    for (const n of [3, 2, 1]) {
        if (gen !== countdownGen || gameStarted) break;
        cd.textContent = String(n);
        await new Promise(r => setTimeout(r, 1000));
    }
    if (gen !== countdownGen) return; // superseded or cancelled
    cd.style.display = 'none';
    startRun();
}
function cancelCountdown() {
    countdownGen++;
    $('cv-countdown').style.display = 'none';
}

function handleEvents(events: any[]) {
    const ctl = controlPlayer();
    for (const ev of events) {
        if (ev.type === 'calibrated') {
            saveCalibration();
            if (gameEnded) {
                // Re-calibrated after a crash: restart (→ countdown → run).
                setStatus('Calibrated ✓ — restarting');
                pressKey('r');
            } else if (!gameStarted) {
                // First calibration: 3-2-1, then the run starts.
                setStatus('Calibrated ✓ — get ready!');
                restartCountdown();
            } else {
                setStatus('Re-calibrated ✓ — keep going!');
            }
        } else if (!gameStarted || gameEnded) {
            continue; // gestures only drive a live run
        } else if (ev.type === 'lane') {
            // Resync against the game's own lane so bounce-backs self-correct.
            const targetWay = ev.to + 1; // interpreter lane 0..2 → game way 1..3
            const currentWay = ctl?.way ?? 2;
            const steps = targetWay - currentWay;
            for (let i = 0; i < Math.abs(steps); i++) pressKey(steps > 0 ? 'd' : 'a');
        } else if (ev.type === 'jump') {
            pressKey('w');
        } else if (ev.type === 'duck') {
            pressKey('s');
        }
    }
}

// ---------- Audio (from the original prototype) ----------
const themeAudio = new Audio('/assets/audio/Theme.mp3');
themeAudio.loop = true;
themeAudio.volume = 0.45;
const crashAudio = new Audio('/assets/audio/Crash.mp3');
crashAudio.volume = 0.8;

function playCrash() {
    try {
        crashAudio.currentTime = 0;
        crashAudio.play().catch(() => {});
    } catch {}
}

// Autoplay policy can block playback until the page gets a user gesture;
// retry the theme on the next interaction if the run is live.
function resumeTheme() {
    if (gameStarted && !gameEnded && themeAudio.paused) {
        themeAudio.play().catch(() => {});
    }
}
window.addEventListener('pointerdown', resumeTheme);
window.addEventListener('keydown', resumeTheme);

// The ControlPlayer is recreated on every restart, so re-attach the
// collision listener whenever a new instance shows up.
const soundHooked = new WeakSet<object>();
function hookCollisionSound(ctl: any) {
    if (!ctl || soundHooked.has(ctl)) return;
    soundHooked.add(ctl);
    ctl.on('collision', playCrash);
}

// Game status: 'ready' | 'start' | 'end' events from the Game singleton.
// These are the single source of truth for the run state — the game can be
// started/restarted from the keyboard (p/r) too, not just our buttons.
const game = new (Game as any)();
game.on('gameStatus', (status: string) => {
    if (status === 'start') {
        gameStarted = true;
        gameEnded = false;
        cancelCountdown();
        themeAudio.currentTime = 0;
        themeAudio.play().catch(() => {});
        setStatus('GO! Step • jump • squat');
    } else if (status === 'end') {
        gameEnded = true;
        themeAudio.pause();
        playCrash();
        ($('cv-restart') as HTMLButtonElement).style.display = 'block';
        setStatus('You crashed! Press Restart');
    } else if (status === 'ready') {
        // Fresh run (r pressed): player model reloads, lanes reset to center,
        // and the run auto-starts after a 3-2-1 countdown.
        gameStarted = false;
        gameEnded = false;
        interpreter.zone = 0;
        interpreter.lane = 1;
        themeAudio.pause();
        ($('cv-restart') as HTMLButtonElement).style.display = 'none';
        setStatus('Get ready — stand centered!');
        restartCountdown();
    }
});

$('cv-restart').addEventListener('click', () => {
    // 'r' fires 'ready' synchronously; that handler runs the 3-2-1
    // countdown and starts the run — one button does everything.
    pressKey('r');
});

// ---------- Pose engine ----------
// Command box around the calibrated centroid: cross the left/right vertical
// lines to change lanes, lift the hips above the top line to jump, drop
// below the bottom line to squat. Follows the (slowly adapting) baseline.
function drawGuides(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (!interpreter.calibrated) return;
    const {calib, opts, debug} = interpreter as any;
    const aspect = opts.aspect || 1;
    const cx = calib.hipX * canvas.width;
    const cy = calib.hipY * canvas.height;
    // Thresholds are in torso units; convert back to normalized x/y.
    const xr = (calib.hipX - opts.laneEnter * calib.torso / aspect) * canvas.width;
    const xl = (calib.hipX + opts.laneEnter * calib.torso / aspect) * canvas.width;
    const yJump = (calib.hipY - opts.jumpFire * calib.torso) * canvas.height;
    const yDuck = (calib.hipY + opts.duckFire * calib.torso) * canvas.height;

    const line = (x1: number, y1: number, x2: number, y2: number, color: string, active: boolean) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = active ? 6 : 3;
        ctx.setLineDash(active ? [] : [12, 9]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    // Two vertical lane lines (light up while that step is held)...
    line(xl, 0, xl, canvas.height, 'rgba(124, 77, 255, 0.9)', debug.zone === -1);
    line(xr, 0, xr, canvas.height, 'rgba(124, 77, 255, 0.9)', debug.zone === 1);
    // ...and two horizontal lines: jump above, squat below.
    line(0, yJump, canvas.width, yJump, 'rgba(255, 235, 59, 0.9)', debug.offsetY > opts.jumpFire);
    line(0, yDuck, canvas.width, yDuck, 'rgba(255, 152, 0, 0.9)', debug.ducking);
    ctx.setLineDash([]);

    // Crosshair on the calibrated centroid.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16); ctx.stroke();

    // Labels: the canvas is displayed mirrored, so draw text pre-flipped.
    const label = (text: string, x: number, y: number, color: string) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.font = '700 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.fillText(text, 0, 0);
        ctx.restore();
    };
    label('JUMP', cx, yJump - 12, 'rgba(255, 235, 59, 0.95)');
    label('SQUAT', cx, yDuck + 30, 'rgba(255, 152, 0, 0.95)');
    label('STEP', xl, 34, 'rgba(179, 157, 255, 0.95)');
    label('STEP', xr, 34, 'rgba(179, 157, 255, 0.95)');
}

const engine = new PoseEngine({
    video: $('cv-video') as HTMLVideoElement,
    canvas: $('cv-overlay') as HTMLCanvasElement,
    onStatus: setStatus,
    onDraw: drawGuides,
    lowPower: LOW_POWER,
    onResults: (landmarks: any) => {
        latestLandmarks = landmarks;
        landmarksAt = performance.now();
        handleEvents(interpreter.update(landmarks, performance.now()));
        if (landmarksAt - lastStatsAt > 500) {
            lastStatsAt = landmarksAt;
            $('cv-stats').textContent =
                `pose ${engine.fps} fps · ${Math.round(engine.inferMs)} ms`
                + (LOW_POWER ? ' · low-power' : '');
        }
        if (interpreter.debug.calibrating) {
            const pct = Math.min(99, Math.round(interpreter.debug.calibProgress * 100));
            if (pct !== lastCalibPct) {
                lastCalibPct = pct;
                $('cv-status').textContent = `Hold still — calibrating… ${pct}%`;
            }
        } else if (interpreter.calibrated && gameStarted && !gameEnded && !interpreter.debug.tracking) {
            setStatus("Can't see you — step back into frame");
        }
    },
});

// Pre-game the character turns around to face the camera (mirror mode);
// once the run starts it faces down the track again. The flip is tracked
// per model object because the player model is recreated on restart.
const flippedModels = new WeakSet<object>();
function updateFacing(model: any, ctl: any) {
    const preGame = !ctl?.gameStart;
    if (preGame && !flippedModels.has(model)) {
        model.rotateY(Math.PI);
        flippedModels.add(model);
    } else if (!preGame && flippedModels.has(model)) {
        model.rotateY(Math.PI);
        flippedModels.delete(model);
    }
}

// Per-frame hook called by Player.update right after mixer.update.
(window as any).__cvAfterMixer = (model: any) => {
    const ctl = controlPlayer();
    updateFacing(model, ctl);
    hookCollisionSound(ctl);
    const fresh = performance.now() - landmarksAt < 500;
    const status = ctl?.status ?? 'dance';
    mimic.apply(model, fresh ? latestLandmarks : null, status);
};

$('cv-mimic').addEventListener('change', e => {
    mimic.enabled = (e.target as HTMLInputElement).checked;
});

// ---------- Fullscreen ----------
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    } else {
        document.documentElement.requestFullscreen().catch(() => {});
    }
}
$('cv-fullscreen').addEventListener('click', toggleFullscreen);
window.addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});
document.addEventListener('fullscreenchange', () => {
    $('cv-fullscreen').title = document.fullscreenElement
        ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
    layoutStage(); // the stage size changes with the viewport
});

// ---------- Sensitivity tuning (persisted) ----------
// v3: bumped when the default thresholds change so stale saved tuning
// (based on the old, wider box) doesn't override the tighter defaults.
const TUNING_KEY = 'cv-tuning-v3';
const SLIDERS: Array<{id: string; opt: string}> = [
    {id: 'cv-lane', opt: 'laneEnter'},
    {id: 'cv-jump', opt: 'jumpFire'},
    {id: 'cv-duck', opt: 'duckFire'},
];

function applyTuning(opts: Record<string, number>) {
    Object.assign(interpreter.opts, opts);
    // Hysteresis and rearm thresholds scale with their trigger thresholds.
    interpreter.opts.laneExit = interpreter.opts.laneEnter * 0.66;
    interpreter.opts.jumpRearm = interpreter.opts.jumpFire * 0.4;
    interpreter.opts.duckRearm = interpreter.opts.duckFire * 0.43;
}

function loadTuning(): Record<string, number> {
    try {
        const saved = JSON.parse(localStorage.getItem(TUNING_KEY) || '{}');
        return typeof saved === 'object' && saved ? saved : {};
    } catch { return {}; }
}

applyTuning(loadTuning());
for (const {id, opt} of SLIDERS) {
    const input = $(id) as HTMLInputElement;
    const valEl = $(id + '-val');
    input.value = String(interpreter.opts[opt]);
    valEl.textContent = Number(interpreter.opts[opt]).toFixed(2);
    input.addEventListener('input', () => {
        const tuning = loadTuning();
        tuning[opt] = Number(input.value);
        applyTuning(tuning);
        valEl.textContent = Number(input.value).toFixed(2);
        try { localStorage.setItem(TUNING_KEY, JSON.stringify(tuning)); } catch {}
    });
}

$('cv-tuning-toggle').addEventListener('click', () => {
    const open = $('cv-tuning').classList.toggle('open');
    $('cv-tuning-toggle').textContent = open ? 'Sensitivity settings ▴' : 'Sensitivity settings ▾';
});

// Calibrate: sample immediately (the stillness gate waits for the player to
// settle, so no pre-countdown is needed). The 3-2-1 comes AFTER calibration,
// as the run-start countdown — see the 'calibrated' handling above.
$('cv-calibrate').addEventListener('click', () => {
    const btn = $('cv-calibrate') as HTMLButtonElement;
    cancelCountdown(); // don't let a pending restart countdown start the run mid-calibration
    lastCalibPct = -1;
    interpreter.startCalibration();
    setStatus('Hold still — calibrating…');
    btn.textContent = 'Re-calibrate';
});

// Test seam for automated checks.
(window as any).__cvtest = {
    interpreter,
    engine,
    mimic,
    audio: {theme: themeAudio, crash: crashAudio},
    roadLength,
    control: () => controlPlayer(),
    inject(landmarks: any, t = performance.now()) {
        const evs = interpreter.update(landmarks, t);
        handleEvents(evs);
        return evs;
    },
    applyMimic(landmarks: any, status = 'run') {
        const model = (Player as any).instance?.playerScene;
        if (!model) return null;
        mimic.apply(model, landmarks, status);
        const bone = model.getObjectByName('mixamorigLeftArm');
        return bone ? bone.quaternion.toArray() : null;
    },
};

(async () => {
    try {
        await engine.init();
        const v = $('cv-video') as HTMLVideoElement;
        interpreter.opts.aspect = (v.videoWidth / v.videoHeight) || 1;
        engine.start();
        ($('cv-calibrate') as HTMLButtonElement).disabled = false;
        if (restoreCalibration()) {
            $('cv-calibrate').textContent = 'Re-calibrate';
            setStatus('Calibration remembered — press Re-calibrate to start');
        } else {
            setStatus('Stand centered, then Calibrate');
        }
    } catch (err: any) {
        setStatus('Camera error: ' + err.message + ' — keyboard still works (P to start)');
        console.error('[CV] init failed', err);
    }
})();
