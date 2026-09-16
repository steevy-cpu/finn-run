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
const consoleErrors = [];
ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) pending.get(m.id)(m);
    if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        consoleErrors.push("exception: " + (d.exception?.description || d.text || "").slice(0, 160));
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        consoleErrors.push("console.error: " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    }
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

await send("Runtime.enable");
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

// 1b. Welcome screen (presentation pack): shown once on entry over the game
// pane, replaces the mask/HUD visually, LET'S RUN enabled once the camera
// (= New Game gate) is ready; "Go to game controls" only dismisses.
const intro0 = await evalJs(`JSON.stringify((() => { const T = window.__cvtest, el = T.intro?.element; if (!el) return {present: false};
    const start = el.querySelector('.frp-start'), dismiss = el.querySelector('.frp-dismiss');
    return {present: true, visible: !el.hidden && el.getClientRects().length > 0, attr: document.documentElement.dataset.intro === 'on',
        maskHidden: getComputedStyle(document.querySelector('.game-mask')).visibility === 'hidden',
        hudHidden: getComputedStyle(document.querySelector('.score_container')).visibility === 'hidden',
        inPane: el.parentElement === document.querySelector('.experience'),
        startEnabled: !start.disabled && /LET/.test(start.textContent), startFocused: document.activeElement === start,
        credits: /Steeve A\. Celestin/.test(el.textContent) && /MDC AI and Robotics Club/.test(el.textContent) && !!el.querySelector('.frp-club-logo') && !/Dodge obstacles/.test(el.textContent),
        startVisibleInPane: (() => { const r = start.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth / 2 + 1; })(),
        panelUsable: !document.getElementById('cv-newgame').disabled}; })())`).then(JSON.parse);
check("intro: shown on entry in the game pane, mask + HUD hidden", intro0.present && intro0.visible && intro0.attr && intro0.maskHidden && intro0.hudHidden && intro0.inPane);
check("intro: LET'S RUN enabled with the camera ready, focused, fully visible in the pane", intro0.startEnabled && intro0.startFocused && intro0.startVisibleInPane && intro0.panelUsable);
check("intro: credits (Steeve A. Celestin, MDC AI and Robotics Club) with the club logo", intro0.credits);
const intro1 = await evalJs(`JSON.stringify((() => { const T = window.__cvtest, el = T.intro.element; el.querySelector('.frp-dismiss').click();
    return {hidden: el.hidden, attr: document.documentElement.dataset.intro, maskVisible: getComputedStyle(document.querySelector('.game-mask')).visibility === 'visible',
        focus: document.activeElement === document.getElementById('cv-newgame'), started: T.control().gameStart}; })())`).then(JSON.parse);
check("intro: Go to game controls dismisses, restores the mask, focuses New Game, starts nothing", intro1.hidden && !intro1.attr && intro1.maskVisible && intro1.focus && !intro1.started);

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
// Stop is always available (admin): pre-game it just reveals the Top 3.
const stopIdle = await evalJs(`(() => {
    const T = window.__cvtest;
    T.board.save([{name: 'Nadia', score: 1000, coins: 3, at: 1}]);
    const visible = getComputedStyle(document.getElementById('cv-stop')).display !== 'none';
    document.getElementById('cv-stop').click();
    const shown = document.getElementById('cv-board').hidden === false
        && document.querySelectorAll('#cv-board-list li').length === 1;
    const notStarted = T.control().gameStart !== true;
    document.getElementById('cv-board-close').click();
    localStorage.removeItem('cv-leaderboard');
    return JSON.stringify({visible, shown, notStarted});
})()`).then(JSON.parse);
check("Stop button visible before any run", stopIdle.visible);
check("Stop outside a run reveals the Top 3 without starting", stopIdle.shown && stopIdle.notStarted);
check("English guide text shown", pre.guide);
// Remember the bind-pose spine rotation for the respawn check later.
await evalJs(`window.__bindSpine = window.__cvtest.control().model.getObjectByName('mixamorigSpine').quaternion.toArray(); 'ok'`);
check("no intro dance animation pre-game", !pre.danceRunning);
check("character faces the camera pre-game", pre.forwardZ > 0.9);
check("theme music silent pre-game", pre.themePaused);

// 2b. Mimicry is arms-only: legs never follow the player (pre-game or in-run).
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
check("legs never mimicked, pre-game included (arms only)", legs.hasLegBone && !legs.danceMoved);

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
check(`airtime plausible (${(jumpFast.airtimeMs / 1000).toFixed(2)}s; may land on a train roof)`, jumpFast.airtimeMs > 350 && jumpFast.airtimeMs < 1300);

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

