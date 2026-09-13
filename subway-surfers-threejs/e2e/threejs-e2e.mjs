// E2E for the three.js game + CV layer: calibration-gated start, gesture→key
// mapping with lane resync, mimicry, restart flow, audio, coins, English UI.
//
// Run:
//   1. npm run dev -- --port 5180
//   2. Launch headless Chrome:
//      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        --headless=new --use-fake-device-for-media-stream \
//        --use-fake-ui-for-media-stream \
//        --autoplay-policy=no-user-gesture-required \
//        --remote-debugging-port=9377 --user-data-dir=/tmp/cv-e2e-prof \
//        --no-first-run http://localhost:5180/
//   3. node e2e/threejs-e2e.mjs 9377 /tmp/e2e-shot.png
const port = process.argv[2] || "9377";

async function getTarget() {
    for (let i = 0; i < 20; i++) {
        try {
            const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
            const page = list.find(t => t.type === "page" && t.url.includes("5180"));
            if (page) return page.webSocketDebuggerUrl;
        } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error("no target");
}

const ws = new WebSocket(await getTarget());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) pending.get(m.id)(m);
};
const send = (method, params = {}) => new Promise(res => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
});
async function evalJs(expression) {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
}

let passed = 0, failed = 0;
const check = (name, cond) => {
    if (cond) { passed++; console.log(`  ok    ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}`); }
};

// 1. Wait for game assets + CV panel
let ready = false;
for (let i = 0; i < 90; i++) {
    const st = await evalJs(`JSON.stringify({
        seam: typeof window.__cvtest === 'object',
        ctl: !!window.__cvtest?.control?.(),
        status: document.getElementById('cv-status')?.textContent || ''
    })`).then(JSON.parse).catch(() => ({}));
    if (st.seam && st.ctl && /New Game|Calibrate/.test(st.status)) { ready = true; break; }
    await new Promise(r => setTimeout(r, 1000));
}
check("game + CV panel ready", ready);

// 2. Not started before calibration
const pre = await evalJs(`JSON.stringify((() => {
    const ctl = window.__cvtest.control();
    const dir = ctl.model.position.clone().set(0, 0, 0);
    ctl.model.getWorldDirection(dir);
    return {
        started: ctl.gameStart,
        guide: document.body.textContent.includes('New Game (right panel)'),
        danceRunning: ctl.allAnimate['dance'].isRunning(),
        forwardZ: dir.z,
        themePaused: window.__cvtest.audio.theme.paused,
    };
})())`).then(JSON.parse);
check("run NOT started before calibration", !pre.started);
check("English guide text shown", pre.guide);
// Remember the bind-pose spine rotation for the respawn check later.
await evalJs(`window.__bindSpine = window.__cvtest.control().model.getObjectByName('mixamorigSpine').quaternion.toArray(); 'ok'`);
check("no intro dance animation pre-game", !pre.danceRunning);
check("character faces the camera pre-game", pre.forwardZ > 0.9);
check("theme music silent pre-game", pre.themePaused);

