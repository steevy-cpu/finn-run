// CV control layer for the three.js Subway Surfers.
// Webcam PiP panel + pose calibration + gesture→key bridge + arm mimicry.
// Loaded dynamically from App.vue after the Game singleton exists.
// @ts-ignore — plain JS module
import {PoseEngine} from './pose.js';
// @ts-ignore — plain JS module
import {GestureInterpreter, HandsInterpreter, applyBand} from './gestures.js';
import {ArmMimic} from './mimic';
import Player from '@/Game/player';
import Game from '@/Game';
import {roadLength} from '@/Game/environment';
import {LOW_POWER} from '@/Game/perf';
import {PURSUER, CATCH_VIDEO} from '@/Game/envart';
// @ts-ignore — plain JS module (tonight's presentation pack, unmodified)
import {createFinnIntro} from './FinnIntro.mjs';

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
    left: var(--split, 50vw); width: auto; height: 100vh; background: #111418;
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
.cv-btn-secondary { background: #2a2f36; }
#cv-stop { background: #ff5252; }
#cv-guide {
    position: absolute; left: 50%; top: 48px; transform: translateX(-50%);
    z-index: 6; display: none; align-items: center; gap: 12px;
    padding: 10px 18px 10px 14px; border-radius: 12px;
    background: rgba(17, 20, 24, 0.88); border-left: 4px solid #ff5252;
    color: #fff; font-size: 17px; font-weight: 700; line-height: 1.25;
    box-shadow: 0 6px 24px rgba(0,0,0,.45); pointer-events: none;
    white-space: nowrap; backdrop-filter: blur(6px);
}
#cv-guide.on { display: flex; }
#cv-guide .ico { font-size: 22px; }
#cv-guide small { display: block; font-size: 12.5px; font-weight: 500; color: #c5cad1; margin-top: 2px; }
#cv-confetti {
    position: fixed; left: 0; top: 0; width: var(--split, 50vw); height: 100vh;
    z-index: 1600; pointer-events: none;
}
.cv-modal {
    position: fixed; left: 0; top: 0; width: var(--split, 50vw); height: 100vh; z-index: 1500;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    font-family: system-ui, -apple-system, sans-serif; color: #e8eaed;
}
.cv-modal[hidden] { display: none; }
.cv-card {
    width: min(420px, 80%); background: #111418; border-radius: 18px;
    padding: 26px 28px; box-shadow: 0 16px 50px rgba(0,0,0,.6);
}
.cv-card h2 { margin: 0 0 6px; font-size: 26px; }
.cv-card p { margin: 0 0 14px; color: #9aa0a6; font-size: 15px; }
.cv-card input {
    width: 100%; box-sizing: border-box; font-size: 22px; padding: 12px 14px;
    border-radius: 10px; border: 2px solid #3a3f47; background: #1b1f25;
    color: #fff; outline: none;
}
.cv-card input:focus { border-color: #7c4dff; }
.cv-card-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
#cv-board-list { list-style: none; padding: 0; margin: 6px 0 10px; }
#cv-board-list li {
    display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    border-radius: 10px; background: #1b1f25; margin-bottom: 8px; font-size: 18px;
}
#cv-board-list li .medal { font-size: 24px; width: 32px; text-align: center; }
#cv-board-list li .name { flex: 1; font-weight: 700; }
#cv-board-list li .score { font-variant-numeric: tabular-nums; }
#cv-board-list li.you { outline: 2px solid #7c4dff; }
#cv-board-you { font-size: 16px; color: #e8eaed; }
.cv-check { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 14px; color: #c5cad1; cursor: pointer; }
.cv-check input { width: 18px; height: 18px; accent-color: #7c4dff; }
#cv-fullscreen {
    background: #2a2f36; padding: 12px 14px; font-size: 18px; line-height: 1;
}
#cv-cam-retry[hidden] { display: none; }
/* Always-visible Top 3 in the game pane's top-left corner. */
#cv-top3 {
    position: fixed; left: 14px; top: 14px; z-index: 1000; pointer-events: none;
    min-width: 168px; padding: 8px 12px 9px; border-radius: 12px;
    background: rgba(17, 20, 24, 0.82); color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.35);
    font-family: system-ui, -apple-system, sans-serif;
}
#cv-top3 .t3-title { font-size: 11px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: #9aa0a6; margin-bottom: 4px; }
#cv-top3 ol { list-style: none; margin: 0; padding: 0; }
#cv-top3 li { display: flex; align-items: baseline; gap: 8px; font-size: 14px; line-height: 1.5; font-variant-numeric: tabular-nums; }
#cv-top3 li .m { width: 18px; text-align: center; }
#cv-top3 li .n { flex: 1; font-weight: 700; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#cv-top3 li .s { font-weight: 600; }
#cv-top3 li.empty { color: #9aa0a6; font-size: 12.5px; }
html[data-intro="on"] #cv-top3 { visibility: hidden; }
html[data-ui="phase4"] #cv-top3 { background: rgba(7, 21, 33, .86); border: 1px solid #304a59; border-radius: 14px; }
html[data-ui="phase4"] #cv-top3 .t3-title { color: #b2c4ce; font-weight: 800; letter-spacing: .14em; font-size: 10.5px; }
html[data-ui="phase4"] #cv-top3 li .s { color: #ffd45a; }
#cv-tuning select { flex: 1; min-width: 0; font: inherit; padding: 4px 6px; border-radius: 6px; border: 1px solid #3a3f47; background: #1b1f25; color: #e8eaed; }
.cv-note { display: block; font-size: 12px; color: #9aa0a6; margin-top: 4px; line-height: 1.35; }
.cv-btn-small { padding: 8px 14px; font-size: 14px; margin-top: 4px; }
#cv-board-reset.arm, #cv-board-reset2.arm { background: #ff5252; color: #fff; }
/* Drag handle between the game pane and the camera panel (sets --split). */
#cv-splitter {
    position: fixed; top: 0; height: 100vh; width: 12px; z-index: 1700;
    left: calc(var(--split, 50vw) - 6px); cursor: col-resize; touch-action: none;
    background: transparent;
}
#cv-splitter::before {
    content: ""; position: absolute; left: 4px; top: 0; bottom: 0; width: 4px;
    background: rgba(255,255,255,.18); border-radius: 2px; transition: background .12s;
}
#cv-splitter:hover::before, #cv-splitter.drag::before, #cv-splitter:focus-visible::before { background: #45cfff; }
#cv-splitter:focus-visible { outline: none; }
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
/* Phase 4-only elements (brand strip, control-mode switch, section titles):
   revealed by assets/phase4.css under <html data-ui="phase4">. */
.p4 { display: none; }
/* Catch cinematic overlay (opt-in ?catchVideo=1 with ?arturo=1): a DOM
   video over the GAME pane only; navy letterbox; camera panel untouched. */