// 7h. Multi-person selection: the player in the guidance zone wins over a
// background person, even when the background person is nearer the frame
// center — and the lock band is centered on the calibrated target.
const pick = await evalJs(`
(() => {
    const T = window.__cvtest, body = window.__mkbody;
    const bg = body(0.52, 0.42, 0.10);       // small (far) person near frame center
    const player = body(0.30, 0.60, 0.28);   // big (near) person, left of center
    const wasCalibrated = T.interpreter.calibrated;
    const savedCalib = T.interpreter.calib;
    // Case A: calibrated target at the player's spot → player chosen.
    T.interpreter.calib = {...savedCalib, hipX: 0.30, hipY: 0.60};
    const a = T.engine.pickPose([bg, player]) === player;
    // Case B: calibrated target near the background person's spot but the
    // bystander is tiny → the big body still wins (score in own torso units).
    T.interpreter.calib = {...savedCalib, hipX: 0.45, hipY: 0.5};
    const b = T.engine.pickPose([bg, player]) === player;
    // Case C: two similar bodies → the one nearer the target wins.
    const p2 = body(0.70, 0.60, 0.28);
    // synthetic bodies leave unused joints at the frame center — pin the
    // nose/knees/ankles under this body so its bounding box is honest
    for (const [i, y] of [[0, 0.25], [25, 0.75], [26, 0.75], [27, 0.92], [28, 0.92]]) p2[i] = {x: 0.70, y, z: 0, visibility: 1};
    T.interpreter.calib = {...savedCalib, hipX: 0.70, hipY: 0.60};
    const c = T.engine.pickPose([player, p2]) === p2;
    // Lock band centered on the target and wide enough for lane steps.
    T.engine.track.roi = null;
    T.engine._updateRoi(p2);
    const roi = T.engine.track.roi;
    const d = roi && roi.w >= 0.55 && Math.abs((roi.x + roi.w / 2) - 0.70) < 0.06;
    T.interpreter.calib = savedCalib; T.interpreter.calibrated = wasCalibrated;
    T.engine.track.roi = null; T.engine.track.locked = false;
    return JSON.stringify({a, b, c, d, none: T.engine.pickPose([]) === null});
})()
`).then(JSON.parse);
check("picks the player in the guidance zone over a background person", pick.a && pick.b && pick.none);
check("between similar bodies picks the one nearest the calibrated spot", pick.c);
check("lock band centered on the player, wide enough for lane steps", pick.d);

// 7i. Seated / hands mode: switch, calibrate on the hands, drive the game.
const handsMode = await evalJs(`
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const T = window.__cvtest;
    const hands = (cx, cy, o = {}) => {
        const lm = Array.from({length: 33}, () => ({x: .5, y: .5, z: 0, visibility: 1}));
        lm[11] = {x: cx + .10, y: cy - .25, z: 0, visibility: 1};
        lm[12] = {x: cx - .10, y: cy - .25, z: 0, visibility: 1};
        lm[15] = {x: o.lx ?? cx + .15, y: o.ly ?? cy, z: 0, visibility: 1};
        lm[16] = {x: o.rx ?? cx - .15, y: o.ry ?? cy, z: 0, visibility: 1};
        return lm;
    };
    const out = {};
    T.setMode('hands');
    out.mode = T.mode === 'hands' && T.interpreter.mode === 'hands';
    out.modalToggle = !!document.getElementById('cv-name-hands');
    out.guideHands = T.framingProblem(hands(0.5, 0.6))?.[0];
    const noHands = hands(0.5, 0.6); noHands[16].visibility = 0;
    out.guideNoHands = T.framingProblem(noHands)?.[0];
    // calibrate on the hands (aspect-corrected units come from the real video)
    const A = T.interpreter.opts.aspect;
    T.interpreter.startCalibration();
    for (let i = 0; i < 30; i++) T.inject(hands(0.5, 0.6), window.__t += 33);
    out.calibrated = T.interpreter.calibrated;
    const ctl = T.control();
    ctl.collideCheckAll = () => { ctl.downCollide = true; ctl.frontCollide = false; ctl.leftCollide = false; ctl.rightCollide = false; };
    // both hands up 0.06 → 0.06/(0.2*A) widths ≥ 0.15 for any aspect ≤ 2
    T.inject(hands(0.5, 0.6, {ly: 0.54, ry: 0.54}), window.__t += 500);
    out.jumpKey = ctl.key;
    T.inject(hands(0.5, 0.6), window.__t += 700);
    await sleep(300);
    // right hand out 0.22 raw → 0.22*A/(0.2*A) = 1.1 widths > laneEnter 0.55
    T.inject(hands(0.5, 0.6, {rx: 0.13}), window.__t += 33); await sleep(250);
    out.wayRight = ctl.way;
    T.inject(hands(0.5, 0.6), window.__t += 33); await sleep(250);
    out.wayCenter = ctl.way;
    // The hand tracker model loads lazily on the first seated-mode frame.
    T.engine._detectHands(T.engine.procCanvas, null, performance.now(), null);
    for (let i = 0; i < 40 && !T.engine.handLandmarker; i++) await sleep(250);
    out.handModel = !!T.engine.handLandmarker;
    // Palm-scaled tracking needs no shoulders/hips at all.
    const palmOnly = hands(0.5, 0.6); palmOnly[11].visibility = 0; palmOnly[12].visibility = 0; palmOnly[23].visibility = 0; palmOnly.palm = 0.045;
    out.palmGuide = T.framingProblem(Object.assign(palmOnly, {hands: [[], []]})) === null;
    T.setMode('pose');
    out.back = T.mode === 'pose' && T.interpreter.mode !== 'hands';
    return out;
})()
`);
check("hands mode: hand tracker model loads (vendored)", handsMode.handModel);
check("hands mode: framed fine with just the two hands", handsMode.palmGuide);
check("hands mode: switch + toggle in New Game prompt", handsMode.mode && handsMode.modalToggle && handsMode.back);
check("hands mode: guidance asks for both hands", handsMode.guideHands === undefined && handsMode.guideNoHands === 'Show both hands');
check("hands mode: calibrates on the hands", handsMode.calibrated);
check("hands mode: both hands up → jump", handsMode.jumpKey === 'w');
check("hands mode: right hand out → right lane, back → center", handsMode.wayRight === 3 && handsMode.wayCenter === 2);
check("guidance: out of frame / too close / too far / off-center detected",
    guide.none === 'Step into frame' && guide.close === 'Too close' && guide.far === 'Come closer'
    && guide.left === 'Move right ➜' && guide.shoulders === 'Show your shoulders');

