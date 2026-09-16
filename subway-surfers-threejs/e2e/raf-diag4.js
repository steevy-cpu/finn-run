(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const measure = () => new Promise(res => { const f = []; let last = performance.now(), n = 0; const loop = t => { f.push(t - last); last = t; if (++n < 60) requestAnimationFrame(loop); else { const s = f.sort((a, b) => a - b); res(+s[30].toFixed(1)); } }; requestAnimationFrame(loop); });
  const out = {asIs: await measure()};
  window.dispatchEvent(new Event('resize')); await sleep(200); out.afterResizeEvent = await measure();
  document.body.style.display = 'none'; void document.body.offsetHeight; document.body.style.display = ''; await sleep(300); out.afterReflow = await measure();
  const cam = document.getElementById('cv-video'); const stream = cam.srcObject; cam.srcObject = null; await sleep(300); out.camDetached = await measure(); cam.srcObject = stream; await cam.play().catch(() => {}); await sleep(300); out.camBack = await measure();
  // a short canvas animation burst (does the compositor step back up under load?)
  const cnv = document.createElement('canvas'); cnv.width = 64; cnv.height = 64; document.body.appendChild(cnv); const ctx = cnv.getContext('2d'); let k = 0; const burst = () => { ctx.fillStyle = k++ % 2 ? '#000' : '#fff'; ctx.fillRect(0, 0, 64, 64); if (k < 120) requestAnimationFrame(burst); }; burst(); await sleep(2200); out.afterCanvasBurst = await measure(); cnv.remove();
  return JSON.stringify(out);
})()
