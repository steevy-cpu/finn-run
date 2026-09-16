// Soak / stress test: drives many complete booth cycles (New Game → run with
// gestures → crash or Stop → results / catch video → restart) against the
// served build and snapshots resource counters with a forced GC.
// Usage: node e2e/soak.mjs <debug-port> <lastCycle> [snapshotEvery] [firstCycle]  (chunkable; the page keeps its state between chunks)
// Chrome must be launched as for the e2e (fake camera, remote debugging).
const [port, cyclesArg, everyArg, fromArg] = process.argv.slice(2);
const cycles = Number(cyclesArg || 100), every = Number(everyArg || 10), from = Number(fromArg || 1);
const snapshotCode = (await import('fs')).readFileSync(new URL('./soak-snapshot.js', import.meta.url), 'utf8');
const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = list.find(t => t.type === 'page' && t.url.includes('5180'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('ERR ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 160)); };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({id: i, method: m, params: p})); });
const ev = async x => { const r = await send('Runtime.evaluate', {expression: x, returnByValue: true, awaitPromise: true}); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Runtime.enable'); await send('HeapProfiler.enable'); await send('Performance.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
for (let i = 0; i < 90; i++) { if (await ev('!!window.__cvtest?.control?.() && !document.getElementById("cv-newgame").disabled').catch(() => false)) break; await sleep(1000); }
await sleep(1000);
// synthetic bodies/hands for calibration + gestures (the fake camera has no person)
await ev(`window.__soak = { body: (cx, cy, o = {}) => { const lm = Array.from({length: 33}, () => ({x: cx, y: cy, z: 0, visibility: 1}));
  lm[11]={x:cx+.12,y:cy-.2,z:0,visibility:1}; lm[12]={x:cx-.12,y:cy-.2,z:0,visibility:1}; lm[23]={x:cx+.08,y:cy,z:0,visibility:1}; lm[24]={x:cx-.08,y:cy,z:0,visibility:1};
  lm[27]={x:cx+.08,y:cy+.45,z:0,visibility:1}; lm[28]={x:cx-.08,y:cy+.45,z:0,visibility:1}; lm[0]={x:cx,y:cy-.33,z:0,visibility:1}; lm[7]={x:cx+.04,y:cy-.33,z:0,visibility:1}; lm[8]={x:cx-.04,y:cy-.33,z:0,visibility:1};
  lm[15]={x:o.lx ?? cx+.15,y:o.ly ?? cy,z:0,visibility:1}; lm[16]={x:o.rx ?? cx-.15,y:o.ry ?? cy,z:0,visibility:1}; return lm; }, t: 1000 }; 'ok'`);
await ev(`window.__cvtest.intro?.hide?.(); 'ok'`);
const snapshot = async (label) => {
  await send('HeapProfiler.collectGarbage'); await sleep(150);
  const m = (await send('Performance.getMetrics')).result.metrics; const g = n => m.find(x => x.name === n)?.value;
  const page = JSON.parse(await ev(snapshotCode));
  const row = {label, heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(1), nodes: g('Nodes'), listeners: g('JSEventListeners'), documents: g('Documents'), ...page, errors: errors.length};
  console.log(JSON.stringify(row)); return row;
};
const rows = [await snapshot(from === 1 ? 'start' : 'chunk start ' + from)];
const t0 = Date.now();
for (let k = from; k <= cycles; k++) {
  const hands = k % 5 === 0, stop = k % 3 === 0, skip = k % 2 === 0, recal = k % 7 === 0;
  await ev(`(() => { const T = window.__cvtest; T.engine.stop(); T.setMode(${hands ? "'hands'" : "'pose'"}); if (${recal} || !T.interpreter.calibrated) { T.interpreter.startCalibration(); for (let i = 0; i < 30; i++) T.inject(window.__soak.body(0.5, 0.6), window.__soak.t += 33); } return T.interpreter.calibrated; })()`);
  await ev(`window.__cvtest.newGame('Player' + (${k} % 6)); 'ok'`);
  let started = false; for (let i = 0; i < 30 && !started; i++) { await sleep(400); started = await ev(`window.__cvtest.control().gameStart === true`); }
  if (!started) { console.log(JSON.stringify({label: 'cycle ' + k, problem: 'run did not start'})); continue; }
  // god-mode movement but the game's own game-over rules stay live for crash cycles
  await ev(`(() => { const c = window.__cvtest.control(); c.collideCheckAll = () => { c.downCollide = true; c.frontCollide = false; c.leftCollide = false; c.rightCollide = false; }; c.frontCollideCheckStatus = () => {}; return 'ok'; })()`);
  // gestures for ~6 s: lane changes, jumps, squats
  for (let g = 0; g < 6; g++) {
    await ev(`(() => { const T = window.__cvtest, b = window.__soak.body; const g = ${g}; if (g % 3 === 0) T.inject(b(0.5 + (g % 2 ? 0.3 : -0.3), 0.6), window.__soak.t += 300); else if (g % 3 === 1) T.inject(b(0.5, 0.52), window.__soak.t += 300); else { for (let i = 0; i < 5; i++) T.inject(b(0.5, 0.69), window.__soak.t += 33); } T.inject(b(0.5, 0.6), window.__soak.t += 400); return 'ok'; })()`);
    await sleep(1000);
  }
  if (stop) await ev(`document.getElementById('cv-stop').click(); 'ok'`);
  else await ev(`(() => { const c = window.__cvtest.control(); c.smallMistake = 2; return 'ok'; })()`); // the game's own checkGameStatus ends the run
  await sleep(500);
  if (!stop && skip) await ev(`document.getElementById('cv-catch-skip').click(); 'ok'`);
  else if (!stop) { for (let i = 0; i < 80; i++) { await sleep(100); if (!(await ev(`window.__cvtest.catch?.active`))) break; } }
  await ev(`document.getElementById('cv-board-close').click(); 'ok'`);
  await sleep(300);
  if (k % every === 0) rows.push(await snapshot(`cycle ${k} (${Math.round((Date.now() - t0) / 60000)} min)`));
}
rows.push(await snapshot('chunk end ' + cycles));
console.log('ERRORS', errors.length, errors.slice(0, 5));
process.exit(0);
