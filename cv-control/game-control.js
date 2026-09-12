// game-control.js — drop-in pose control for the Subway Surfers page.
// Builds a picture-in-picture webcam panel, runs PoseEngine + the gesture
// interpreter, and forwards gesture events to the game as key presses.

import { PoseEngine } from "./pose.js";
import { GestureInterpreter } from "./gestures.js";
import { GameBridge, KEYS } from "./bridge.js";

const KEY_NAMES = { 37: "←", 38: "↑", 39: "→", 40: "↓" };

// ---------- Panel UI ----------
const style = document.createElement("style");
style.textContent = `
#cv-panel {
    position: fixed; right: 16px; bottom: 16px; z-index: 9999;
    width: 300px; background: #111418ee; border-radius: 14px;
    box-shadow: 0 10px 34px rgba(0,0,0,.55); overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif; color: #e8eaed;
}
#cv-stage { position: relative; transform: scaleX(-1); }
#cv-video { display: block; width: 100%; height: auto; }
#cv-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
#cv-countdown {
    position: absolute; inset: 0; display: none; align-items: center;
    justify-content: center; font-size: 64px; font-weight: 800;
    color: #ffeb3b; text-shadow: 0 2px 10px rgba(0,0,0,.8);
    transform: scaleX(-1);
}
#cv-bar {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
}
#cv-status { flex: 1; font-size: 12px; color: #9aa0a6; line-height: 1.3; }
#cv-key {
    min-width: 30px; text-align: center; font-size: 20px; font-weight: 800;
    color: #00e676; opacity: 0; transition: opacity .25s;
}
#cv-key.flash { opacity: 1; transition: none; }
#cv-calibrate {
    padding: 8px 12px; font-size: 13px; font-weight: 700; border: 0;
    border-radius: 8px; background: #7c4dff; color: #fff; cursor: pointer;
}
#cv-calibrate:disabled { background: #333; color: #777; }
`;
document.head.appendChild(style);

const panel = document.createElement("div");
panel.id = "cv-panel";
panel.innerHTML = `
    <div id="cv-stage">
        <video id="cv-video" autoplay playsinline muted></video>
        <canvas id="cv-overlay"></canvas>
        <div id="cv-countdown"></div>
    </div>
    <div id="cv-bar">
        <button id="cv-calibrate" disabled>Calibrate</button>
        <div id="cv-status">Loading…</div>
        <div id="cv-key"></div>
    </div>
`;
document.body.appendChild(panel);

// Waiting overlay — the game does not run until calibration (or fallback).
const waitOverlay = document.createElement("div");
waitOverlay.id = "cv-wait";
waitOverlay.style.cssText =
    "position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;" +
    "align-items:center;justify-content:center;background:rgba(10,12,16,.88);" +
    "color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;";
waitOverlay.innerHTML =
    '<div id="cv-wait-title" style="font-size:44px;font-weight:800;margin-bottom:10px;">Subway Surfers</div>' +
    '<div id="cv-wait-msg" style="font-size:20px;color:#c5cad3;">Loading pose tracking…</div>' +
    '<div id="cv-wait-count" style="font-size:120px;font-weight:800;color:#ffeb3b;min-height:0;"></div>' +
    '<a id="cv-wait-kb" href="#" style="font-size:14px;color:#8ab4f8;margin-top:26px;">start with keyboard instead</a>';
document.body.appendChild(waitOverlay);

const $ = id => document.getElementById(id);

let gameStarted = false;
function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    waitOverlay.remove();
    window.__startGame();
    console.log("[CV] game started");
}

$("cv-wait-kb").addEventListener("click", e => {
    e.preventDefault();
    startGame();
});

// ---------- Wiring ----------
const interpreter = new GestureInterpreter();
let keyFlashTimer = null;
const bridge = new GameBridge({
    onKey: keyCode => {
        const el = $("cv-key");
        el.textContent = KEY_NAMES[keyCode] || keyCode;
        el.classList.add("flash");
        clearTimeout(keyFlashTimer);
        keyFlashTimer = setTimeout(() => el.classList.remove("flash"), 350);
        console.log("[CV] key", KEY_NAMES[keyCode] || keyCode);
    },
});

function setStatus(text) {
    $("cv-status").textContent = text;
    console.log("[CV]", text);
}

function drawGuides(ctx, canvas) {
    if (!interpreter.calibrated) return;
    const { calib, opts } = interpreter;
    const xr = (calib.hipX - opts.laneEnter * calib.torso) * canvas.width;
    const xl = (calib.hipX + opts.laneEnter * calib.torso) * canvas.width;
    ctx.strokeStyle = "rgba(124, 77, 255, 0.8)";
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    for (const x of [xl, xr]) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    ctx.setLineDash([]);
}

// Calibration survives the auto-restart after a game over.
const CALIB_KEY = "cv-calibration";
function saveCalibration() {
    try { localStorage.setItem(CALIB_KEY, JSON.stringify(interpreter.calib)); } catch {}
}
function restoreCalibration() {
    try {
        const saved = JSON.parse(localStorage.getItem(CALIB_KEY));
        if (saved && saved.torso > 0) {
            interpreter.calib = saved;
            interpreter.calibrated = true;
            return true;
        }
    } catch {}
    return false;
}

function handleEvents(events) {
    bridge.handle(events);
    for (const ev of events) {
        if (ev.type === "calibrated") {
            saveCalibration();
            setStatus("GO! Step • jump • squat");
            startGame();
        }
    }
}

const engine = new PoseEngine({
    video: $("cv-video"),
    canvas: $("cv-overlay"),
    onStatus: setStatus,
    onDraw: drawGuides,
    onResults: landmarks => {
        handleEvents(interpreter.update(landmarks, performance.now()));
        if (interpreter.calibrated && !interpreter.debug.tracking) {
            setStatus("Can't see you — step back into frame");
        }
    },
});

$("cv-calibrate").addEventListener("click", async () => {
    const btn = $("cv-calibrate");
    btn.disabled = true;
    const cd = $("cv-countdown");
    cd.style.display = "flex";
    for (const n of [3, 2, 1]) {
        cd.textContent = n;
        await new Promise(r => setTimeout(r, 1000));
    }
    cd.style.display = "none";
    interpreter.startCalibration();
    setStatus("Hold still — calibrating…");
    btn.disabled = false;
    btn.textContent = "Re-calibrate";
});

// Test seam for automated checks.
window.__cvtest = {
    interpreter,
    bridge,
    engine,
    inject(landmarks, t = performance.now()) {
        const evs = interpreter.update(landmarks, t);
        handleEvents(evs);
        return evs;
    },
};

try {
    await engine.init();
    engine.start();
    $("cv-calibrate").disabled = false;
    if (restoreCalibration()) {
        $("cv-calibrate").textContent = "Re-calibrate";
        setStatus("Calibration remembered — press Re-calibrate to start");
        $("cv-wait-msg").textContent = "Press Re-calibrate when you're ready";
    } else {
        setStatus("Stand centered, then Calibrate");
        $("cv-wait-msg").textContent = "Stand centered and press Calibrate to start";
    }
} catch (err) {
    setStatus("Error: " + err.message);
    const msg = $("cv-wait-msg");
    if (msg) msg.textContent = "Camera unavailable — you can still start with keyboard below";
    console.error("[CV] init failed", err);
}