// 7j. Phase 5 VFX: accepted game events only, one burst each, cleared on end.
const vfx = await evalJs(`
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const T = window.__cvtest, fx = T.fx, ctl = T.control();
    const alive = list => list.filter(p => p.alive).length;
    const out = {running: fx.pool.running, inScene: !!ctl.scene.getObjectByName('finn-vfx')};
    // coin: exactly one ring + 4 sparks per collected coin, none on a repeat
    fx.clear();
    const nowPlane = Math.floor(ctl.playerRunDistance / T.roadLength);
    let mesh = null; ctl.environement.coin[nowPlane]?.traverse(m => { if (!mesh && m.isMesh && m.name === 'coin') mesh = m; });
    if (mesh) { ctl.collectCoin({object: mesh}); out.ringsAfterCoin = alive(fx.pool.rings); out.sparksAfterCoin = alive(fx.pool.particles);
        ctl.collectCoin({object: mesh}); out.ringsAfterRepeat = alive(fx.pool.rings); }
    // jump: dust on an accepted takeoff; a mid-air press (rejected/buffered) adds none
    fx.clear();
    while (!ctl.downCollide) await sleep(50);
    ctl.doJump(); out.dustAfterJump = alive(fx.pool.particles);
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'w', bubbles: true})); // mid-air → buffered, no burst now
    out.dustAfterMidAirPress = alive(fx.pool.particles);
    // landing: exactly one landing burst (2 dust) — wait for touchdown, count new dust
    let landed = false;
    for (let i = 0; i < 80 && !landed; i++) { await sleep(25); landed = !ctl.jumpAirborne; }
    out.landed = landed; out.landingConsumedFlag = ctl.jumpAirborne === false;
    // effects never intersect collision rays
    const ray = ctl.raycasterDown; out.rayIgnores = ray.intersectObject(ctl.scene.getObjectByName('finn-vfx'), true).length === 0;
    // stop/end clears the pool
    fx.coin({x: 0, y: 1, z: ctl.model.position.z}); out.beforeEnd = alive(fx.pool.rings) > 0;
    ctl.checkGameStatus = window.__savedChecks.game; ctl.smallMistake = 2; await sleep(250);
    out.clearedOnEnd = fx.pool.running === false && alive(fx.pool.items) === 0;
    // back to a run for the remaining sections
    T.newGame('Tester');
    let started = false; for (let i = 0; i < 15 && !started; i++) { await sleep(400); started = T.control().gameStart === true; }
    const c2 = T.control(); c2.frontCollideCheckStatus = () => {}; c2.checkGameStatus = () => {};
    out.runningAgain = started && fx.pool.running === true;
    return out;
})()
`);
check("VFX runs only during a live run, under the scene root", vfx.running && vfx.inScene && vfx.runningAgain);
check("VFX: exactly one ring + sparks per collected coin, none on repeat", vfx.ringsAfterCoin === 1 && vfx.sparksAfterCoin === 4 && vfx.ringsAfterRepeat === 1);
check("VFX: dust on accepted takeoff, none for a mid-air press", vfx.dustAfterJump === 3 && vfx.dustAfterMidAirPress === 3);
check("VFX: landing consumed the one-shot flag", vfx.landed && vfx.landingConsumedFlag);
check("VFX: collision rays ignore effects; end clears the pool", vfx.rayIgnores && vfx.beforeEnd && vfx.clearedOnEnd);

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
        persisted: JSON.parse(localStorage.getItem('cv-tuning-v4-pose') || '{}').laneEnter === 0.60,
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

