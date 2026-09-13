/** Phase 6: reversible material-only experiments, not a replacement Finn asset. */
export const PRESETS = Object.freeze({
  soft: Object.freeze({ emissiveGain: .35, roughness: .80, metalness: 0 }),
  shaped: Object.freeze({ emissiveGain: .18, roughness: .72, metalness: 0 })
});
export const EXPECTED_CLIPS = Object.freeze(['run', 'jump', 'roll', 'fall', 'die', 'dance', 'idle', 'lookback', 'runlookback']);
const controllers = new WeakMap();

export function auditFinn(root, clips = []) {
  const materials = new Map(), skeletons = new Set(), meshes = [];
  root.traverse(node => {
    if (!node.isMesh) return;
    const slots = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of slots) if (m && !materials.has(m)) materials.set(m, {
      name: m.name, type: m.type, color: m.color?.getHexString(),
      emissive: m.emissive?.getHexString(), emissiveIntensity: m.emissiveIntensity,
      roughness: m.roughness, metalness: m.metalness,
      textureSlots: Object.fromEntries(['map', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'alphaMap']
        .filter(key => m[key]).map(key => {
          const t = m[key], im = t.image;
          return [key, { name: t.name, width: im?.width ?? null, height: im?.height ?? null, colorSpace: t.colorSpace }];
        })),
      baseMapAlsoUsedAsEmissive: !!m.map && m.map === m.emissiveMap
    });
    if (node.skeleton) skeletons.add(node.skeleton);
    meshes.push({ name: node.name, skinned: !!node.isSkinnedMesh,
      vertices: node.geometry?.attributes.position?.count ?? 0,
      geometryGroups: node.geometry?.groups.length ?? 0, materialSlots: slots.length });
  });
  const names = clips.map(c => c.name);
  return {
    source: 'Loaded runtime object; inspect after the existing player material setup',
    meshes, materials: [...materials.values()], uniqueMaterials: materials.size,
    skeletons: [...skeletons].map(s => ({ bones: s.bones.map(b => b.name), boneCount: s.bones.length })),
    clips: clips.map(c => ({ name: c.name, duration: c.duration, tracks: c.tracks.length })),
    missingExpectedClips: EXPECTED_CLIPS.filter(name => !names.includes(name)),
    notes: ['This audit does not validate bind pose, weight quality, topology, animation playback or MediaPipe behavior.',
      'One textured material cannot receive independent skin/cloth/shoe settings without an authored region map or a mesh/material change.']
  };
}

/** Cache one controller per loaded model. Pass the same root on cached respawns. */
export function createFinnPolish(root) {
  const existing = controllers.get(root);
  if (existing) return existing;
  const entries = [], originals = new Set(), clones = new Map();
  let mode = 'original', disposed = false;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const original = mesh.material, slots = Array.isArray(original) ? original.slice() : [original];
    for (const material of slots) {
      if (!material?.isMeshStandardMaterial) throw new TypeError('Finn polish requires existing Standard/Physical materials; inspect the current asset.');
      if (Object.hasOwn(material, 'onBeforeCompile') || Object.hasOwn(material, 'customProgramCacheKey'))
        throw new TypeError('Custom material hooks require manual review before cloning.');
      originals.add(material);
    }
    entries.push({ mesh, original, slots, polished: null });
  });
  if (!entries.length) throw new TypeError('No mesh materials found on the supplied Finn root.');
  function check() {
    if (disposed) throw new Error('Finn polish controller is disposed. Create a new one for a new lifecycle.');
    for (const e of entries) {
      const binding = mode === 'original' ? e.original : e.polished;
      if (e.mesh.material !== binding) throw new Error('Material ownership changed externally. Restore/recreate the controller at the player setup boundary.');
      if (Array.isArray(binding)) for (let i = 0; i < e.slots.length; i++) {
        if (binding.length !== e.slots.length || binding[i] !== (mode === 'original' ? e.slots[i] : clones.get(e.slots[i])))
          throw new Error('Material slots changed externally. Inspect before applying polish.');
      }
    }
  }
  const controller = {
    get mode() { return mode; },
    get ownedMaterialCount() { return clones.size; },
    setMode(next) {
      if (next !== 'original' && !Object.hasOwn(PRESETS, next)) throw new RangeError('Use original, soft, or shaped.');
      check();
      if (next === 'original') {
        for (const e of entries) e.mesh.material = e.original;
      } else {
        if (!clones.size) {
          try { for (const m of originals) clones.set(m, m.clone()); }
          catch (error) { for (const c of clones.values()) c.dispose(); clones.clear(); throw error; }
          for (const e of entries) e.polished = Array.isArray(e.original) ? e.slots.map(m => clones.get(m)) : clones.get(e.original);
        }
        const preset = PRESETS[next];
        for (const [original, clone] of clones) {
          // Derive from original every time: repeated toggles never compound the gain.
          clone.emissiveIntensity = original.emissiveIntensity * preset.emissiveGain;
          clone.roughness = preset.roughness;
          clone.metalness = preset.metalness;
        }
        for (const e of entries) e.mesh.material = e.polished;
      }
      mode = next;
      return controller;
    },
    dispose() {
      if (disposed) return;
      controller.setMode('original');
      for (const m of clones.values()) m.dispose();
      clones.clear(); disposed = true; controllers.delete(root);
      // Original materials, maps, geometry, skeleton, bones and clips belong to the game.
    }
  };
  controllers.set(root, controller);
  return controller;
}
