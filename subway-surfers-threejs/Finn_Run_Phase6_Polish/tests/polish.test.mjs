import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinnPolish, auditFinn, EXPECTED_CLIPS } from '../src/FinnPolish.mjs';
const THREE = await import(process.env.THREE_MODULE || '../vendor/three.module.js');
function fixture() {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .1, emissive: 0xffffff, emissiveIntensity: 1.2 });
  material.map = new THREE.Texture(); material.emissiveMap = material.map;
  material.roughnessMap = new THREE.Texture(); material.normalMap = new THREE.Texture();
  const mesh = new THREE.SkinnedMesh(geometry, material), bone = new THREE.Bone();
  bone.name = 'mixamorigHips'; mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); root.add(mesh);
  const clips = EXPECTED_CLIPS.map(name => new THREE.AnimationClip(name, 1, []));
  return { root, geometry, material, mesh, bone, clips };
}
test('polish preserves textures, geometry, skeleton, bind matrices, bones and clips', () => {
  const f = fixture(), skeleton = f.mesh.skeleton, bind = f.mesh.bindMatrix.clone();
  const inverse = skeleton.boneInverses[0].clone(), transform = f.bone.matrix.clone();
  const clipData = JSON.stringify(f.clips), c = createFinnPolish(f.root); c.setMode('soft');
  assert.equal(f.mesh.geometry, f.geometry); assert.equal(f.mesh.skeleton, skeleton);
  assert.ok(f.mesh.bindMatrix.equals(bind)); assert.ok(skeleton.boneInverses[0].equals(inverse));
  assert.ok(f.bone.matrix.equals(transform)); assert.equal(JSON.stringify(f.clips), clipData);
  for (const key of ['map', 'emissiveMap', 'roughnessMap', 'normalMap']) assert.equal(f.mesh.material[key], f.material[key]);
  assert.equal(f.material.emissiveIntensity, 1.2); assert.equal(f.material.roughness, .5);
  c.setMode('original'); assert.equal(f.mesh.material, f.material); c.dispose();
});
test('500 toggles reuse clones without compounding and cached roots share controllers', () => {
  const f = fixture(), c = createFinnPolish(f.root); assert.equal(createFinnPolish(f.root), c);
  c.setMode('soft'); const clone = f.mesh.material;
  for (let i = 0; i < 500; i++) { c.setMode('shaped'); c.setMode('original'); c.setMode('soft'); }
  assert.equal(f.mesh.material, clone); assert.equal(c.ownedMaterialCount, 1);
  assert.equal(clone.emissiveIntensity, 1.2 * .35); assert.equal(clone.roughness, .8); c.dispose();
});
test('shared materials and array bindings retain sharing and original array identity', () => {
  const f = fixture(), array = [f.material, f.material]; f.mesh.material = array;
  const second = new THREE.Mesh(f.geometry, f.material); f.root.add(second);
  const c = createFinnPolish(f.root); c.setMode('soft');
  assert.equal(f.mesh.material[0], second.material); assert.equal(f.mesh.material[0], f.mesh.material[1]);
  assert.equal(c.ownedMaterialCount, 1); c.setMode('original'); assert.equal(f.mesh.material, array); c.dispose();
});
test('disposal restores originals and only disposes owned clones once', () => {
  const f = fixture(), c = createFinnPolish(f.root); c.setMode('soft');
  let cloneDisposals = 0, originalDisposals = 0, textureDisposals = 0;
  f.mesh.material.addEventListener('dispose', () => cloneDisposals++);
  f.material.addEventListener('dispose', () => originalDisposals++);
  f.material.map.addEventListener('dispose', () => textureDisposals++);
  c.dispose(); c.dispose(); assert.equal(cloneDisposals, 1); assert.equal(originalDisposals, 0); assert.equal(textureDisposals, 0);
  assert.equal(f.mesh.material, f.material); assert.throws(() => c.setMode('soft'));
  assert.notEqual(createFinnPolish(f.root), c); createFinnPolish(f.root).dispose();
});
test('unsupported/custom materials and external rebinding are detected without overwriting', () => {
  const f = fixture(); f.mesh.material = new THREE.MeshBasicMaterial(); assert.throws(() => createFinnPolish(f.root));
  f.mesh.material = f.material; f.material.onBeforeCompile = () => {}; assert.throws(() => createFinnPolish(f.root));
  delete f.material.onBeforeCompile; const c = createFinnPolish(f.root); const foreign = new THREE.MeshStandardMaterial();
  f.mesh.material = foreign; assert.throws(() => c.setMode('soft')); assert.equal(f.mesh.material, foreign);
  f.mesh.material = f.material; c.dispose();
});
test('audit reports actual materials, bones, texture sharing and missing clips without mutation', () => {
  const f = fixture(); const before = f.mesh.material, a = auditFinn(f.root, f.clips);
  assert.equal(a.uniqueMaterials, 1); assert.equal(a.skeletons[0].boneCount, 1);
  assert.equal(a.materials[0].baseMapAlsoUsedAsEmissive, true); assert.deepEqual(a.missingExpectedClips, []);
  assert.deepEqual(auditFinn(f.root, f.clips.slice(1)).missingExpectedClips, ['run']); assert.equal(f.mesh.material, before);
});