// 11. UI mode (Phase 4 redesign is opt-in): the root attribute follows the
// URL flag, the control-mode switch drives the same setMode/persistence,
// dialogs return focus to their opener, and hidden dialogs are not focusable.
const ui = await evalJs(`
(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const T = window.__cvtest, out = {};
    const q = new URLSearchParams(location.search).get('ui');
    out.attr = document.documentElement.dataset.ui;
    out.attrMatchesFlag = out.attr === (q === 'phase4' ? 'phase4' : 'original');
    // Phase-4-only elements (.p4) are display:none in the original UI, so
    // they have no box (offsetParent null) and cannot be tabbed to.
    out.phase4Hidden = out.attr === 'phase4'
        ? document.getElementById('cv-modes').getClientRects().length > 0
        : [...document.querySelectorAll('.p4')].every(el => el.getClientRects().length === 0);
    // Control-mode switch: locked while a run is live, then ↔ setMode.
    const ctl = T.control();
    const live = ctl.gameStart === true && ctl.gameStatus === 'start';
    out.lockedDuringRun = !live || (document.getElementById('cv-mode-hands').disabled
        && document.getElementById('cv-mode-pose').disabled);
    if (live) { document.getElementById('cv-stop').click(); await sleep(100); document.getElementById('cv-board-close').click(); }
    out.unlockedAfterRun = !document.getElementById('cv-mode-hands').disabled;
    document.getElementById('cv-mode-hands').click();
    out.switchToHands = T.mode === 'hands' && localStorage.getItem('cv-mode') === 'hands'
        && document.getElementById('cv-mode-hands').getAttribute('aria-pressed') === 'true'
        && document.getElementById('cv-mode-pose').getAttribute('aria-pressed') === 'false';
    document.getElementById('cv-mode-pose').click();
    out.switchToPose = T.mode === 'pose' && localStorage.getItem('cv-mode') === 'pose'
        && document.getElementById('cv-mode-pose').getAttribute('aria-pressed') === 'true';
    // Focus: New Game → dialog focuses the input; Escape returns focus to New Game.
    const ng = document.getElementById('cv-newgame');
    ng.focus(); ng.click(); await sleep(50);
    out.inputFocused = document.activeElement === document.getElementById('cv-name-input');
    document.getElementById('cv-name-input').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    out.focusReturned = document.getElementById('cv-name').hidden && document.activeElement === ng;
    // Hidden dialogs: not rendered, so nothing inside them can take focus.
    document.getElementById('cv-name-input').focus();
    out.hiddenNotFocusable = document.getElementById('cv-name-input').offsetParent === null
        && document.activeElement !== document.getElementById('cv-name-input');
    // Dialog semantics.
    out.dialogAria = ['cv-name', 'cv-board'].every(id => {
        const d = document.getElementById(id);
        return d.getAttribute('role') === 'dialog' && document.getElementById(d.getAttribute('aria-labelledby'));
    });
    // HUD contract: the values still come from the game's own data event.
    out.hudStats = document.querySelectorAll('.score_panel .stat').length === 3;
    return JSON.stringify(out);
})()
`).then(JSON.parse);
check("ui: root data-ui follows the ?ui flag (default original)", ui.attrMatchesFlag);
check("ui: phase4-only controls hidden in the original UI", ui.phase4Hidden);
check("ui: control-mode switch locked during a live run, free after", ui.lockedDuringRun && ui.unlockedAfterRun);
check("ui: Body/Hand Control switch drives setMode + persists", ui.switchToHands && ui.switchToPose);
check("ui: New Game dialog focuses input, Escape returns focus", ui.inputFocused && ui.focusReturned);
check("ui: hidden dialog controls are not focusable", ui.hiddenNotFocusable);
check("ui: dialogs are labelled role=dialog", ui.dialogAria);
const split = await evalJs(`JSON.stringify((() => { const T = window.__cvtest, exp = document.querySelector('.experience'), panel = document.getElementById('cv-panel');
    const w0 = exp.clientWidth; T.split(60); const w1 = exp.clientWidth; const p1 = panel.getBoundingClientRect().left;
    const game = T.control().game; const sized = Math.abs(game.sizes.width - w1) < 2; const catchW = document.querySelector('.game-mask').getBoundingClientRect().width; // a visible pane-wide layer
    T.split(50); const w2 = exp.clientWidth;
    return {w0, w1, p1, sized, catchW, w2, handle: !!document.getElementById('cv-splitter') && document.getElementById('cv-splitter').getAttribute('role') === 'separator'}; })())`).then(JSON.parse);
