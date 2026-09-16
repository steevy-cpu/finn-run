(async () => {
  const T = window.__cvtest, c = T.control(), game = c.game;
  const measure = () => new Promise(res => { const f = []; let last = performance.now(), n = 0; const loop = t => { f.push(t - last); last = t; if (++n < 60) requestAnimationFrame(loop); else { const s = f.sort((a, b) => a - b); res(+s[30].toFixed(1)); } }; requestAnimationFrame(loop); });
  const out = {visibility: document.visibilityState, status: c.gameStatus, engineRunning: T.engine.running};
  out.asIs = await measure();
  const origRender = game.renderer.update.bind(game.renderer); game.renderer.update = () => {};
  out.noRender = await measure();
  game.renderer.update = origRender;
  const origFx = game.fx.update.bind(game.fx); game.fx.update = () => {};
  out.noFx = await measure(); game.fx.update = origFx;
  const p = game.pursuer; const vis = p ? p.group.visible : null; if (p) p.group.visible = false;
  out.noArturo = await measure(); if (p) p.group.visible = vis;
  const R = game.renderer.renderer; out.calls = R.info.render.calls; out.tris = R.info.render.triangles;
  out.pixelRatio = R.getPixelRatio(); out.size = [game.sizes.width, game.sizes.height];
  return JSON.stringify(out);
})()