// 2b. Pre-game full-body mimicry: legs follow only in pre-game status.
const legs = await evalJs(`
(() => {
    const T = window.__cvtest;
    const model = T.control().model;
    // Mirror mode pre-game: the player's LEFT leg drives the RIGHT bone.
    const upLeg = model.getObjectByName('mixamorigRightUpLeg');
    const upLegL = model.getObjectByName('mixamorigLeftUpLeg');
    if (!upLeg || !upLegL) return {hasLegBone: false};
    const lm = Array.from({length: 33}, () => ({x: .5, y: .5, z: 0, visibility: 1}));
    lm[11] = {x: .58, y: .35, z: 0, visibility: 1};
    lm[12] = {x: .42, y: .35, z: 0, visibility: 1};
    lm[13] = {x: .62, y: .47, z: 0, visibility: 1};
    lm[14] = {x: .38, y: .47, z: 0, visibility: 1};
    lm[15] = {x: .64, y: .58, z: 0, visibility: 1};
    lm[16] = {x: .36, y: .58, z: 0, visibility: 1};
    lm[23] = {x: .56, y: .60, z: 0, visibility: 1};
    lm[24] = {x: .44, y: .60, z: 0, visibility: 1};
    // left knee kicked far out to the side, ankle further out
    lm[25] = {x: .80, y: .70, z: 0, visibility: 1};
    lm[27] = {x: .95, y: .75, z: 0, visibility: 1};
    lm[26] = {x: .42, y: .78, z: 0, visibility: 1};
    lm[28] = {x: .42, y: .95, z: 0, visibility: 1};
    const before = upLeg.quaternion.toArray();
    for (let i = 0; i < 30; i++) T.applyMimic(lm, 'run');
    const afterRun = upLeg.quaternion.toArray();
    for (let i = 0; i < 30; i++) T.applyMimic(lm, 'dance');
    const afterDance = upLeg.quaternion.toArray();
    const moved = (x, y) => x.some((v, i) => Math.abs(v - y[i]) > 0.05);
    return {hasLegBone: true, runMoved: moved(before, afterRun), danceMoved: moved(before, afterDance)};
})()
`);
check("legs untouched during 'run' status", legs.hasLegBone && !legs.runMoved);
check("legs mimic in pre-game status", legs.hasLegBone && legs.danceMoved);

// 3. Calibrate via seam → run starts
await evalJs(`
(() => {
    const body = (hipX, hipY, torso = 0.25) => {
        const lm = Array.from({length: 33}, () => ({x: .5, y: .5, z: 0, visibility: 1}));
        lm[11] = {x: hipX + .08, y: hipY - torso, z: 0, visibility: 1};
        lm[12] = {x: hipX - .08, y: hipY - torso, z: 0, visibility: 1};
        lm[23] = {x: hipX + .06, y: hipY, z: 0, visibility: 1};
        lm[24] = {x: hipX - .06, y: hipY, z: 0, visibility: 1};
        lm[13] = {x: hipX + .12, y: hipY - torso * 0.5, z: 0, visibility: 1}; // elbows
        lm[14] = {x: hipX - .12, y: hipY - torso * 0.5, z: 0, visibility: 1};
        lm[15] = {x: hipX + .14, y: hipY - torso * 0.1, z: 0, visibility: 1}; // wrists
        lm[16] = {x: hipX - .14, y: hipY - torso * 0.1, z: 0, visibility: 1};
        return lm;
    };
    window.__mkbody = body;
    const T = window.__cvtest;
    T.engine.stop();
    let t = 1000;
    localStorage.removeItem('cv-leaderboard');
    // New Game with a nickname: not calibrated yet, so this starts calibration.
    T.newGame('Tester');
    window.__nameHidden = document.getElementById('cv-name').hidden;
    window.__calibratingAfterNewGame = T.interpreter.debug.calibrating;
    for (let i = 0; i < 30; i++) T.inject(body(0.5, 0.6), t += 33);
    window.__t = t;
})()
`);
check("New Game prompt closes on submit", await evalJs(`window.__nameHidden === true`));
check("New Game starts calibration when uncalibrated", await evalJs(`window.__calibratingAfterNewGame === true`));
check("nickname remembered", await evalJs(`localStorage.getItem('cv-player') === 'Tester'`));
{
    // Face snapshot is POSTed to the game server and lands in photos/.
    await new Promise(r => setTimeout(r, 1500));
    const fs = await import("fs");
    const dir = new URL("../photos/", import.meta.url);
    let shots = [];
    try { shots = fs.readdirSync(dir).filter(f => /^Tester-.*\.jpg$/.test(f)); } catch {}
    const fresh = shots.some(f => Date.now() - fs.statSync(new URL(f, dir)).mtimeMs < 20000);
    check("face photo saved to photos/ on New Game", fresh);
}
await new Promise(r => setTimeout(r, 300));
check("countdown shows only AFTER calibration completes", await evalJs(`
    window.__cvtest.interpreter.calibrated && !window.__cvtest.interpreter.debug.calibrating
    && document.getElementById('cv-countdown').style.display === 'flex'`));
{
    let started = false;
    for (let i = 0; i < 15 && !started; i++) {
        await new Promise(r => setTimeout(r, 400));
        started = await evalJs(`window.__cvtest.control().gameStart === true`);
    }
    check("calibration → countdown → run starts", started);
}
const postStart = await evalJs(`JSON.stringify((() => {
    const ctl = window.__cvtest.control();
    const dir = ctl.model.position.clone().set(0, 0, 0);
    ctl.model.getWorldDirection(dir);
    return {forwardZ: dir.z, themePlaying: !window.__cvtest.audio.theme.paused};
})())`).then(JSON.parse);
check("character turns to face the track on start", postStart.forwardZ < -0.9);
check("theme music plays during the run", postStart.themePlaying);

