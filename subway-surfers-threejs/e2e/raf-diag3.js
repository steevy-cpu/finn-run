(async () => {
  const T = window.__cvtest, c = T.control();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const measure = () => new Promise(res => { const f = []; let last = performance.now(), n = 0; const loop = t => { f.push(t - last); last = t; if (++n < 60) requestAnimationFrame(loop); else { const s = f.sort((a, b) => a - b); res(+s[30].toFixed(1)); } }; requestAnimationFrame(loop); });
  const out = {};
  T.intro.hide(); T.engine.stop();
  out.fresh = await measure();
  // 1. a god-mode run without any video, 6 s
  const c0 = T.control(); c0.frontCollideCheckStatus = () => {}; c0.checkGameStatus = () => {}; c0.collideCheckAll = () => { c0.downCollide = true; c0.frontCollide = false; c0.leftCollide = false; c0.rightCollide = false; };
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'p', bubbles: true})); await sleep(6000);
  out.duringRun = await measure();
  document.getElementById('cv-stop').click(); await sleep(400); document.getElementById('cv-board-close').click(); await sleep(300);
  out.afterRunNoVideo = await measure();
  // 2. play the catch video to the end
  T.catch.play(); let t = 0; while (T.catch.active && t < 8000) { await sleep(100); t += 100; }
  out.afterVideo = await measure();
  // 3. remove the video element entirely
  const cv = document.getElementById('cv-catch-video'); const parent = cv.parentElement; cv.remove(); await sleep(500);
  out.afterVideoRemoved = await measure();
  parent.prepend(cv);
  return JSON.stringify(out);
})()
