import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectPool, FinnEffects } from '../src/Game/FinnEffects.mjs';
const at = { x: 2, y: .1, z: 100 };
const active = list => list.filter(p => p.alive).length;
test('accepted events only emit during running, and copy positions', () => {
  const p = new EffectPool(); assert.equal(p.coin(at), false);
  p.setRunning(true); const pos = { ...at }; p.coin(pos); pos.z = -200;
  assert.equal(p.rings[0].z, 100); assert.equal(active(p.particles), 4);
});
test('durations expire independently of update rate and survive delayed frames', () => {
  for (const step of [1 / 30, 1 / 60, 1 / 144]) {
    const p = new EffectPool(); p.setRunning(true); p.coin(at); p.jump(at); p.land(at);
    for (let elapsed = 0; elapsed < .25; elapsed += step) p.update(step);
    assert.equal(active(p.items), 0);
  }
  const p = new EffectPool(); p.setRunning(true); p.coin(at); p.update(10);
  assert.equal(active(p.items), 0);
});
test('cosmetic overflow is bounded and pool entries are reused', () => {
  const p = new EffectPool(), references = p.items.slice(); p.setRunning(true);
  for (let i = 0; i < 10000; i++) { p.coin(at); p.jump(at); p.land(at); }
  assert.equal(active(p.particles), 48); assert.equal(active(p.rings), 8);
  assert.equal(p.coin(at), false); p.update(1); p.coin(at);
  for (let i = 0; i < references.length; i++) assert.equal(p.items[i], references[i]);
});
test('stop, restart and reduced-effects changes remove stale effects', () => {
  const p = new EffectPool(); p.setRunning(true); p.jump(at); p.coin(at);
  p.setRunning(false); assert.equal(active(p.items), 0); assert.equal(p.land(at), false);
  p.setRunning(true); p.coin(at); p.setReduced(true); assert.equal(active(p.items), 0);
  assert.equal(p.jump(at), false); assert.equal(p.land(at), false); p.coin(at);
  assert.equal(active(p.particles), 0); assert.equal(active(p.rings), 1);
  p.setReduced(false); assert.equal(active(p.items), 0);
});
test('invalid input cannot poison transforms and origin shifts follow active effects', () => {
  const p = new EffectPool(); p.setRunning(true);
  for (const pos of [null, {}, { x: NaN, y: 1, z: 1 }]) assert.equal(p.coin(pos), false);
  p.coin(at); p.update(NaN); p.update(-1); assert.equal(p.rings[0].age, 0);
  p.shiftOrigin({ x: -2, y: 0, z: -100 }); assert.equal(p.rings[0].x, 0); assert.equal(p.rings[0].z, 0);
  assert.throws(() => new EffectPool({ scale: 0 }), RangeError);
});
// Override THREE_MODULE to check another locally installed game version.
{
  const THREE = await import(process.env.THREE_MODULE || '../node_modules/three/build/three.module.js');
  test('Three adapter hides stopped effects, ignores collision rays and disposes once', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const fx = new FinnEffects(THREE, scene); fx.setRunning(true);
    fx.coin(at); fx.jump(at); fx.land(at); fx.update(.05, camera);
    assert.equal(fx.sparks.count, 4); assert.equal(fx.dust.count, 5);
    assert.equal(fx.ringMeshes.filter(m => m.visible).length, 1);
    const raycaster = new THREE.Raycaster(); assert.equal(raycaster.intersectObject(fx.group, true).length, 0);
    let disposed = 0; fx.dustGeometry.addEventListener('dispose', () => disposed++);
    fx.setRunning(false); assert.equal(fx.dust.visible, false); assert.equal(fx.sparks.count, 0);
    assert.equal(fx.ringMeshes.some(m => m.visible), false);
    fx.dispose(); fx.dispose(); assert.equal(disposed, 1); assert.equal(scene.children.length, 0);
    assert.equal(fx.coin(at), false);
  });
}