// God mode for the movement phase: no deaths from obstacles while injecting.
await evalJs(`
(() => {
    const ctl = window.__cvtest.control();
    window.__savedChecks = {front: ctl.frontCollideCheckStatus, game: ctl.checkGameStatus};
    ctl.frontCollideCheckStatus = () => {};
    ctl.checkGameStatus = () => {};
    ctl.smallMistake = 0;
})()
`);

// 4. Jump and roll (needs real ground detection, so runs before collide patch)
const moves = await evalJs(`
(async () => {
    const T = window.__cvtest, body = window.__mkbody;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    T.inject(body(0.5, 0.54), window.__t += 700);
    out.jumpKey = T.control().key;
    out.falling = T.control().fallingSpeed > 0;
    await sleep(1200);
    T.inject(body(0.5, 0.6), window.__t += 1200);
    // A roll needs the squat to HOLD ~100ms (jump wind-ups are faster).
    for (let i = 0; i < 5; i++) T.inject(body(0.5, 0.69), window.__t += 33);
    out.rollKey = T.control().key;
    out.rolling = T.control().roll;
    T.inject(body(0.5, 0.6), window.__t += 33);
    await sleep(700);
    return out;
})()
`);
check("hip rise → 'w' jump", moves.jumpKey === 'w' && moves.falling);
check("squat → 's' roll", moves.rollKey === 's' && moves.rolling);

// 4b. Jump arc is frame-rate independent and clears the low obstacles
// (needs > 2.37 units above ground). Measured at full speed and CPU-throttled.
const measureJump = () => evalJs(`new Promise(res => {
    const c = window.__cvtest.control(); const y0 = c.model.position.y; const t0 = performance.now();
    const ys = []; let frames = 0;
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'w', bubbles: true}));
    (function f() {
        frames++; ys.push(c.model.position.y - y0);
        const airborne = !c.downCollide || c.fallingSpeed !== 0;
        if (frames < 240 && (frames < 5 || airborne)) requestAnimationFrame(f);
        else { const ms = performance.now() - t0; res({apex: Math.max(...ys), airtimeMs: ms, fps: frames / (ms / 1000)}); }
    })();
})`);
await new Promise(r => setTimeout(r, 900));
const jumpFast = await measureJump();
await send("Emulation.setCPUThrottlingRate", { rate: 6 });
await new Promise(r => setTimeout(r, 1200));
const jumpSlow = await measureJump();
await send("Emulation.setCPUThrottlingRate", { rate: 1 });
await new Promise(r => setTimeout(r, 900));
check(`jump clears low obstacles (apex ${jumpFast.apex.toFixed(2)} > 3.5 at ${jumpFast.fps.toFixed(0)} fps)`, jumpFast.apex > 3.5);
check(`jump apex frame-rate independent (${jumpSlow.apex.toFixed(2)} at ${jumpSlow.fps.toFixed(0)} fps)`,
    jumpSlow.fps < jumpFast.fps * 0.8 ? Math.abs(jumpSlow.apex - jumpFast.apex) / jumpFast.apex < 0.2 : true);
