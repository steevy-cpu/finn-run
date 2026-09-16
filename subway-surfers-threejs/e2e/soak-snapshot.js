(() => {
  const T = window.__cvtest, c = T.control(), R = c.game.renderer.renderer;
  return new Promise(res => {
    const frames = []; let last = performance.now(), n = 0;
    const loop = t => { frames.push(t - last); last = t; if (++n < 90) requestAnimationFrame(loop); else res(frames); };
    requestAnimationFrame(loop);
  }).then(frames => {
    const s = frames.slice().sort((a, b) => a - b);
    return JSON.stringify({
      geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length,
      sceneChildren: c.scene.children.length, sections: c.environement.sections.filter(Boolean).length,
      poseFps: T.engine.fps, inferMs: Math.round(T.engine.inferMs),
      frameP50: +s[Math.floor(s.length * 0.5)].toFixed(1), frameP95: +s[Math.floor(s.length * 0.95)].toFixed(1),
      board: T.board.load().length, pursuerGroups: c.scene.children.filter(o => o.name === 'pursuer').length,
      catchActive: !!(T.catch && T.catch.active), videos: document.querySelectorAll('video').length,
      mode: T.mode, calibrated: !!T.interpreter.calibrated
    });
  });
})()
