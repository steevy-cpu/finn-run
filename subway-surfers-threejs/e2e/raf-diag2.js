(async () => {
  const T = window.__cvtest, c = T.control();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const measure = () => new Promise(res => { const f = []; let last = performance.now(), n = 0; const loop = t => { f.push(t - last); last = t; if (++n < 60) requestAnimationFrame(loop); else { const s = f.sort((a, b) => a - b); res(+s[30].toFixed(1)); } }; requestAnimationFrame(loop); });
  const out = {};
  const cam = document.getElementById('cv-video'), cv = document.getElementById('cv-catch-video');
  out.camPaused = cam.paused; out.catchPaused = cv.paused; out.catchReady = cv.readyState; out.catchSrc = !!cv.src;
  out.asIs = await measure();
  T.engine.start(); await sleep(300); out.engineOn = await measure(); T.engine.stop();
  cam.pause(); await sleep(100); out.camPausedMeasure = await measure(); cam.play().catch(() => {});
  const src = cv.src; cv.removeAttribute('src'); cv.load(); await sleep(200); out.noCatchSrc = await measure(); cv.src = src; cv.load();
  await sleep(300); out.catchBack = await measure();
  // hide the intro/top3/catch layers? (display none) — test the fixed overlays
  const top3 = document.getElementById('cv-top3'); top3.style.display = 'none'; out.noTop3 = await measure(); top3.style.display = '';
  // the split handle / panel: toggle stats text updates? (none while engine stopped)
  // is the Time loop itself alive twice? count game update calls per second
  let n = 0; const g = c.game; const orig = g.update.bind(g); g.update = () => { n++; orig(); }; await sleep(1000); g.update = orig; out.gameUpdatesPerSec = n;
  out.timers = (() => { let k = 0; const t = setTimeout(() => {}, 0); clearTimeout(t); return t; })();
  return JSON.stringify(out);
})()