check(`airtime ≈ 0.85s (${(jumpFast.airtimeMs / 1000).toFixed(2)}s)`, jumpFast.airtimeMs > 700 && jumpFast.airtimeMs < 1050);

// 5. Lane changes sync with the game's 'way'.
// The game legitimately bounces a lane change back if an obstacle occupies the
// target lane mid-slide, so clear collisions for a deterministic check.
const lanes = await evalJs(`
(async () => {
    const T = window.__cvtest, body = window.__mkbody;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const ctl = T.control();
    window.__savedCollide = ctl.collideCheckAll;
    ctl.collideCheckAll = () => {
        ctl.downCollide = true;
        ctl.frontCollide = false;
        ctl.leftCollide = false;
        ctl.rightCollide = false;
    };
    const out = {};
    out.wayStart = ctl.way;
    T.inject(body(0.35, 0.6), window.__t += 33); await sleep(250);
    out.wayRight = ctl.way;
    T.inject(body(0.5, 0.6), window.__t += 33); await sleep(250);
    out.wayCenter = ctl.way;
    T.inject(body(0.65, 0.6), window.__t += 33); await sleep(250);
    out.wayLeft = ctl.way;
    T.inject(body(0.5, 0.6), window.__t += 33); await sleep(250);
    ctl.collideCheckAll = window.__savedCollide;
    return out;
})()
`);
check("starts center (way 2)", lanes.wayStart === 2);
check("step right → way 3", lanes.wayRight === 3);
check("recenter → way 2", lanes.wayCenter === 2);
check("step left → way 1", lanes.wayLeft === 1);

// 6. Arm mimicry moves bones
const mimicRes = await evalJs(`
(() => {
    const T = window.__cvtest, body = window.__mkbody;
    const before = T.applyMimic(null);
    // left arm raised straight up: wrist above shoulder
    const lm = body(0.5, 0.6);
    lm[13] = {x: 0.58, y: 0.20, z: 0, visibility: 1};
    lm[15] = {x: 0.58, y: 0.05, z: 0, visibility: 1};
    let after = null;
    for (let i = 0; i < 30; i++) after = T.applyMimic(lm); // slerp converges
    const changed = before && after && before.some((v, i) => Math.abs(v - after[i]) > 0.05);
    return {hasBones: T.mimic.ready(), changed};
})()
`);
check("mimic finds Mixamo bones", mimicRes.hasBones);
check("raised arm rotates LeftArm bone", mimicRes.changed);

// 7. Force game over → restart via button (restore the death checks first)
const restart = await evalJs(`
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const T = window.__cvtest;
    const ctl = T.control();
    ctl.frontCollideCheckStatus = window.__savedChecks.front;
    ctl.checkGameStatus = window.__savedChecks.game;
    ctl.smallMistake = 2; // triggers END on next update tick
    await sleep(300);
    const out = {};
    out.ended = ctl.gameStatus === 'end';
    out.themePausedOnEnd = T.audio.theme.paused;
    out.crashFired = T.audio.crash.currentTime > 0 || !T.audio.crash.paused;
    // A crash records the run but does NOT pop the leaderboard (Stop does).
    out.boardHiddenOnCrash = document.getElementById('cv-board').hidden === true;
    const top = T.board.load();
    out.recorded = top.length === 1 && top[0].name === 'Tester' && top[0].score > 0;
    // Let the death animation settle so the spine is clearly off bind pose.
    await sleep(1500);
    const spine = () => T.control().model.getObjectByName('mixamorigSpine').quaternion.toArray();
    const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    out.deadPoseDiffers = diff(spine(), window.__bindSpine) > 0.02;
    T.newGame('Tester'); // already calibrated → restart → countdown → run
    out.boardHiddenOnNewGame = document.getElementById('cv-board').hidden === true;
    await sleep(1000);
    out.countdownShown = document.getElementById('cv-countdown').style.display === 'flex';
    // Bug fix: during the countdown the respawned character must NOT still
    // be lying in the death pose.
    out.respawnResetPose = diff(spine(), window.__bindSpine) < 0.02;
    // Wait through the 3-2-1 countdown for the auto-start, then god-mode the
    // fresh run right away so it can't die while nobody is steering.
    let started = false;
    for (let i = 0; i < 12 && !started; i++) {
        await sleep(400);
        started = T.control().gameStart === true;
    }
    const ctl2 = T.control();
    ctl2.frontCollideCheckStatus = () => {};
    ctl2.checkGameStatus = () => {};
    out.runningAgain = started && ctl2.status !== 'die';
    out.mistakesReset = ctl2.smallMistake === 0;
    out.themeResumed = !T.audio.theme.paused;
    return out;
})()
`);
check("2 mistakes end the run", restart.ended);
check("theme stops + crash sound on death", restart.themePausedOnEnd && restart.crashFired);
check("leaderboard NOT shown on a crash", restart.boardHiddenOnCrash);
check("run recorded under the nickname", restart.recorded);
check("death pose moved the spine off bind", restart.deadPoseDiffers);
check("New Game hides the leaderboard", restart.boardHiddenOnNewGame);
check("respawn resets skeleton (no dead pose in countdown)", restart.respawnResetPose);
check("New Game after crash shows 3-2-1 countdown", restart.countdownShown);
check("New Game after crash starts a new run", restart.runningAgain);
check("mistakes reset after restart", restart.mistakesReset);
check("theme resumes after restart", restart.themeResumed);

