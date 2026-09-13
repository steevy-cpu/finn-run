/** Finn Run VFX v1. Receive accepted game events; never interpret inputs. */
export class EffectPool {
  constructor({ particleCapacity = 48, ringCapacity = 8, scale = 1 } = {}) {
    if (!Number.isInteger(particleCapacity) || particleCapacity < 5 || particleCapacity > 256 ||
        !Number.isInteger(ringCapacity) || ringCapacity < 1 || ringCapacity > 32 ||
        !Number.isFinite(scale) || scale <= 0) throw new RangeError('Invalid effect pool options');
    this.scale = scale;
    this.running = false;
    this.reduced = false;
    this.particles = Array.from({ length: particleCapacity }, () =>
      ({ alive: false, kind: 0, age: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0 }));
    this.rings = Array.from({ length: ringCapacity }, () =>
      ({ alive: false, age: 0, life: .22, x: 0, y: 0, z: 0 }));
    this.items = this.particles.concat(this.rings);
  }
  clear() {
    for (const p of this.particles) p.alive = false;
    for (const r of this.rings) r.alive = false;
  }
  setRunning(value) { this.running = !!value; if (!this.running) this.clear(); }
  setReduced(value) { this.reduced = !!value; this.clear(); }
  validPoint(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z); }
  particle(kind, pos, vx, vy, vz, size, life) {
    const p = this.particles.find(p => !p.alive);
    if (!p) return false; // Drop cosmetic overflow, never expand the pool.
    Object.assign(p, { alive: true, kind, age: 0, life, x: pos.x, y: pos.y, z: pos.z,
      vx: vx * this.scale, vy: vy * this.scale, vz: vz * this.scale, size: size * this.scale });
    return true;
  }
  coin(pos) {
    if (!this.running || !this.validPoint(pos)) return false;
    const r = this.rings.find(r => !r.alive);
    if (!r) return false;
    Object.assign(r, { alive: true, age: 0, x: pos.x, y: pos.y, z: pos.z });
    if (!this.reduced) for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      this.particle(1, pos, Math.cos(a) * 2.5, 1 + Math.sin(a) * 2.5, 0, .13, .22);
    }
    return true;
  }
  jump(pos) {
    if (!this.running || this.reduced || !this.validPoint(pos)) return false;
    let emitted = false;
    for (let i = -1; i <= 1; i++)
      emitted = this.particle(0, pos, i * 1.8, .8, (i === 0 ? 1 : -.5), .24, .18) || emitted;
    return emitted;
  }
  land(pos) {
    if (!this.running || this.reduced || !this.validPoint(pos)) return false;
    const left = this.particle(0, pos, -2.4, .55, .4, .30, .20);
    const right = this.particle(0, pos, 2.4, .55, -.4, .30, .20);
    return left || right;
  }
  update(seconds) {
    if (!this.running || !Number.isFinite(seconds) || seconds < 0) return;
    // Use actual elapsed seconds: a delayed frame expires old effects instead of stretching them.
    for (const p of this.items) {
      if (!p.alive) continue;
      p.age += seconds;
      if (p.age >= p.life) p.alive = false;
    }
  }
  /** Translate active effects when an integration rebases the world's origin. */
  shiftOrigin(delta) {
    if (!this.validPoint(delta)) return;
    for (const p of this.items) if (p.alive) {
      p.x += delta.x; p.y += delta.y; p.z += delta.z;
    }
  }
}