check("ui: draggable split resizes the game pane, panel, overlays and the renderer together", split.handle && Math.round(split.w1) === Math.round(window_w(split, 0.6)) && Math.round(split.p1) === Math.round(split.w1) && split.sized && Math.round(split.catchW) === Math.round(split.w1) && Math.round(split.w2) === Math.round(split.w0));
function window_w(s, f) { return (s.w0 / 0.5) * f; }
check("no uncaught exceptions / console errors during the run", consoleErrors.length === 0);
if (consoleErrors.length) console.log("    errors:", consoleErrors.slice(0, 5).join(" | "));

// 12. Phase 7 pursuer (only when ?arturo=1 loaded an actor): observes game
// state, one actor/mixer, reattached after restart, reacts once per committed
// mistake, never touches collision/game-over, disposed cleanly.
const hasPursuer = await evalJs(`!!window.__cvtest.pursuer`);
if (hasPursuer) {
    const pr = await evalJs(`
    (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const T = window.__cvtest, p = T.pursuer, out = {};
        out.loaded = p.state === 'ready' && !!p.report && p.group.children.length === 1;
        out.clipsMapped = !!p.clips.run && !!p.clips.idle;
        out.noRaycast = (() => { let ok = true; p.group.traverse(o => { if (o.isMesh && o.raycast !== undefined && o.raycast.length !== 0) ok = false; }); return ok; })();
        out.notReservedNames = (() => { let ok = true; p.group.traverse(o => { if (['train','kerbStone','coin','plane'].includes(o.name)) ok = false; }); return ok; })();
        // Fresh run: New Game (calibrated) → r → ready (hidden, scene emptied) → countdown → start (attached)
        T.newGame('Tester'); await sleep(700);
        out.hiddenOnReady = p.active === false && p.group.visible === false && !T.control().scene.getObjectByName('pursuer');
        let started = false; for (let i = 0; i < 15 && !started; i++) { await sleep(400); started = T.control().gameStart === true; }
        const c = T.control(); c.frontCollideCheckStatus = () => {}; c.checkGameStatus = () => {};
        await sleep(700);
        out.attachedOnStart = started && c.scene.children.filter(o => o.name === 'pursuer').length === 1 && p.active && p.current === 'run';
        out.oneMixer = !!p.mixer && c.game.pursuer === p;
        const f = c.model.position, g = p.group.position;
        out.behindFinn = g.z > f.z + 2 && g.z < f.z + 9; // +Z is behind (Finn runs toward -Z)
        out.onGround = Math.abs(g.y - f.y) < 0.6;
        out.gapReset = Math.abs(p.gap - p.opts.gap) < 0.6;
        // Committed-mistake reaction: once per increase, not per frame.
        const r0 = p.reactions, m0 = c.smallMistake; c.smallMistake = m0 + 1; await sleep(400);
        out.reactsOnce = p.reactions - r0 === 1 && p.gapTarget < p.opts.gap;
        await sleep(400); out.noRepeat = p.reactions - r0 === 1;
        // Zero influence: mistakes/status are exactly what the game set.
        out.noInfluence = c.smallMistake === m0 + 1 && c.gameStatus === 'start' && c.gameStart === true;
        // Stop → end: idle, inactive, no crash/death caused by the pursuer.
        document.getElementById('cv-stop').click(); await sleep(300);
        out.idleOnEnd = p.current === 'idle' && p.active === false && c.status !== 'die';
        document.getElementById('cv-board-close').click();
        // Dispose: resources released, listener removed, group gone.
        const before = c.game.renderer.renderer.info.memory.geometries;
        p.dispose(); await sleep(100);
        out.disposed = p.state === 'idle' && !p.mixer && p.group.parent === null && p.group.children.length === 0;
        c.game.emit('gameStatus', 'start'); await sleep(50);
        out.listenerGone = p.active === false && p.group.parent === null;
        c.game.emit('gameStatus', 'end');
        return JSON.stringify(out);
    })()
    `).then(JSON.parse);
    check("pursuer: actor loaded once with run + idle mapped", pr.loaded && pr.clipsMapped && pr.oneMixer);
    check("pursuer: cosmetic meshes unpickable, no reserved names", pr.noRaycast && pr.notReservedNames);
    check("pursuer: hidden on ready, one group reattached on start", pr.hiddenOnReady && pr.attachedOnStart);
    check("pursuer: behind Finn on the ground, gap reset per run", pr.behindFinn && pr.onGround && pr.gapReset);
    check("pursuer: reacts once per committed mistake", pr.reactsOnce && pr.noRepeat);
    check("pursuer: zero influence on mistakes / game state", pr.noInfluence);
    check("pursuer: idles on end, disposes cleanly, listener removed", pr.idleOnEnd && pr.disposed && pr.listenerGone);
    if (Object.values(pr).some(v => v === false)) console.log("    pursuer:", JSON.stringify(pr));
}