// 7b. Coins count exactly once (removal from scene, not just visible=false)
const coins = await evalJs(`
(() => {
    const ctl = window.__cvtest.control();
    let mesh = null;
    for (const g of ctl.environement.coin) {
        g.traverse(m => { if (!mesh && m.name === 'coin') mesh = m; });
        if (mesh) break;
    }
    if (!mesh) return {found: false};
    const c0 = ctl.coin;
    ctl.collectCoin({object: mesh});
    const afterFirst = ctl.coin;
    const detached = !mesh.parent;
    ctl.collectCoin({object: mesh}); // same coin again — must not count
    return {found: true, once: afterFirst === c0 + 1, detached, total: ctl.coin === c0 + 1};
})()
`);
check("coin mesh found in scene", coins.found);
check("coin counts exactly once and is removed", coins.once && coins.detached && coins.total);

// 7c. Proximity pickup: a coin at the player counts; one a lane over doesn't.
const prox = await evalJs(`
(() => {
    const ctl = window.__cvtest.control();
    // Only the current plane's coin group is scanned by proximity pickup.
    const nowPlane = Math.floor(ctl.playerRunDistance / window.__cvtest.roadLength);
    const g = ctl.environement.coin[nowPlane];
    const meshes = [];
    g?.traverse(m => { if (m.isMesh && m.name === 'coin' && meshes.length < 2) meshes.push(m); });
    if (meshes.length < 2) return {found: false};
    const p = ctl.model.position;
    // meshes[0]: right at the player's chest. meshes[1]: one lane to the side.
    const place = (m, x, y, z) => {
        const target = m.position.clone().set(x, y, z);
        m.parent.worldToLocal(target);
        m.position.copy(target);
        m.updateMatrixWorld(true);
    };
    place(meshes[0], p.x, p.y + 1.5, p.z);
    place(meshes[1], p.x + 8, p.y + 1.5, p.z);
    const c0 = ctl.coin;
    ctl.collectNearbyCoins();
    const gotOwn = ctl.coin === c0 + 1 && !meshes[0].parent;
    const keptFar = !!meshes[1].parent;
    return {found: true, gotOwn, keptFar};
})()
`);
check("coin at player picked up (+1)", prox.found && prox.gotOwn);
check("coin in another lane untouched", prox.found && prox.keptFar);