/** Pass the game's existing THREE namespace; no second renderer, loop or dependency version. */
export class FinnEffects {
  constructor(THREE, scene, options = {}) {
    this.pool = new EffectPool(options);
    this.disposed = false;
    this.group = new THREE.Group();
    this.group.name = 'finn-vfx';
    // World coordinates require an identity scene/root transform. Keep outside obstacle groups.
    scene.add(this.group);
    this.dummy = new THREE.Object3D();
    this.cameraRotation = new THREE.Quaternion();
    this.dustGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.sparkGeometry = new THREE.OctahedronGeometry(1, 0);
    this.ringGeometry = new THREE.RingGeometry(.82, 1, 24);
    this.dustMaterial = new THREE.MeshBasicMaterial({ color: 0xd5c9b5, transparent: true,
      opacity: .28, depthWrite: false, toneMapped: false });
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffd45a, toneMapped: false });
    this.dust = new THREE.InstancedMesh(this.dustGeometry, this.dustMaterial, this.pool.particles.length);
    this.sparks = new THREE.InstancedMesh(this.sparkGeometry, this.sparkMaterial, this.pool.particles.length);
    for (const [mesh, name] of [[this.dust, 'finn-vfx-dust'], [this.sparks, 'finn-vfx-spark']]) {
      mesh.name = name;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false; // Bounded pool avoids a dynamic bounds pass.
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.raycast = () => {}; // Cosmetic objects never participate in collision rays.
      this.group.add(mesh);
    }
    this.ringMeshes = this.pool.rings.map(() => {
      const material = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true,
        opacity: 0, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(this.ringGeometry, material);
      mesh.name = 'finn-vfx-ring'; mesh.visible = false;
      mesh.raycast = () => {};
      this.group.add(mesh);
      return mesh;
    });
  }
  coin(position) { return !this.disposed && this.pool.coin(position); }
  jump(feetPosition) { return !this.disposed && this.pool.jump(feetPosition); }
  land(feetPosition) { return !this.disposed && this.pool.land(feetPosition); }
  setRunning(value) { this.pool.setRunning(!this.disposed && value); if (!value) this.hide(); }
  setReduced(value) { this.pool.setReduced(value); this.hide(); }
  clear() { this.pool.clear(); this.hide(); }
  hide() {
    this.dust.count = this.sparks.count = 0;
    this.dust.visible = this.sparks.visible = false;
    for (const mesh of this.ringMeshes) mesh.visible = false;
  }
  shiftOrigin(delta) { this.pool.shiftOrigin(delta); }
  update(seconds, camera) {
    if (this.disposed || !this.pool.running) return;
    this.pool.update(seconds);
    camera.getWorldQuaternion(this.cameraRotation);
    let dustCount = 0, sparkCount = 0;
    for (const p of this.pool.particles) {
      if (!p.alive) continue;
      const t = p.age / p.life;
      const size = p.size * (p.kind ? 1 - t : (1 + t) * (1 - t * t));
      this.dummy.position.set(p.x + p.vx * p.age, p.y + p.vy * p.age, p.z + p.vz * p.age);
      this.dummy.quaternion.copy(this.cameraRotation);
      this.dummy.scale.set(size * (p.kind ? .55 : 1.25), size, size * .65);
      this.dummy.updateMatrix();
      if (p.kind) this.sparks.setMatrixAt(sparkCount++, this.dummy.matrix);
      else this.dust.setMatrixAt(dustCount++, this.dummy.matrix);
    }
    this.dust.count = dustCount; this.sparks.count = sparkCount;
    this.dust.visible = dustCount > 0; this.sparks.visible = sparkCount > 0;
    if (dustCount) this.dust.instanceMatrix.needsUpdate = true;
    if (sparkCount) this.sparks.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.pool.rings.length; i++) {
      const r = this.pool.rings[i], mesh = this.ringMeshes[i];
      mesh.visible = r.alive;
      if (!r.alive) continue;
      const t = r.age / r.life;
      const radius = this.pool.scale * (this.pool.reduced ? .22 + .14 * t : .32 + .60 * (1 - (1 - t) ** 2));
      mesh.position.set(r.x, r.y, r.z);
      mesh.quaternion.copy(this.cameraRotation);
      mesh.scale.setScalar(radius);
      mesh.material.opacity = (this.pool.reduced ? .55 : .85) * (1 - t) ** 2;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.setRunning(false);
    this.group.removeFromParent();
    for (const mesh of [this.dust, this.sparks]) mesh.dispose();
    for (const geometry of [this.dustGeometry, this.sparkGeometry, this.ringGeometry]) geometry.dispose();
    for (const material of [this.dustMaterial, this.sparkMaterial, ...this.ringMeshes.map(m => m.material)]) material.dispose();
    this.disposed = true;
  }
}
