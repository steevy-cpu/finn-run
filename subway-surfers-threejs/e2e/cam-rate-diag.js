(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = window.__cvtest, v = document.getElementById('cv-video'), game = T.control().game;
  T.intro.hide();
  const sample = async (label, secs) => {
    let vframes = 0, stop = false; const tick = () => { vframes++; if (!stop) v.requestVideoFrameCallback(tick); }; v.requestVideoFrameCallback(tick);
    let ctChanges = 0, lastCt = v.currentTime; let raf = 0; const rl = () => { raf++; if (v.currentTime !== lastCt) { ctChanges++; lastCt = v.currentTime; } if (!stop) requestAnimationFrame(rl); }; requestAnimationFrame(rl);
    const infer = []; const t0 = performance.now(); let poseFpsSum = 0, n = 0;
    while (performance.now() - t0 < secs * 1000) { await sleep(250); infer.push(T.engine.inferMs); poseFpsSum += T.engine.fps; n++; }
    stop = true;
    const s = v.srcObject.getVideoTracks()[0].getSettings();
    return {label, cameraSetting: `${s.width}x${s.height}@${Math.round(s.frameRate)}`, videoFramesPerSec: +(vframes / secs).toFixed(1), currentTimeChangesPerSec: +(ctChanges / secs).toFixed(1), rafPerSec: +(raf / secs).toFixed(1), poseFps: +(poseFpsSum / n).toFixed(1), inferMsAvg: +(infer.reduce((a, b) => a + b, 0) / infer.length).toFixed(1), inferMsMax: +Math.max(...infer).toFixed(1), gameFps: game.fps, mode: T.mode, locked: !!T.engine.track.locked};
  };
  const out = [];
  T.setMode('pose'); await sleep(1500); out.push(await sample('body idle (no run)', 8));
  const c = T.control(); c.frontCollideCheckStatus = () => {}; c.checkGameStatus = () => {}; c.collideCheckAll = () => { c.downCollide = true; c.frontCollide = false; c.leftCollide = false; c.rightCollide = false; };
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'p', bubbles: true})); await sleep(1500);
  out.push(await sample('body during run', 8));
  document.getElementById('cv-stop').click(); await sleep(300); document.getElementById('cv-board-close').click();
  T.setMode('hands'); await sleep(2500); out.push(await sample('hands idle', 8));
  T.setMode('pose');
  return JSON.stringify(out);
})()