#cv-catch {
    position: fixed; left: 0; top: 0; width: var(--split, 50vw); height: 100vh; z-index: 1400;
    background: #071521; display: none; align-items: center; justify-content: center;
}
#cv-catch.on { display: flex; }
/* Fill the game pane exactly like the game does (the pane is ~4:5, the clip
   16:9): cover, anchored so both faces and the shoulder contact (x≈0.33 /
   0.53 / 0.62 of the clip) stay inside the crop. */
#cv-catch video { width: 100%; height: 100%; object-fit: cover; object-position: 48% 50%; background: #071521; display: block; }
#cv-catch-skip {
    position: absolute; right: 18px; bottom: 18px; z-index: 2;
    padding: 12px 22px; font: 800 16px/1 system-ui, -apple-system, sans-serif;
    border-radius: 10px; border: 2px solid #45cfff; background: rgba(7, 21, 33, .88);
    color: #f5f5ec; cursor: pointer;
}
#cv-catch-skip:hover { background: #45cfff; color: #071521; }
#cv-catch-skip:focus-visible { outline: 3px solid #45cfff; outline-offset: 3px; }
`;
document.head.appendChild(style);

const panel = document.createElement('div');
panel.id = 'cv-panel';
panel.innerHTML = `
    <div id="cv-head" class="p4">
        <div id="cv-brand">
            <span id="cv-brand-title">FINN RUN</span>
            <span id="cv-brand-tag">Your moves. Finn runs.</span>
        </div>
        <div id="cv-modes" role="group" aria-label="Control mode">
            <button id="cv-mode-pose" class="cv-seg" type="button" aria-pressed="true">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.5" r="2.5"/><path d="M12 8v6m0 0-3.5 7M12 14l3.5 7M6 11l6-2 6 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Body Control
            </button>
            <button id="cv-mode-hands" class="cv-seg" type="button" aria-pressed="false">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11m0-7a1.5 1.5 0 0 1 3 0v7m0-5a1.5 1.5 0 0 1 3 0v7m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-5-2.7L4 13.5a1.6 1.6 0 0 1 2.6-1.8L7 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Hand Control
            </button>
        </div>
    </div>
    <div id="cv-stage">
        <div id="cv-fit">
            <video id="cv-video" autoplay playsinline muted></video>
            <canvas id="cv-overlay"></canvas>
            <div id="cv-countdown" class="frp-countdown-value"></div>
        </div>
        <div id="cv-stats"></div>
        <div id="cv-guide"></div>
    </div>
    <div id="cv-bar">
        <button id="cv-newgame" class="cv-btn" disabled>New Game</button>
        <button id="cv-stop" class="cv-btn" title="End the run and reveal the Top 3">Stop</button>
        <button id="cv-calibrate" class="cv-btn cv-btn-secondary" disabled>Calibrate</button>
        <button id="cv-cam-retry" class="cv-btn cv-btn-secondary" hidden>Retry camera</button>
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
        <div class="cv-sec p4">Control &amp; sensitivity</div>
        <label>Step size
            <input type="range" id="cv-lane" min="0.15" max="0.60" step="0.01">
            <span class="val" id="cv-lane-val"></span>
        </label>
        <label>Jump / squat band
            <input type="range" id="cv-band" min="0.16" max="0.60" step="0.02">
            <span class="val" id="cv-band-val"></span>
        </label>
        <div class="cv-sec p4">Effects</div>
        <label class="cv-check"><input type="checkbox" id="cv-fx" checked> Effects (coin sparkle, jump &amp; landing dust)</label>
        <label class="cv-check"><input type="checkbox" id="cv-fx-reduced"> Reduced effects (quieter ring, no dust)</label>
        <div class="cv-sec p4">Camera</div>
        <label>Device
            <select id="cv-cam-device"></select>
        </label>
        <label>Resolution / fps
            <select id="cv-cam-res">
                <option value="1280x720@60">1280×720 @ 60 (recommended)</option>
                <option value="1280x720@30">1280×720 @ 30</option>
                <option value="1920x1080@30">1920×1080 @ 30</option>
                <option value="640x360@30">640×360 @ 30 (low power)</option>
            </select>
        </label>
        <label class="cv-check"><input type="checkbox" id="cv-cam-lock"> Lock exposure (stops auto-exposure swings outdoors)</label>
        <div id="cv-cam-info" class="cv-note"></div>
        <div class="cv-sec p4">Booth</div>
        <button id="cv-board-reset" class="cv-btn cv-btn-secondary cv-btn-small" type="button">Reset leaderboard</button>
        <span id="cv-board-reset-note" class="cv-note"></span>
    </div>
`;
document.body.appendChild(panel);

// Overlays on the GAME pane (left half): nickname prompt + leaderboard.
const gameOverlays = document.createElement('div');
gameOverlays.innerHTML = `
    <div id="cv-name" class="cv-modal" hidden role="dialog" aria-modal="true" aria-labelledby="cv-name-title">
        <div class="cv-card">
            <div class="cv-eyebrow p4">Finn Run</div>
            <h2 id="cv-name-title">New Game</h2>
            <p>Enter your nickname for the leaderboard</p>
            <input id="cv-name-input" maxlength="16" placeholder="Nickname" autocomplete="off" spellcheck="false">
            <label class="cv-check"><input type="checkbox" id="cv-name-hands"> Seated / hands mode (wheelchair-friendly): both hands steer</label>
            <div class="cv-card-actions">
                <button id="cv-name-cancel" class="cv-btn cv-btn-secondary">Cancel</button>
                <button id="cv-name-start" class="cv-btn">Start</button>
            </div>
        </div>
    </div>
    <div id="cv-top3" aria-live="polite" aria-label="Top 3 players"><div class="t3-title">Top 3</div><ol id="cv-top3-list"></ol></div>
    <div id="cv-catch" aria-hidden="true">
        <video id="cv-catch-video" muted playsinline preload="none" aria-label="Arturo catches Finn"></video>
        <button id="cv-catch-skip" type="button">Skip ▸</button>
    </div>
    <div id="cv-board" class="cv-modal" hidden role="dialog" aria-modal="true" aria-labelledby="cv-board-title">
        <div class="cv-card">
            <div class="cv-eyebrow p4">Finn Run</div>
            <h2 id="cv-board-title" class="frp-results-heading">Top 3</h2>
            <ol id="cv-board-list"></ol>
            <p id="cv-board-you"></p>
            <div class="cv-card-actions">
                <button id="cv-board-reset2" class="cv-btn cv-btn-secondary cv-btn-small" type="button" title="Clear every saved score">Reset</button>
                <button id="cv-board-close" class="cv-btn cv-btn-secondary">Close</button>
                <button id="cv-board-newgame" class="cv-btn">New Game</button>
            </div>
        </div>
    </div>