// 13. Catch cinematic (only when ?catchVideo=1 with ?arturo=1): one playback
// per game over, Skip/Escape/ended converge without duplicate results,
// missing media falls back at once, restart cancels, reduced motion bypasses.
const catchOn = await evalJs(`!!window.__cvtest.catch?.enabled`);
if (catchOn) {
    await evalJs(`window.__cvtest.catch.cancel('test-reset'); 'ok'`);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const S = () => evalJs(`JSON.stringify({...window.__cvtest.catch.stats, active: window.__cvtest.catch.active, shown: document.getElementById('cv-catch').classList.contains('on'), paused: window.__cvtest.catch.video.paused})`).then(JSON.parse);
    // a) reduced motion → bypass
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const b0 = await S();
    await evalJs(`window.__cvtest.control().game.emit('gameStatus', 'end'); 'ok'`); await sleep(150);
    const b1 = await S();
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    check("catch: reduced motion bypasses the cinematic (results immediately)", b1.bypassed === b0.bypassed + 1 && b1.plays === b0.plays && !b1.shown);
    // b) missing media → immediate fallback; duplicate game-over cannot start a second playback
    await evalJs(`window.__cvtest.catch.setSrc('/assets/video/does-not-exist.mp4'); 'ok'`); await sleep(300);
    const m0 = await S();
    await evalJs(`const g = window.__cvtest.control().game; g.emit('gameStatus', 'end'); g.emit('gameStatus', 'end'); 'ok'`);
    let m1; for (let i = 0; i < 40; i++) { await sleep(100); m1 = await S(); if (!m1.active) break; }
    check("catch: missing media falls back to results at once, one play, one exit", m1.plays === m0.plays + 1 && m1.exits === m0.exits + 1 && !m1.shown && /play-rejected|media-error|load-timeout/.test(m1.lastReason));
    check("catch: focus lands on New Game after fallback", await evalJs(`document.activeElement === document.getElementById('cv-newgame')`));
    // c) real media (if present): plays, Skip / Escape / ended / restart all converge once
    const hasMp4 = await evalJs(`fetch('/assets/video/arturo-catch.mp4', {method: 'HEAD'}).then(r => r.ok).catch(() => false)`);
    if (hasMp4) {
        await evalJs(`window.__cvtest.catch.setSrc('/assets/video/arturo-catch.mp4'); 'ok'`);
        for (let i = 0; i < 50; i++) { await sleep(100); if (await evalJs(`window.__cvtest.catch.video.readyState >= 1`)) break; }
        const r0 = await S();
        await evalJs(`window.__cvtest.control().game.emit('gameStatus', 'end'); 'ok'`);
        let r1; for (let i = 0; i < 30; i++) { await sleep(100); r1 = await S(); if (!r1.paused) break; }
        const skipFocused = await evalJs(`document.activeElement === document.getElementById('cv-catch-skip')`);
        check("catch: real clip plays over the game pane with Skip focused", r1.plays === r0.plays + 1 && r1.shown && !r1.paused && skipFocused);
        await evalJs(`document.getElementById('cv-catch-skip').click(); 'ok'`); await sleep(100);
        const r2 = await S();
        check("catch: Skip exits once, pauses the clip, hides the overlay", r2.exits === r0.exits + 1 && r2.lastReason === 'skip' && !r2.shown && r2.paused && !r2.active);
        await evalJs(`window.__cvtest.control().game.emit('gameStatus', 'end'); 'ok'`); await sleep(400);
        await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); 'ok'`); await sleep(100);
        const r3 = await S();
        check("catch: Escape skips", r3.lastReason === 'escape' && !r3.shown && r3.exits === r0.exits + 2);
        await evalJs(`window.__cvtest.control().game.emit('gameStatus', 'end'); 'ok'`); await sleep(400);
        await evalJs(`window.__cvtest.control().game.emit('gameStatus', 'ready'); 'ok'`); await sleep(100);
        const r4 = await S();
        check("catch: restart (ready) cancels playback", r4.lastReason === 'status:ready' && !r4.shown);
        // The real 'ready' handler runs the 3-2-1 countdown and auto-starts a
        // run; let that settle (god-mode it) so its 'start' cannot cancel the
        // natural-end playback below.
        { let started = false; for (let i = 0; i < 15 && !started; i++) { await sleep(400); started = await evalJs(`window.__cvtest.control().gameStart === true`); } }
        await evalJs(`(() => { const c = window.__cvtest.control(); c.frontCollideCheckStatus = () => {}; c.checkGameStatus = () => {}; c.collideCheckAll = () => { c.downCollide = true; c.frontCollide = false; c.leftCollide = false; c.rightCollide = false; }; return 'ok'; })()`);
        await evalJs(`window.__cvtest.control().game.emit('gameStatus', 'end'); 'ok'`);
        let r5; for (let i = 0; i < 80; i++) { await sleep(100); r5 = await S(); if (!r5.active) break; }
        check("catch: natural end converges to results exactly once", r5.lastReason === 'ended' && r5.exits === r0.exits + 4 && r5.plays === r0.plays + 4);
    } else {
        console.log("  (catch: arturo-catch.mp4 not present — real-clip checks skipped)");
    }
    const kept = await evalJs(`JSON.stringify({board: window.__cvtest.board.load().length > 0, status: /crashed|New Game/i.test(document.getElementById('cv-status').textContent)})`).then(JSON.parse);
    check("catch: leaderboard record and results text preserved", kept.board && kept.status);
}

// 14. Welcome screen paths: LET'S RUN → existing nickname prompt; camera-panel
// New Game hides the intro; Escape dismisses; reduced motion → static title;
// missing art → gradient fallback; no intro after a run/restart.
{
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const w = await evalJs(`
    (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const T = window.__cvtest, out = {};
        document.getElementById('cv-board-close').click(); document.getElementById('cv-name-cancel').click();
        out.notShownAfterRun = T.intro.element.hidden;
        T.intro.show(); await sleep(50);
        const before = T.control().gameStatus + ':' + T.control().gameStart;
        T.intro.element.querySelector('.frp-start').click(); await sleep(50);
        out.startOpensNamePrompt = T.intro.element.hidden && !document.getElementById('cv-name').hidden && !document.documentElement.dataset.intro;
        out.noRunStarted = (T.control().gameStatus + ':' + T.control().gameStart) === before; // the prompt opened, nothing else changed
        document.getElementById('cv-name-cancel').click();
        T.intro.show(); await sleep(50);
        document.getElementById('cv-newgame').click(); await sleep(50);
        out.panelNewGameHidesIntro = T.intro.element.hidden && !document.getElementById('cv-name').hidden;
        document.getElementById('cv-name-cancel').click();
        T.intro.show(); await sleep(50);
        T.intro.element.querySelector('.frp-start').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); await sleep(50);
        out.escapeDismisses = T.intro.element.hidden && document.activeElement === document.getElementById('cv-newgame');
        // missing art → fallback class, controls still usable
        T.intro.show(); await sleep(50);
        const img = T.intro.element.querySelector('img');
        await new Promise(r => { img.addEventListener('error', r, {once: true}); img.src = '/assets/images/does-not-exist.png'; });
        out.missingArtFallback = T.intro.element.classList.contains('frp-no-art') && !T.intro.element.querySelector('.frp-start').disabled;
        img.src = '/assets/images/finn-intro-hero.png';
        return JSON.stringify(out);
    })()
    `).then(JSON.parse);
    check("intro: not shown again after a run; LET'S RUN opens the existing nickname prompt without starting", w.notShownAfterRun && w.startOpensNamePrompt && w.noRunStarted);
    check("intro: camera-panel New Game hides the intro first", w.panelNewGameHidesIntro);
    check("intro: Escape dismisses to game controls", w.escapeDismisses);
    check("intro: missing art falls back to the gradient with controls usable", w.missingArtFallback);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const rm = await evalJs(`getComputedStyle(window.__cvtest.intro.element.querySelector('.frp-title')).animationName`);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    const rm2 = await evalJs(`getComputedStyle(window.__cvtest.intro.element.querySelector('.frp-title')).animationName`);
    check("intro: reduced motion gives a static title (animation only otherwise)", rm === 'none' && rm2 === 'frp-enter');
    await evalJs(`window.__cvtest.intro.hide(); 'ok'`);
}

// 15. Booth settings: camera section (device list, preset applies, exposure
// lock reports support honestly) and the two-step leaderboard reset.
{
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const cam = await evalJs(`
    (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const T = window.__cvtest, out = {};
        await T.camera.refresh();
        const dev = document.getElementById('cv-cam-device');
        out.devices = dev.options.length; out.currentSelected = dev.value === (T.camera.track()?.getSettings().deviceId || '');
        out.infoText = document.getElementById('cv-cam-info').textContent;
        const before = T.camera.track().getSettings();
        await T.camera.applyPreset('640x360@30'); await sleep(300);
        const after = T.camera.track().getSettings();
        out.presetApplied = after.width === 640 && after.height === 360 && document.getElementById('cv-overlay').width === 640;
        out.aspectKept = Math.abs(T.interpreter.opts.aspect - after.width / after.height) < 0.01;
        await T.camera.applyPreset('1280x720@60'); await sleep(300);
        out.restored = T.camera.track().getSettings().width === before.width;
        const caps = T.camera.track().getCapabilities ? T.camera.track().getCapabilities() : {};
        const canLock = Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual');
        const lock = document.getElementById('cv-cam-lock');
        out.lockHonest = canLock ? !lock.disabled : (lock.disabled && /not supported/.test(document.getElementById('cv-cam-info').textContent));
        out.saved = localStorage.getItem('cv-cam-res') === '1280x720@60';
        return JSON.stringify(out);
    })()
    `).then(JSON.parse);
    check("camera settings: device list + live readout, preset applies and overlay follows", cam.devices >= 1 && cam.currentSelected && /fps/.test(cam.infoText) && cam.presetApplied && cam.aspectKept && cam.restored && cam.saved);
    check("camera settings: exposure lock reports support honestly", cam.lockHonest);
    const reset = await evalJs(`
    (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const T = window.__cvtest, out = {};
        T.board.save([{name: 'A', score: 500, coins: 1, at: 1}, {name: 'B', score: 200, coins: 0, at: 2}]);
        const b = document.getElementById('cv-board-reset');
        b.click(); await sleep(50);
        out.armedNotCleared = b.classList.contains('arm') && T.board.load().length === 2;
        b.click(); await sleep(50);
        out.cleared = T.board.load().length === 0 && !b.classList.contains('arm') && /cleared/i.test(document.getElementById('cv-board-reset-note').textContent);
        document.getElementById('cv-stop').click(); await sleep(100);
        out.boardEmptyRow = /No runs yet/.test(document.getElementById('cv-board-list').textContent);
        document.getElementById('cv-board-close').click();
        // an un-confirmed arm expires
        T.board.save([{name: 'C', score: 100, coins: 0, at: 3}]); b.click(); await sleep(4300);
        out.armExpires = !b.classList.contains('arm') && T.board.load().length === 1;
        T.board.save([]);
        return JSON.stringify(out);
    })()
    `).then(JSON.parse);
    check("booth: leaderboard reset needs a second click, clears all scores, arm expires", reset.armedNotCleared && reset.cleared && reset.boardEmptyRow && reset.armExpires);
    const top3 = await evalJs(`JSON.stringify((() => { const T = window.__cvtest, el = document.getElementById('cv-top3'), list = document.getElementById('cv-top3-list');
        const r = el.getBoundingClientRect(); const pane = document.querySelector('.experience').getBoundingClientRect();
        T.board.save([{name: 'Zed', score: 900, coins: 2, at: 1}, {name: 'Amy', score: 700, coins: 1, at: 2}, {name: 'Bo', score: 100, coins: 0, at: 3}, {name: 'Cy', score: 50, coins: 0, at: 4}]);
        const rows = [...list.querySelectorAll('li')].map(li => li.textContent.replace(/\s+/g, ' ').trim());
        T.board.save([]);
        const empty = /No runs yet/.test(list.textContent);
        return {topLeft: r.left < 40 && r.top < 40 && r.right < pane.right, visible: getComputedStyle(el).visibility === 'visible', rows, empty}; })())`).then(JSON.parse);
    check("top 3 widget: top-left of the game pane, three rows in order, live with the board", top3.topLeft && top3.visible && top3.rows.length === 3 && /Zed.*900/.test(top3.rows[0]) && /Amy.*700/.test(top3.rows[1]) && /Bo.*100/.test(top3.rows[2]) && top3.empty);
}

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot.result?.data && process.argv[3]) {
    const fs = await import("fs");
    fs.writeFileSync(process.argv[3], Buffer.from(shot.result.data, "base64"));
    console.log("  screenshot saved");
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