// 7d. Regression: restart via KEYBOARD (r then p) must keep gestures wired.
const kb = await evalJs(`
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const T = window.__cvtest, body = window.__mkbody;
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'r', bubbles: true}));
    await sleep(1800); // player model reloads
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'p', bubbles: true}));
    await sleep(300);
    const ctl = T.control();
    const out = {started: ctl.gameStart};
    ctl.frontCollideCheckStatus = () => {};
    ctl.checkGameStatus = () => {};
    ctl.collideCheckAll = () => {
        ctl.downCollide = true;
        ctl.frontCollide = false;
        ctl.leftCollide = false;
        ctl.rightCollide = false;
    };
    T.inject(body(0.35, 0.6), window.__t += 500); await sleep(250);
    out.wayRight = ctl.way;
    T.inject(body(0.5, 0.6), window.__t += 33); await sleep(250);
    out.wayBack = ctl.way;
    return out;
})()
`);
check("keyboard r+p starts a run", kb.started);
check("gestures still drive the game after keyboard restart", kb.wayRight === 3 && kb.wayBack === 2);

// 7e. Re-calibrating AFTER a crash completes (status not stuck at 99%) but
// does NOT start a run by itself — New Game does.
const recal = await evalJs(`
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const T = window.__cvtest, body = window.__mkbody;
    const ctl = T.control();
    ctl.checkGameStatus = window.__savedChecks.game; // re-enable death
    ctl.smallMistake = 2;
    await sleep(300);
    const out = {ended: ctl.gameStatus === 'end'};
    document.getElementById('cv-calibrate').click();
    for (let i = 0; i < 30; i++) T.inject(body(0.5, 0.6), window.__t += 33);
    out.calibrated = T.interpreter.calibrated && !T.interpreter.debug.calibrating;
    out.statusSaysNewGame = /New Game/.test(document.getElementById('cv-status').textContent);
    await sleep(1500);
    out.notAutoStarted = T.control().gameStart !== true || T.control().status === 'die';
    T.newGame('Tester');
    let started = false;
    for (let i = 0; i < 15 && !started; i++) {
        await sleep(400);
        started = T.control().gameStart === true && T.control().status !== 'die';
    }
    const c2 = T.control();
    c2.frontCollideCheckStatus = () => {};
    c2.checkGameStatus = () => {};
    out.started = started;
    return out;
})()
`);
check("re-calibration after crash completes", recal.ended && recal.calibrated && recal.statusSaysNewGame);
check("re-calibration alone does not start a run", recal.notAutoStarted);
check("New Game after re-calibration starts the run", recal.started);

// 7f. Stop button: ends the run without a crash, shows the top three.
const stop = await evalJs(`
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const T = window.__cvtest;
    T.audio.crash.pause(); T.audio.crash.currentTime = 0;
    document.getElementById('cv-stop').click();
    await sleep(300);
    const ctl = T.control();
    const board = T.board.load();
    const out = {
        ended: ctl.gameStatus === 'end' && ctl.gameStart === false && ctl.status !== 'die',
        boardShown: document.getElementById('cv-board').hidden === false,
        // Several runs by the same nickname collapse into ONE row (best score).
        onePerPlayer: board.filter(e => e.name === 'Tester').length === 1 && board.length === 1,
        youText: /Tester/.test(document.getElementById('cv-board-you').textContent),
        confetti: !!document.getElementById('cv-confetti'),
        noCrashSound: T.audio.crash.currentTime === 0 && T.audio.crash.paused,
        statusStopped: /stopped/i.test(document.getElementById('cv-status').textContent),
        topThreeMax: document.querySelectorAll('#cv-board-list li').length <= 3,
    };
    // Back into a run for the remaining checks.
    T.newGame('Tester');
    let started = false;
    for (let i = 0; i < 15 && !started; i++) {
        await sleep(400);
        started = T.control().gameStart === true;
    }
    const c2 = T.control();
    c2.frontCollideCheckStatus = () => {};
    c2.checkGameStatus = () => {};
    out.restarted = started;
    return out;
})()
`);
check("Stop ends the run without a death", stop.ended && stop.noCrashSound && stop.statusStopped);
check("Stop shows the top-three leaderboard with confetti", stop.boardShown && stop.youText && stop.topThreeMax && stop.confetti);
check("leaderboard keeps one row per player (best score)", stop.onePerPlayer);
check("New Game after Stop runs again", stop.restarted);