`;
document.body.appendChild(gameOverlays);

const $ = (id: string) => document.getElementById(id)!;

// Control mode: 'pose' (standing, hips) or 'hands' (seated / wheelchair:
// both hands are the centroid). Remembered across sessions.
type Mode = 'pose' | 'hands';
const MODE_KEY = 'cv-mode';
let mode: Mode = 'pose';
try { if (localStorage.getItem(MODE_KEY) === 'hands') mode = 'hands'; } catch {}

// Size #cv-fit to the stage while keeping the camera's aspect ratio, so the
// skeleton overlay stays pixel-aligned with the video.
function layoutStage() {
    const stage = $('cv-stage');
    const fitEl = $('cv-fit');
    const videoEl = $('cv-video') as HTMLVideoElement;
    const vw = videoEl.videoWidth || 1280;
    const vh = videoEl.videoHeight || 720;
    // Standing: fill the pane (sides cropped). Seated: show the WHOLE frame
    // (letterboxed) — the hand STEP lines sit out wide and must stay visible.
    const fit = mode === 'hands' ? Math.min : Math.max;
    const scale = fit(stage.clientWidth / vw, stage.clientHeight / vh);
    fitEl.style.width = `${Math.ceil(vw * scale)}px`;
    fitEl.style.height = `${Math.ceil(vh * scale)}px`;
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
let interpreter: any = mode === 'hands' ? new HandsInterpreter() : new GestureInterpreter();
const mimic = new ArmMimic();
let latestLandmarks: any = null;
let landmarksAt = 0;
let lastCalibPct = -1;
let lastStatsAt = 0;
let gameStarted = false;
let gameEnded = false;

const CALIB_KEY = 'cv-calibration';
const calibKey = () => `${CALIB_KEY}-${mode}`;
function saveCalibration() {
    try {
        localStorage.setItem(calibKey(), JSON.stringify(
            {...interpreter.calib, aspect: interpreter.opts.aspect}
        ));
    } catch {}
}
function restoreCalibration(): boolean {
    try {
        const saved = JSON.parse(localStorage.getItem(calibKey()) || 'null');
        // A calibration made with a different camera format is geometrically
        // wrong (its units don't match) — discard it instead of restoring.
        if (saved && saved.torso > 0
            && Math.abs((saved.aspect ?? 0) - interpreter.opts.aspect) < 0.01) {
            interpreter.calib = {
                hipX: saved.hipX, hipY: saved.hipY, torso: saved.torso,
                ankleY: saved.ankleY ?? null,
                ...(mode === 'hands' ? {lx: saved.lx, rx: saved.rx} : {}),
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

// ---------- New Game / Stop / leaderboard ----------
const NAME_KEY = 'cv-player';
const BOARD_KEY = 'cv-leaderboard';
let pendingGame = false;      // New Game pressed, waiting on calibration/countdown
let stoppedByUser = false;    // Stop button (no crash sound, no death)
let lastData = {score: 0, coin: 0};
let playerName = '';
try { playerName = localStorage.getItem(NAME_KEY) || ''; } catch {}

type Entry = {name: string; score: number; coins: number; at: number};
function loadBoard(): Entry[] {
    try {
        const v = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch { return []; }
}
function saveBoard(entries: Entry[]) {
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(entries)); } catch {}
    renderTop3();
}
// Corner widget: the same Top 3 the results card shows, always on screen.
function renderTop3() {
    const list = document.getElementById('cv-top3-list');
    if (!list) return;
    const top = loadBoard().slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = top.length
        ? top.map((e, i) => `<li><span class="m">${medals[i]}</span><span class="n">${escapeHtml(e.name)}</span><span class="s">${e.score.toLocaleString()}</span></li>`).join('')
        : '<li class="empty">No runs yet</li>';
}
// Records a finished run. One entry per player (best score wins), so two
// people playing many rounds still show as two rows. Returns the player's
// 1-based rank and whether this run is a new personal best.
function recordRun(name: string, score: number, coins: number): {rank: number; best: number; isBest: boolean} {
    const entries = loadBoard();
    const key = name.trim().toLowerCase();
    const idx = entries.findIndex(e => e.name.trim().toLowerCase() === key);
    let isBest = true;
    if (idx < 0) {
        entries.push({name, score, coins, at: Date.now()});
    } else if (score > entries[idx].score) {
        entries[idx] = {name, score, coins, at: Date.now()};
    } else {
        isBest = false;
    }
    entries.sort((a, b) => b.score - a.score || b.coins - a.coins);
    saveBoard(entries.slice(0, 100));
    const rank = entries.findIndex(e => e.name.trim().toLowerCase() === key) + 1;
    return {rank, best: entries[rank - 1].score, isBest};
}
// Modal focus: remember the control that opened a dialog and hand focus
// back to it when the dialog closes (if it is still on screen).
const openers: Record<string, HTMLElement | null> = {};
function rememberOpener(id: string) {
    const el = document.activeElement as HTMLElement | null;
    openers[id] = el && el !== document.body && !$(id).contains(el) ? el : null;
}
function restoreOpener(id: string) {
    const el = openers[id];
    openers[id] = null;
    if (el && el.isConnected && !(el as HTMLButtonElement).disabled && el.offsetParent !== null) el.focus();
}
function showBoard(you?: {name: string; score: number; rank: number; best: number; isBest: boolean}) {
    const top = loadBoard().slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const youKey = you?.name.trim().toLowerCase();
    $('cv-board-list').innerHTML = top.length
        ? top.map((e, i) => `<li${youKey && e.name.trim().toLowerCase() === youKey ? ' class="you"' : ''}>
            <span class="medal">${medals[i]}</span>
            <span class="name">${escapeHtml(e.name)}</span>
            <span class="score">${e.score.toLocaleString()} · ${e.coins} 🪙</span></li>`).join('')
        : '<li><span class="name">No runs yet — be the first!</span></li>';
    $('cv-board-you').textContent = you
        ? (you.isBest
            ? `${you.name}: ${you.score.toLocaleString()} points — new personal best! Rank #${you.rank}`
            : `${you.name}: ${you.score.toLocaleString()} points (best ${you.best.toLocaleString()}) — rank #${you.rank}`)
        : '';
    const board = $('cv-board') as HTMLElement;
    if (board.hidden) rememberOpener('cv-board');
    board.hidden = false;
}
function hideBoard() {
    const board = $('cv-board') as HTMLElement;
    if (board.hidden) return;
    board.hidden = true;
    restoreOpener('cv-board');
}
function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] as string));
}

