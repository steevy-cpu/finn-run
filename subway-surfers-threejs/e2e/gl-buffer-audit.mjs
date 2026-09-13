// GL buffer audit (probe-side instrumentation only; never bundled). Proves that
// retiring a road section (restart or pruneBehind) deletes its instance-matrix
// buffers and owned geometry buffers: spies on gl.createBuffer/deleteBuffer and
// counts 'dispose' events on every per-section InstancedMesh.
// Run like the e2e: headless Chrome with --remote-debugging-port, then
//   node e2e/gl-buffer-audit.mjs <port> <label>
// Temporary instrumentation (probe-side only, nothing in production):
// spy on gl.createBuffer/deleteBuffer, listen for 'dispose' on every
// per-section InstancedMesh, and account for the instance attributes of
// retired sections across restarts and a long pruning run.
const [port, tag] = process.argv.slice(2);
const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = list.find(t => t.type === 'page' && t.url.includes('5180'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) pending.get(m.id)(m); };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({id: i, method: m, params: p})); });
const ev = async x => { const r = await send('Runtime.evaluate', {expression: x, returnByValue: true, awaitPromise: true}); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
for (let i = 0; i < 60; i++) { if (await ev('!!window.__cvtest?.control?.() && window.__cvtest.pursuer?.state !== "loading"').catch(() => false)) break; await sleep(1000); }
await sleep(2000);
// install spies
console.log(tag, await ev(`(() => {
  const c = window.__cvtest.control(); const gl = c.game.renderer.renderer.getContext();
  const S = window.__spy = {created: 0, deleted: 0, live: new Set(), disposeEvents: 0, watched: new Set()};
  const cb = gl.createBuffer.bind(gl), db = gl.deleteBuffer.bind(gl);
  gl.createBuffer = () => { const b = cb(); S.created++; S.live.add(b); return b; };
  gl.deleteBuffer = (b) => { S.deleted++; S.live.delete(b); return db(b); };
  // watch every InstancedMesh currently in the scene + any added later
  S.watch = () => { let n = 0; c.scene.traverse(o => { if (o.isInstancedMesh && !S.watched.has(o)) { S.watched.add(o); o.addEventListener('dispose', () => S.disposeEvents++); n++; } }); return n; };
  S.instAttrs = (group) => { let n = 0; group.traverse(o => { if (o.isInstancedMesh) n += 1 + (o.instanceColor ? 1 : 0); }); return n; };
  S.rendererHasListener = (im) => im.hasEventListener('dispose', im._listeners.dispose.find(f => f.name === 'onInstancedMeshDispose') || (() => {}));
  const watched = S.watch();
  const ims = []; c.scene.traverse(o => { if (o.isInstancedMesh) ims.push(o); });
  const withRendererHook = ims.filter(im => (im._listeners?.dispose || []).some(f => f.name === 'onInstancedMeshDispose')).length;
  return JSON.stringify({instancedMeshesInScene: ims.length, watched, withRendererDisposeHook: withRendererHook, sample: ims.slice(0, 3).map(im => ({name: im.name, count: im.count, listeners: (im._listeners?.dispose || []).map(f => f.name)}))});
})()`));
// calibrate so New Game restarts immediately
await ev(`(() => { const T = window.__cvtest; T.engine.stop();
  const body = (cx, cy) => { const lm = Array.from({length: 33}, () => ({x: cx, y: cy, z: 0, visibility: 1})); lm[11]={x:cx+.12,y:cy-.2,z:0,visibility:1}; lm[12]={x:cx-.12,y:cy-.2,z:0,visibility:1}; lm[23]={x:cx+.08,y:cy,z:0,visibility:1}; lm[24]={x:cx-.08,y:cy,z:0,visibility:1}; lm[27]={x:cx+.08,y:cy+.45,z:0,visibility:1}; lm[28]={x:cx-.08,y:cy+.45,z:0,visibility:1}; return lm; };
  T.interpreter.startCalibration(); let t = 1000; for (let i = 0; i < 30; i++) T.inject(body(0.5, 0.6), t += 33); return 'ok'; })()`);
const snap = async (label) => JSON.parse(await ev(`JSON.stringify((() => { const S = window.__spy, c = window.__cvtest.control(); const env = c.environement;
  let imsInScene = 0; c.scene.traverse(o => { if (o.isInstancedMesh) imsInScene++; });
  return {label: ${JSON.stringify(label)}, liveGLBuffers: S.live.size, created: S.created, deleted: S.deleted, disposeEvents: S.disposeEvents, watched: S.watched.size, imsInScene, sectionsAlive: env.sections.filter(Boolean).length, geometries: c.game.renderer.renderer.info.memory.geometries}; })())`));
const rows = [await snap('baseline')];
for (let k = 1; k <= 5; k++) {
  // retired = the sections alive now (restart disposes them); expected deletes ≥ their instance attrs + 5 owned geometries × their attribute buffers
  const expect = JSON.parse(await ev(`JSON.stringify((() => { const S = window.__spy, env = window.__cvtest.control().environement; let inst = 0, ims = 0; for (const g of env.sections) if (g) { inst += S.instAttrs(g); g.traverse(o => { if (o.isInstancedMesh) ims++; }); } return {retiredInstancedMeshes: ims, retiredInstanceAttrs: inst, deletedBefore: S.deleted, eventsBefore: S.disposeEvents}; })())`));
  await ev(`window.__cvtest.newGame('Tester'); 'ok'`);
  let started = false; for (let i = 0; i < 20 && !started; i++) { await sleep(400); started = await ev(`window.__cvtest.control().gameStart === true`); }
  await ev(`(() => { const c = window.__cvtest.control(); c.frontCollideCheckStatus = () => {}; c.checkGameStatus = () => {}; c.collideCheckAll = () => { c.downCollide = true; c.frontCollide = false; c.leftCollide = false; c.rightCollide = false; }; window.__spy.watch(); return 'ok'; })()`);
  await sleep(2500);
  await ev(`document.getElementById('cv-stop').click(); 'ok'`); await sleep(400); await ev(`document.getElementById('cv-board-close').click(); 'ok'`);
  const s = await snap(`after restart ${k}`);
  s.retiredInstancedMeshes = expect.retiredInstancedMeshes; s.retiredInstanceAttrs = expect.retiredInstanceAttrs;
  s.disposeEventsThisRestart = s.disposeEvents - expect.eventsBefore; s.glDeletesThisRestart = s.deleted - expect.deletedBefore;
  rows.push(s);
}
// long run with pruning
await ev(`window.__cvtest.newGame('Tester'); 'ok'`);
{ let started = false; for (let i = 0; i < 20 && !started; i++) { await sleep(400); started = await ev(`window.__cvtest.control().gameStart === true`); } }
await ev(`(() => { const c = window.__cvtest.control(); c.frontCollideCheckStatus = () => {}; c.checkGameStatus = () => {}; c.collideCheckAll = () => { c.downCollide = true; c.frontCollide = false; c.leftCollide = false; c.rightCollide = false; }; return 'ok'; })()`);
for (let t = 0; t <= 45; t += 5) { await ev(`window.__spy.watch(); 'ok'`); const s = await snap(`long run t=${t}s`); s.sectionsMade = await ev(`window.__cvtest.control().environement.sections.length`); rows.push(s); await sleep(5000); }
for (const r of rows) console.log('  ' + JSON.stringify(r));
process.exit(0);