// 7g. Framing guidance decisions (pure function on landmarks).
const guide = await evalJs(`
(() => {
    const T = window.__cvtest, body = window.__mkbody;
    const lm = (hipX, hipY, torso) => body(hipX, hipY, torso);
    const noShoulders = body(0.5, 0.6); noShoulders[11].visibility = 0;
    return JSON.stringify({
        none: T.framingProblem(null)?.[0],
        ok: T.framingProblem(lm(0.5, 0.6, 0.25)),
        close: T.framingProblem(lm(0.5, 0.9, 0.6))?.[0],
        far: T.framingProblem(lm(0.5, 0.6, 0.08))?.[0],
        left: T.framingProblem(lm(0.05, 0.6, 0.25))?.[0],
        shoulders: T.framingProblem(noShoulders)?.[0],
    });
})()
`).then(JSON.parse);
check("guidance: nothing shown when framed well", guide.ok === null);
check("guidance: out of frame / too close / too far / off-center detected",
    guide.none === 'Step into frame' && guide.close === 'Too close' && guide.far === 'Come closer'
    && guide.left === 'Move right ➜' && guide.shoulders === 'Show your shoulders');

// 8. Sensitivity sliders update the interpreter and persist
const tuning = await evalJs(`
(() => {
    const slider = document.getElementById('cv-lane');
    slider.value = '0.60';
    slider.dispatchEvent(new Event('input'));
    const opts = window.__cvtest.interpreter.opts;
    return JSON.stringify({
        laneEnter: opts.laneEnter,
        laneExitScaled: Math.abs(opts.laneExit - 0.60 * 0.66) < 1e-9,
        persisted: JSON.parse(localStorage.getItem('cv-tuning-v4') || '{}').laneEnter === 0.60,
    });
})()
`).then(JSON.parse);
check("slider updates threshold", tuning.laneEnter === 0.60);
check("hysteresis rescales with slider", tuning.laneExitScaled);
check("tuning persisted to localStorage", tuning.persisted);

// 9. English UI strings + layout pieces
const english = await evalJs(`JSON.stringify({
    stats: document.querySelectorAll('.score_panel .stat').length === 3,
    labels: ['Score', 'Coins', 'Mistakes'].every(t => document.body.textContent.includes(t)),
    noCJK: !/[\\u4e00-\\u9fff]/.test(document.querySelector('.score_container')?.textContent || ''),
    fullscreenBtn: !!document.getElementById('cv-fullscreen'),
})`).then(JSON.parse);
check("score panel: three separated stats in English", english.stats && english.labels && english.noCJK);
check("fullscreen button present", english.fullscreenBtn);

// 10. Endless-runner hygiene: old road sections get removed from the scene.
// (Runs last — it prunes the live sections.)
const prune = await evalJs(`
(() => {
    const ctl = window.__cvtest.control();
    const env = ctl.environement;
    const before = env.sections.filter(Boolean).length;
    const childrenBefore = ctl.scene.children.length;
    env.pruneBehind(env.sections.length + 2); // everything is "behind"
    return {
        before,
        after: env.sections.filter(Boolean).length,
        removed: childrenBefore - ctl.scene.children.length,
        arraysCleared: env.plane.every(p => !p) && env.coin.every(c => !c),
    };
})()
`);
check("road sections tracked", prune.before >= 1);
check("pruneBehind removes old sections from scene", prune.after === 0 && prune.removed === prune.before && prune.arraysCleared);
if (prune.after !== 0 || prune.removed !== prune.before || !prune.arraysCleared) console.log("    prune:", JSON.stringify(prune));

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot.result?.data && process.argv[3]) {
    const fs = await import("fs");
    fs.writeFileSync(process.argv[3], Buffer.from(shot.result.data, "base64"));
    console.log("  screenshot saved");
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