// Nickname prompt → then calibrate (if needed) → countdown → run.
function openNamePrompt() {
    hideIntro();
    hideBoard();
    const input = $('cv-name-input') as HTMLInputElement;
    input.value = playerName;
    ($('cv-name-hands') as HTMLInputElement).checked = mode === 'hands';
    const dlg = $('cv-name') as HTMLElement;
    if (dlg.hidden) rememberOpener('cv-name');
    dlg.hidden = false;
    setTimeout(() => { input.focus(); input.select(); }, 0);
}
// Cancel/Escape hands focus back to the opener; a submitted start does not
// (the run takes over and no control should hold focus during play).
function closeNamePrompt(returnFocus = true) {
    const dlg = $('cv-name') as HTMLElement;
    if (dlg.hidden) return;
    dlg.hidden = true;
    if (returnFocus) restoreOpener('cv-name'); else openers['cv-name'] = null;
}
function submitName() {
    const input = $('cv-name-input') as HTMLInputElement;
    playerName = input.value.trim().slice(0, 16) || 'Player';
    try { localStorage.setItem(NAME_KEY, playerName); } catch {}
    closeNamePrompt(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
    captureFace(playerName); // fire-and-forget snapshot for the photos/ folder
    setMode(($('cv-name-hands') as HTMLInputElement).checked ? 'hands' : 'pose');
    pendingGame = true;
    if (interpreter.calibrated) {
        beginGame();
    } else {
        cancelCountdown();
        lastCalibPct = -1;
        interpreter.startCalibration();
        setStatus(`Hi ${playerName}! Hold still — calibrating…`);
    }
}
// Start the run for the pending New Game: a dead run needs an 'r' first
// (its 'ready' event runs the countdown); otherwise count down directly.
function beginGame() {
    pendingGame = false;
    hideBoard();
    if (gameEnded) {
        pressKey('r');
    } else if (!gameStarted) {
        restartCountdown();
    }
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
            if (pendingGame) {
                // New Game was requested and needed a calibration first.
                setStatus('Calibrated ✓ — get ready!');
                beginGame();
            } else if (gameStarted && !gameEnded) {
                setStatus('Re-calibrated ✓ — keep going!');
            } else {
                setStatus('Calibrated ✓ — press New Game to play');
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
    setTimeout(syncModeUI, 0); // after the flags below settle
    if (status !== 'end') cancelCatch('status:' + status); // restart / fresh run cancels the cinematic
    hideIntro(); // a run starting/restarting by any path leaves the welcome screen
    if (status === 'start') {
        gameStarted = true;
        gameEnded = false;
        stoppedByUser = false;
        lastData = {score: 0, coin: 0};
        cancelCountdown();
        hideBoard();
        themeAudio.currentTime = 0;
        themeAudio.play().catch(() => {});
        setStatus(`GO ${playerName || ''}! Step • jump • squat`);
    } else if (status === 'end') {
        gameEnded = true;
        themeAudio.pause();
        const name = playerName || 'Player';
        const result = recordRun(name, lastData.score, lastData.coin);
        if (stoppedByUser) {
            // Stop = "I'm done": celebrate and show the top three.
            showBoard({name, score: lastData.score, ...result});
            launchConfetti();
            setStatus('Run stopped — press New Game to play again');
        } else {
            playCrash();
            setStatus('You crashed! Press New Game to play again');
            // Authoritative game over (the game's own end, not Stop): the
            // score/leaderboard were committed above; the cinematic only
            // delays the reveal of the results already on screen.
            playCatch();
        }
    } else if (status === 'ready') {
        // Fresh run (r pressed): player model reloads, lanes reset to center,
        // and the run auto-starts after a 3-2-1 countdown.
        gameStarted = false;
        gameEnded = false;
        interpreter.zone = 0;
        interpreter.lane = 1;
        themeAudio.pause();
        hideBoard();
        setStatus('Get ready — stand centered!');
        restartCountdown();
    }
});
game.on('gameData', (d: any) => { lastData = {score: d.score, coin: d.coin}; });

renderTop3();
$('cv-newgame').addEventListener('click', openNamePrompt);
$('cv-board-newgame').addEventListener('click', openNamePrompt);
$('cv-board-close').addEventListener('click', hideBoard);
$('cv-name-start').addEventListener('click', submitName);
$('cv-name-cancel').addEventListener('click', () => closeNamePrompt());
// Body Control / Hand Control switch (Phase 4 panel; same setMode as the
// New Game dialog's checkbox). Locked while a run is live.
$('cv-mode-pose').addEventListener('click', () => setMode('pose'));
$('cv-mode-hands').addEventListener('click', () => setMode('hands'));
function syncModeUI() {
    const live = gameStarted && !gameEnded;
    for (const [id, m] of [['cv-mode-pose', 'pose'], ['cv-mode-hands', 'hands']] as const) {
        const b = $(id) as HTMLButtonElement;
        b.setAttribute('aria-pressed', String(mode === m));
        b.disabled = live;
    }
}
syncModeUI();
// Typing a nickname must not drive the game (p/r/w/a/s/d/f are global keys).
$('cv-name-input').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') submitName();
    if (e.key === 'Escape') closeNamePrompt();
});
// Stop (admin button, always visible): end a live run and reveal the Top 3;
// outside a run it simply reveals the Top 3.
$('cv-stop').addEventListener('click', () => {
    cancelCatch('stop');
    if (gameStarted && !gameEnded) {
        stoppedByUser = true;
        controlPlayer()?.endRun(); // 'end' handler shows the board + confetti
    } else {
        cancelCountdown();
        pendingGame = false;
        showBoard();
        launchConfetti();
        setStatus('Top 3 — press New Game to play');
    }
});

// ---------- Control mode switch ----------
function setMode(m: Mode) {
    if (m === mode && interpreter) return;
    mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch {}
    const aspect = interpreter?.opts?.aspect || 1;
    interpreter = m === 'hands' ? new HandsInterpreter() : new GestureInterpreter();
    interpreter.opts.aspect = aspect;
    applyTuning(loadTuning());
    refreshSliders();
    mimic.armsOnly = m === 'hands';
    engine.anchor = m;
    layoutStage();
    (window as any).__cvtest && ((window as any).__cvtest.interpreter = interpreter);
    syncModeUI();
    if (restoreCalibration()) {
        $('cv-calibrate').textContent = 'Re-calibrate';
    } else {
        $('cv-calibrate').textContent = 'Calibrate';
    }
    setStatus(m === 'hands' ? 'Hands mode: hold both hands in front of you to calibrate'
                            : 'Standing mode');
}

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
    // Hands mode: each STEP line sits beyond that hand's resting spot.
    const baseR = mode === 'hands' ? calib.rx : calib.hipX;
    const baseL = mode === 'hands' ? calib.lx : calib.hipX;
    const xr = (baseR - opts.laneEnter * calib.torso / aspect) * canvas.width;
    const xl = (baseL + opts.laneEnter * calib.torso / aspect) * canvas.width;
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
    // Guidance center: the (adapting) calibrated hip point once calibrated.
    target: () => interpreter.calibrated && interpreter.calib
        ? {x: interpreter.calib.hipX, y: interpreter.calib.hipY} : null,
    onResults: (landmarks: any) => {
        latestLandmarks = landmarks;
        landmarksAt = performance.now();
        updateGuide(landmarks);
        handleEvents(interpreter.update(landmarks, performance.now()));
        if (landmarksAt - lastStatsAt > 500) {
            lastStatsAt = landmarksAt;
            $('cv-stats').textContent =
                `pose ${engine.fps} fps · ${Math.round(engine.inferMs)} ms · game ${game.fps} fps`
                + (engine.track?.locked ? ' · locked on player' : ' · searching')
                + (mode === 'hands' ? ' · hands mode' : '')
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

// ---------- Effects settings (Phase 5) ----------
// Master toggle (?fx=0 for A/B comparisons) and Reduced Effects, which
// defaults from prefers-reduced-motion unless the user saved a choice.
{
    const FX_KEY = 'cv-fx', FX_REDUCED_KEY = 'cv-fx-reduced';
    const fxInput = $('cv-fx') as HTMLInputElement;
    const reducedInput = $('cv-fx-reduced') as HTMLInputElement;
    let enabled = true, reduced = false;
    try {
        const q = new URLSearchParams(location.search).get('fx');
        if (q === '0' || q === '1') localStorage.setItem(FX_KEY, q);
        enabled = localStorage.getItem(FX_KEY) !== '0';
        const savedReduced = localStorage.getItem(FX_REDUCED_KEY);
        reduced = savedReduced !== null ? savedReduced === '1'
            : matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {}
    const apply = () => {
        game.fxEnabled = enabled;
        game.fx?.setReduced(reduced);
        if (!enabled) game.fx?.setRunning(false);
        else if (gameStarted && !gameEnded) game.fx?.setRunning(true);
    };
    fxInput.checked = enabled;
    reducedInput.checked = reduced;
    fxInput.addEventListener('change', () => {
        enabled = fxInput.checked;
        try { localStorage.setItem(FX_KEY, enabled ? '1' : '0'); } catch {}
        apply();
    });
    reducedInput.addEventListener('change', () => {
        reduced = reducedInput.checked;
        try { localStorage.setItem(FX_REDUCED_KEY, reduced ? '1' : '0'); } catch {}
        apply();
    });
    apply();
}

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
// v4: bumped when the default thresholds change so stale saved tuning
// (based on the old, wider box) doesn't override the tighter defaults.
const TUNING_KEY = 'cv-tuning-v4';
const tuningKey = () => `${TUNING_KEY}-${mode}`; // sliders are per mode
const SLIDERS: Array<{id: string; opt: string}> = [
    {id: 'cv-lane', opt: 'laneEnter'},
    {id: 'cv-band', opt: 'vertBand'},
];

function applyTuning(opts: Record<string, number>) {
    Object.assign(interpreter.opts, opts);
    // Hysteresis scales with the step threshold; the jump/squat lines keep
    // their 25%/75% split of the vertical band.
    interpreter.opts.laneExit = interpreter.opts.laneEnter * 0.66;
    applyBand(interpreter.opts);
}

function loadTuning(): Record<string, number> {
    try {
        const saved = JSON.parse(localStorage.getItem(tuningKey()) || '{}');
        return typeof saved === 'object' && saved ? saved : {};
    } catch { return {}; }
}

function refreshSliders() {
    for (const {id, opt} of SLIDERS) {
        ($(id) as HTMLInputElement).value = String(interpreter.opts[opt]);
        $(id + '-val').textContent = Number(interpreter.opts[opt]).toFixed(2);
    }
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
        try { localStorage.setItem(tuningKey(), JSON.stringify(tuning)); } catch {}
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

// ---------- Framing guidance (out of frame / too close / too far) ----------
// Shown as a big banner on the feed once a problem persists ~300ms.
let guideSince = 0;
let guideText = '';
function framingProblem(landmarks: any): [string, string] | null {
    if (!landmarks) return ['Step into frame', "I can't see you"];
    const vis = (i: number) => landmarks[i] && (landmarks[i].visibility ?? 1) > 0.5;
    if (mode === 'hands') {
        if (!vis(15) || !vis(16)) return ['Show both hands', 'Keep both hands in view'];
        if (landmarks.hands) return null; // hand tracker has both hands: framed fine
    }
    if (!vis(11) || !vis(12)) return ['Show your shoulders', 'Move back into frame'];
    if (mode !== 'hands' && (!vis(23) || !vis(24))) {
        return ['Show your hips', 'Step back so your waist is visible'];
    }
    const shY = (landmarks[11].y + landmarks[12].y) / 2;
    const shX = (landmarks[11].x + landmarks[12].x) / 2;
    const hipX = mode === 'hands' ? shX : (landmarks[23].x + landmarks[24].x) / 2;
    // Body size in frame heights: torso length standing, shoulder width seated.
    const torso = mode === 'hands'
        ? Math.abs(landmarks[11].x - landmarks[12].x) * (interpreter.opts.aspect || 1) * 1.3
        : (landmarks[23].y + landmarks[24].y) / 2 - shY;
    if (torso > 0.55) return ['Too close', 'Step back from the camera'];
    if (torso < 0.12) return ['Come closer', "You're too far from the camera"];
    if (hipX < 0.15) return ['Move right ➜', 'Get back to the center'];
    if (hipX > 0.85) return ['⬅ Move left', 'Get back to the center'];
    if (landmarks[0] && landmarks[0].y < 0.02) return ['Head cut off', 'Step back a little'];
    return null;
}
function updateGuide(landmarks: any) {
    const problem = framingProblem(landmarks);
    const el = $('cv-guide');
    if (!problem) {
        guideSince = 0;
        el.classList.remove('on');
        return;
    }
    const now = performance.now();
    if (!guideSince) guideSince = now;
    if (now - guideSince < 300) return;
    const text = problem[0] + '|' + problem[1];
    if (text !== guideText) {
        guideText = text;
        el.innerHTML = `<span class="ico">👀</span><div>${problem[0]}<small>${problem[1]}</small></div>`;
    }
    el.classList.add('on');
}

// ---------- Confetti (Stop → leaderboard celebration) ----------
function launchConfetti(durationMs = 2600) {
    const c = document.createElement('canvas');
    c.id = 'cv-confetti';
    c.width = Math.floor((document.querySelector('.experience') as HTMLElement | null)?.clientWidth || window.innerWidth / 2);
    c.height = window.innerHeight;
    document.body.appendChild(c);
    const ctx = c.getContext('2d')!;
    const colors = ['#7c4dff', '#ffeb3b', '#ff5252', '#00e676', '#40c4ff', '#ff9800'];
    const parts = Array.from({length: 140}, () => ({
        x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5,
        vx: (Math.random() - 0.5) * 2.2, vy: 2.5 + Math.random() * 3.5,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25,
        color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame() {
        const t = performance.now() - t0;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.globalAlpha = t > durationMs - 600 ? Math.max(0, (durationMs - t) / 600) : 1;
        for (const p of parts) {
            p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx += Math.sin(t / 300 + p.y / 50) * 0.02;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        if (t < durationMs) requestAnimationFrame(frame); else c.remove();
    })();
}

// ---------- Face snapshot on New Game (saved server-side in photos/) ----------
// Crops around the face using the pose landmarks (nose + ears); falls back
// to a center crop. Posted to the local game server; failures are silent.
async function captureFace(name: string) {
    const video = $('cv-video') as HTMLVideoElement;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const lm = latestLandmarks;
    let cx = 0.5, cy = 0.4, wFrac = 0.28;
    if (lm && lm[0] && lm[7] && lm[8] && (lm[7].visibility ?? 1) > 0.4 && (lm[8].visibility ?? 1) > 0.4) {
        cx = lm[0].x;
        cy = lm[0].y - 0.03;
        wFrac = Math.max(0.14, Math.abs(lm[8].x - lm[7].x) * 2.1);
    }
    const bw = Math.min(vw, wFrac * vw);
    const bh = Math.min(vh, bw * 1.25);
    const sx = Math.max(0, Math.min(vw - bw, cx * vw - bw / 2));
    const sy = Math.max(0, Math.min(vh - bh, cy * vh - bh / 2));
    const out = document.createElement('canvas');
    out.width = 320; out.height = 400;
    const ctx = out.getContext('2d')!;
    ctx.translate(out.width, 0); ctx.scale(-1, 1); // selfie orientation
    ctx.drawImage(video, sx, sy, bw, bh, 0, 0, out.width, out.height);
    const blob: Blob | null = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return;
    try {
        const res = await fetch(`/api/photo?name=${encodeURIComponent(name)}`, {
            method: 'POST', body: blob, headers: {'Content-Type': 'image/jpeg'},
        });
        if (res.ok) console.log('[CV] photo saved', await res.text());
    } catch {}
}

// ---------- Catch cinematic (opt-in: ?catchVideo=1 AND ?arturo=1) ----------
// A silent MP4 shown over the game pane after the game's own game-over.
// It never decides anything: the run is recorded before it starts, and any
// exit (ended / Skip / Escape / error / timeout / restart / Stop / hidden
// tab) reveals the results that are already there — exactly once per run.
const CATCH_SRC = '/assets/video/arturo-catch.mp4';
const catchEl = $('cv-catch');
const catchVideo = $('cv-catch-video') as HTMLVideoElement;
const catchSkip = $('cv-catch-skip') as HTMLButtonElement;
const catchEnabled = PURSUER && CATCH_VIDEO;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
let catchGen = 0;
let catchActive = false;
let catchTimer: ReturnType<typeof setTimeout> | null = null;
let catchLoadTimer: ReturnType<typeof setTimeout> | null = null;
const catchStats = {plays: 0, exits: 0, bypassed: 0, lastReason: ''};
if (catchEnabled) {
    // Staged once, outside play; no re-download or re-decode per run.
    catchVideo.preload = 'auto';
    catchVideo.src = CATCH_SRC;
    catchVideo.load();
}
function catchDuration() {
    const d = catchVideo.duration;
    return isFinite(d) && d > 0 ? d : 4; // measured clip length, else the brief's 4 s
}
function playCatch(): boolean {
    if (!catchEnabled) return false;
    if (reducedMotion()) { catchStats.bypassed++; return false; } // OS preference: straight to results
    if (catchActive) return false;                               // one playback per game over
    const gen = ++catchGen;
    catchActive = true;
    catchStats.plays++;
    catchEl.classList.add('on');
    catchEl.setAttribute('aria-hidden', 'false');
    catchSkip.focus();
    try { catchVideo.currentTime = 0; } catch {}
    // Loading allowance: playback must actually begin within 2.5 s.
    catchLoadTimer = setTimeout(() => exitCatch(gen, 'load-timeout'), 2500);
    catchVideo.addEventListener('playing', () => {
        if (gen !== catchGen) return;
        if (catchLoadTimer) clearTimeout(catchLoadTimer);
        // Bounded watchdog from the measured duration + a small allowance.
        catchTimer = setTimeout(() => exitCatch(gen, 'watchdog'), (catchDuration() + 1.5) * 1000);
    }, {once: true});
    let p: Promise<void> | undefined;
    try { p = catchVideo.play(); } catch { exitCatch(gen, 'play-threw'); return true; }
    p?.catch(() => exitCatch(gen, 'play-rejected'));
    return true;
}
function exitCatch(gen: number, reason: string) {
    if (!catchActive || gen !== catchGen) return; // stale event from an earlier run, or already exited
    catchActive = false;
    catchStats.exits++;
    catchStats.lastReason = reason;
    if (catchTimer) clearTimeout(catchTimer);
    if (catchLoadTimer) clearTimeout(catchLoadTimer);
    catchTimer = catchLoadTimer = null;
    try { catchVideo.pause(); } catch {}
    catchEl.classList.remove('on');
    catchEl.setAttribute('aria-hidden', 'true');
    // Results (status line + "play again" mask, or the Top 3 if Stop was
    // pressed) are already on screen underneath; hand focus to the restart control.
    const ng = $('cv-newgame') as HTMLButtonElement;
    if (!ng.disabled && ng.offsetParent !== null && document.activeElement === catchSkip) ng.focus();
}
function cancelCatch(reason: string) { exitCatch(catchGen, reason); }
catchVideo.addEventListener('ended', () => exitCatch(catchGen, 'ended'));
catchVideo.addEventListener('error', () => exitCatch(catchGen, 'media-error'));
catchSkip.addEventListener('click', () => exitCatch(catchGen, 'skip'));
window.addEventListener('keydown', e => { if (catchActive && e.key === 'Escape') exitCatch(catchGen, 'escape'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelCatch('hidden'); });

// Test seam for automated checks.
(window as any).__cvtest = {
    interpreter,
    engine,
    mimic,
    audio: {theme: themeAudio, crash: crashAudio},
    roadLength,
    board: {load: loadBoard, save: saveBoard, record: recordRun},
    get fx() { return game.fx; },
    get pursuer() { return game.pursuer; },
    startCamera,
    camera: {switchDevice: switchCameraDevice, applyPreset: applyCameraPreset, lockExposure, refresh: refreshCameraList, track: camTrack},
    resetBoard: () => { saveBoard([]); },
    get intro() { return intro ? {element: intro.element, show: (window as any).__cvIntro.show, hide: hideIntro, setReady: (v: boolean) => intro.setReady(v)} : null; },
    catch: {
        enabled: catchEnabled,
        get active() { return catchActive; },
        stats: catchStats,
        video: catchVideo,
        play: playCatch,
        cancel: cancelCatch,
        setSrc(src: string) { catchVideo.src = src; catchVideo.load(); },
    },
    get finnPolish() { return (Player as any).instance?.polish ?? null; },
    get finnAudit() { return (Player as any).instance?.audit ?? null; },
    setMode,
    get mode() { return mode; },
    newGame(name: string) {
        ($('cv-name-input') as HTMLInputElement).value = name;
        submitName();
    },
    framingProblem,
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

// Camera start. A denied/busy camera leaves the game keyboard-playable and
// shows "Retry camera": once the attendant allows the camera in the browser
// (address-bar permission) the retry re-runs the same init without a reload.
let cameraStarting = false;
async function startCamera() {
    if (cameraStarting || engine.running) return;
    cameraStarting = true;
    const retry = $('cv-cam-retry') as HTMLButtonElement;
    retry.hidden = true;
    try {
        // A previous attempt may have built the pose model before the webcam
        // request failed; release it so the retry does not stack a second one.
        try { (engine as any).landmarker?.close?.(); (engine as any).landmarker = null; } catch {}
        await engine.init();
        const v = $('cv-video') as HTMLVideoElement;
        interpreter.opts.aspect = (v.videoWidth / v.videoHeight) || 1;
        engine.anchor = mode;
        mimic.armsOnly = mode === 'hands';
        engine.start();
        ($('cv-calibrate') as HTMLButtonElement).disabled = false;
        ($('cv-newgame') as HTMLButtonElement).disabled = false;
        applySavedCameraSettings().catch(() => {});
        if (intro) {
            intro.setReady(true); // LET'S RUN opens the same New Game flow
            // The intro usually appears before the camera is up (focus went to
            // the dismiss link); hand focus to the now-enabled start button.
            const el = intro.element as HTMLElement;
            if (!el.hidden && el.contains(document.activeElement)) (el.querySelector('.frp-start') as HTMLButtonElement)?.focus({preventScroll: true});
        }
        if (restoreCalibration()) {
            $('cv-calibrate').textContent = 'Re-calibrate';
            setStatus('Calibration remembered — press New Game to play');
        } else {
            setStatus('Press New Game (you will calibrate first)');
        }
    } catch (err: any) {
        const denied = /NotAllowed|Permission|denied/i.test(err?.name + ' ' + err?.message);
        const busy = /NotReadable|in use|Could not start/i.test(err?.name + ' ' + err?.message);
        setStatus(denied
            ? 'Camera blocked — allow the camera in the browser\'s address bar, then press Retry camera'
            : busy ? 'Camera busy — close other apps using it, then press Retry camera'
            : 'Camera error: ' + (err?.message || err) + ' — press Retry camera (keyboard still works: P to start)');
        retry.hidden = false;
        retry.focus();
        console.error('[CV] init failed', err);
    } finally {
        cameraStarting = false;
    }
}
// ---------- Camera settings (device / resolution+fps / exposure lock) ----------
// The engine keeps reading the same <video>; we only swap or re-constrain the
// stream behind it and resize the overlay canvas. A changed aspect ratio
// invalidates the calibration (its units), so we ask for a re-calibration.
const CAM_DEV_KEY = 'cv-cam-device', CAM_RES_KEY = 'cv-cam-res', CAM_LOCK_KEY = 'cv-cam-lock';
const camDevice = $('cv-cam-device') as HTMLSelectElement;
const camRes = $('cv-cam-res') as HTMLSelectElement;
const camLock = $('cv-cam-lock') as HTMLInputElement;
const camInfo = $('cv-cam-info');
function camTrack(): MediaStreamTrack | null {
    const s = ($('cv-video') as HTMLVideoElement).srcObject as MediaStream | null;
    return s?.getVideoTracks()[0] || null;
}
function parseRes(v: string) { const m = /^(\d+)x(\d+)@(\d+)$/.exec(v); return m ? {width: +m[1], height: +m[2], fps: +m[3]} : {width: 1280, height: 720, fps: 60}; }
async function refreshCameraList() {
    try {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        const current = camTrack()?.getSettings().deviceId;
        camDevice.innerHTML = devs.map((d, i) => `<option value="${d.deviceId}">${escapeHtml(d.label || `Camera ${i + 1}`)}</option>`).join('') || '<option value="">(no camera)</option>';
        if (current) camDevice.value = current;
    } catch {}
}
function updateCamInfo() {
    const t = camTrack();
    if (!t) { camInfo.textContent = 'No camera stream.'; return; }
    const s = t.getSettings() as any;
    const caps = (t.getCapabilities ? t.getCapabilities() : {}) as any;
    const canLock = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual');
    camLock.disabled = !canLock;
    camLock.checked = s.exposureMode === 'manual';
    camInfo.textContent = `${t.label || 'camera'} · ${s.width}×${s.height} @ ${Math.round(s.frameRate || 0)} fps · exposure ${s.exposureMode || 'n/a'}`
        + (canLock ? '' : ' (lock not supported by this camera in this browser)');
}
async function afterStreamChange() {
    const v = $('cv-video') as HTMLVideoElement;
    for (let i = 0; i < 20 && !v.videoWidth; i++) await new Promise(r => setTimeout(r, 50));
    engine.canvas.width = v.videoWidth; engine.canvas.height = v.videoHeight;
    const aspect = (v.videoWidth / v.videoHeight) || 1;
    if (Math.abs(aspect - interpreter.opts.aspect) > 0.01) {
        interpreter.opts.aspect = aspect;
        interpreter.calibrated = false;
        setStatus('Camera changed — press Calibrate (or New Game) to calibrate again');
    }
    layoutStage();
    updateCamInfo();
    refreshCameraList();
}
async function switchCameraDevice(deviceId: string) {
    const v = $('cv-video') as HTMLVideoElement;
    const {width, height, fps} = parseRes(camRes.value);
    const old = v.srcObject as MediaStream | null;
    old?.getTracks().forEach(t => t.stop());
    try {
        const stream = await navigator.mediaDevices.getUserMedia({video: {deviceId: {exact: deviceId}, width: {ideal: width}, height: {ideal: height}, frameRate: {ideal: fps}}, audio: false});
        v.srcObject = stream;
        await new Promise<void>(r => { v.onloadedmetadata = () => r(); });
        await v.play();
        try { localStorage.setItem(CAM_DEV_KEY, deviceId); } catch {}
    } catch (err: any) {
        setStatus('Could not open that camera: ' + (err?.message || err));
        try { // fall back to the engine's default request
            const stream = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: width}, height: {ideal: height}, frameRate: {ideal: fps}}, audio: false});
            v.srcObject = stream; await v.play();
        } catch {}
    }
    await afterStreamChange();
    if (camLock.checked) await lockExposure(true);
}
async function applyCameraPreset(value: string) {
    const t = camTrack(); if (!t) return;
    const {width, height, fps} = parseRes(value);
    try { await t.applyConstraints({width: {ideal: width}, height: {ideal: height}, frameRate: {ideal: fps}}); } catch (err: any) { setStatus('Camera preset not accepted: ' + (err?.message || err)); }
    try { localStorage.setItem(CAM_RES_KEY, value); } catch {}
    await new Promise(r => setTimeout(r, 150));
    await afterStreamChange();
}
async function lockExposure(on: boolean) {
    const t = camTrack(); if (!t) return false;
    const caps = (t.getCapabilities ? t.getCapabilities() : {}) as any;
    if (!Array.isArray(caps.exposureMode) || !caps.exposureMode.includes('manual')) { updateCamInfo(); return false; }
    try {
        if (on) {
            const cur = (t.getSettings() as any).exposureTime;
            const adv: any = {exposureMode: 'manual'};
            if (cur && caps.exposureTime) adv.exposureTime = Math.min(caps.exposureTime.max, Math.max(caps.exposureTime.min, cur));
            await t.applyConstraints({advanced: [adv as any]});
        } else {
            await t.applyConstraints({advanced: [{exposureMode: 'continuous'} as any]});
        }
        try { localStorage.setItem(CAM_LOCK_KEY, on ? '1' : '0'); } catch {}
    } catch (err: any) { setStatus('Exposure lock failed: ' + (err?.message || err)); }
    updateCamInfo();
    return (camTrack()?.getSettings() as any)?.exposureMode === 'manual';
}
camDevice.addEventListener('change', () => { if (camDevice.value) switchCameraDevice(camDevice.value); });
camRes.addEventListener('change', () => applyCameraPreset(camRes.value));
camLock.addEventListener('change', () => lockExposure(camLock.checked));
try { navigator.mediaDevices.addEventListener('devicechange', refreshCameraList); } catch {}
try { const savedRes = localStorage.getItem(CAM_RES_KEY); if (savedRes) camRes.value = savedRes; } catch {}
// Applied once the engine's own camera start succeeds (see startCamera):
async function applySavedCameraSettings() {
    await refreshCameraList();
    let savedDev = ''; try { savedDev = localStorage.getItem(CAM_DEV_KEY) || ''; } catch {}
    const current = camTrack()?.getSettings().deviceId;
    if (savedDev && savedDev !== current && [...camDevice.options].some(o => o.value === savedDev)) {
        camDevice.value = savedDev;
        await switchCameraDevice(savedDev);
    } else {
        let savedRes = ''; try { savedRes = localStorage.getItem(CAM_RES_KEY) || ''; } catch {}
        if (savedRes) await applyCameraPreset(savedRes); else updateCamInfo();
        let lock = false; try { lock = localStorage.getItem(CAM_LOCK_KEY) === '1'; } catch {}
        if (lock) await lockExposure(true);
    }
}

// ---------- Booth: reset the leaderboard (two-step confirm, no dialogs) ----------
{
    let armTimer: ReturnType<typeof setTimeout> | null = null;
    const buttons = [$('cv-board-reset'), $('cv-board-reset2')] as HTMLButtonElement[];
    const note = $('cv-board-reset-note');
    const disarm = () => { for (const b of buttons) { b.classList.remove('arm'); b.textContent = b.id === 'cv-board-reset2' ? 'Reset' : 'Reset leaderboard'; } note.textContent = ''; };
    const reset = () => {
        saveBoard([]);
        disarm();
        note.textContent = 'All scores cleared.';
        if (!($('cv-board') as HTMLElement).hidden) showBoard();
        setStatus('Leaderboard cleared — fresh session');
    };
    for (const b of buttons) b.addEventListener('click', () => {
        if (b.classList.contains('arm')) { if (armTimer) clearTimeout(armTimer); reset(); return; }
        disarm();
        b.classList.add('arm');
        b.textContent = 'Click again to confirm';
        note.textContent = 'This clears every saved score.';
        if (armTimer) clearTimeout(armTimer);
        armTimer = setTimeout(disarm, 4000);
    });
}

// ---------- Welcome screen (presentation pack) ----------
// Mounted once in the game pane wrapper beside the canvas; shown once on
// page entry. LET'S RUN delegates to the existing New Game flow (nickname →
// camera/calibration → countdown); "Go to game controls"/Escape only
// dismiss. While visible, the pre-game mask and HUD are hidden via
// <html data-intro="on"> (see intro-overrides.css); the camera panel is
// never made inert.
const introHost = document.querySelector('.experience') as HTMLElement | null;
let intro: any = null;
function hideIntro() {
    if (!intro || intro.element.hidden) return;
    intro.hide();
    document.documentElement.removeAttribute('data-intro');
}
if (introHost) {
    intro = createFinnIntro({
        host: introHost,
        artUrl: '/assets/images/finn-intro-hero.png',
        ready: false, // flips when the camera is running = the New Game gate
        onStart: () => { document.documentElement.removeAttribute('data-intro'); openNamePrompt(); },
        onDismiss: () => {
            document.documentElement.removeAttribute('data-intro');
            const ng = $('cv-newgame') as HTMLButtonElement;
            (ng.disabled ? $('cv-cam-retry') : ng).focus();
        },
    });
    const showIntro = () => {
        document.documentElement.setAttribute('data-intro', 'on');
        intro.show();
    };
    // Show once the loading screen is gone (the game emits successLoad).
    if (document.querySelector('.loading')) {
        const onLoaded = (d: any) => { if (d?.type === 'successLoad') { game.off('progress', onLoaded); setTimeout(showIntro, 0); } };
        game.on('progress', onLoaded);
    } else {
        showIntro();
    }
    (window as any).__cvIntro = {show: showIntro, hide: hideIntro, dispose: () => intro?.dispose()};
}

// ---------- Resizable split (game pane | camera panel) ----------
// --split on <html> is the game pane width; every pane-wide layer reads it.
// Dragging (or ←/→ on the handle) updates it live and notifies the game's
// Sizes and the camera stage through the normal window resize path.
{
    const SPLIT_KEY = 'cv-split';
    const root = document.documentElement;
    const splitter = document.createElement('div');
    splitter.id = 'cv-splitter';
    splitter.setAttribute('role', 'separator');
    splitter.setAttribute('aria-orientation', 'vertical');
    splitter.setAttribute('aria-label', 'Resize game and camera panes');
    splitter.tabIndex = 0;
    document.body.appendChild(splitter);
    const apply = (pct: number, persist = false) => {
        pct = Math.min(70, Math.max(30, pct));
        root.style.setProperty('--split', `${pct.toFixed(2)}vw`);
        splitter.setAttribute('aria-valuenow', String(Math.round(pct)));
        window.dispatchEvent(new Event('resize'));
        if (persist) { try { localStorage.setItem(SPLIT_KEY, pct.toFixed(2)); } catch {} }
    };
    try { const saved = parseFloat(localStorage.getItem(SPLIT_KEY) || ''); if (saved >= 30 && saved <= 70) apply(saved); } catch {}
    let dragging = false;
    splitter.addEventListener('pointerdown', e => {
        dragging = true; splitter.classList.add('drag'); splitter.setPointerCapture(e.pointerId); e.preventDefault();
    });
    splitter.addEventListener('pointermove', e => { if (dragging) apply(e.clientX / window.innerWidth * 100); });
    const end = (e: PointerEvent) => { if (!dragging) return; dragging = false; splitter.classList.remove('drag'); apply(e.clientX / window.innerWidth * 100, true); };
    splitter.addEventListener('pointerup', end);
    splitter.addEventListener('pointercancel', end);
    splitter.addEventListener('keydown', e => {
        const cur = parseFloat(getComputedStyle(root).getPropertyValue('--split')) || 50;
        if (e.key === 'ArrowLeft') { apply(cur - 2, true); e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'ArrowRight') { apply(cur + 2, true); e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'Home') { apply(50, true); e.preventDefault(); e.stopPropagation(); }
    });
    (window as any).__cvtest && ((window as any).__cvtest.split = apply);
}

$('cv-cam-retry').addEventListener('click', () => { startCamera(); });
startCamera();
