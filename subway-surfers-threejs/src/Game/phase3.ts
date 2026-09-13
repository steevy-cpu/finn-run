// Phase 3 visuals (Higgsfield Train & Obstacle Kit 01): new train and
// low-obstacle art fitted to the EXISTING collision proxies.
//
// Contract (see Finn_Run_Phase3_Visual_Kit/COLLISION_FIT.md):
// - the legacy train / roadblock clones stay in the obstacle group as
//   invisible colliders (raycasting ignores `visible`), so the collision
//   surfaces, names, hit-height rule and spawn spacing are unchanged
// - the new art is instanced, non-colliding (never named train/kerbStone/
//   coin), parented to the section group so pruning drops it
// - no lights, no movement, no animation; emissive headlights are materials
//
// Fit (measured in-game, legacy assets, relative to each obstacle root):
//   old train:     x ±2.8, y 0..8.35, z -8.32..+8.22, nose toward +Z;
//                  leading collision wall at z +8.0, roof proxies at y 8.4
//   Train A/B:     native 4.58 × 6.52 × 16.33, nose at +8.525, tail -7.8
//                  → uniform scale 1.0, z offset -0.525: nose on the wall,
//                    tail at -8.3; height 6.5 vs 8.35 is unreachable in play
//   old roadblock: 3.73 × 3.61 × 3.99 centred on the root; proxy wall at z 0
//   Barrier A:     4.4 × 3.5 × 1.8 → scale 1.03 (height 3.61), z +1.07 so
//                  its front face sits where the old block's front face was
//   Crate A:       4.22 × 3.5 × 2.67 → scale 1.03, z +0.60 (same rule)
import * as THREE from 'three';
import {load3DModel} from '@/Game/utils/model';

const KEY = 'cv-phase3';
export const PHASE3 = (() => {
    try {
        const q = new URLSearchParams(location.search).get('phase3');
        if (q === '1' || q === '0') { localStorage.setItem(KEY, q); return q === '1'; }
        return localStorage.getItem(KEY) === '1';
    } catch { return false; }
})();

const BASE = '/assets/glb/finn-run-phase3/';
const FIT = {
    train:   {files: ['train_a.glb', 'train_b.glb'], scale: 1.0,  dz: -0.525},
    low:     {files: ['barrier_a.glb', 'maintenance_crate_a.glb'], scale: 1.03, dz: [1.07, 0.60]},
};

type Part = {geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4};

export class Phase3Visuals {
    private static instance: Phase3Visuals | null = null;
    static get() { return Phase3Visuals.instance ||= new Phase3Visuals(); }
    private loaded: Promise<void> | null = null;
    private parts = new Map<string, Part[]>();

    load() {
        if (!this.loaded) {
            const files = [...FIT.train.files, ...FIT.low.files];
            this.loaded = Promise.all(files.map(async f => {
                const {scene} = await load3DModel(BASE + f);
                scene.updateWorldMatrix(true, true);
                const parts: Part[] = [];
                scene.traverse((o: any) => {
                    if (o.isMesh) {
                        o.castShadow = false; o.receiveShadow = false;
                        parts.push({geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone()});
                    }
                });
                this.parts.set(f, parts);
            })).then(() => {});
        }
        return this.loaded;
    }

    // Placements are recorded while loadObstacle() lays out the legacy
    // colliders, then emitted as one InstancedMesh per primitive.
    private trains: THREE.Matrix4[][] = [[], []];
    private lows: THREE.Matrix4[][] = [[], []];
    private nTrain = 0;
    private nLow = 0;

    addTrain(x: number, z: number) {
        const skin = this.nTrain++ % 2;
        this.trains[skin].push(new THREE.Matrix4().compose(
            new THREE.Vector3(x, 0, z + FIT.train.dz), new THREE.Quaternion(), new THREE.Vector3().setScalar(FIT.train.scale)));
    }
    addLow(x: number, z: number) {
        const kind = this.nLow++ % 2;
        this.lows[kind].push(new THREE.Matrix4().compose(
            new THREE.Vector3(x, 0, z + FIT.low.dz[kind]), new THREE.Quaternion(), new THREE.Vector3().setScalar(FIT.low.scale)));
    }

    async flush(group: THREE.Group) {
        await this.load();
        const emit = (file: string, mats: THREE.Matrix4[]) => {
            if (!mats.length) return;
            for (const part of this.parts.get(file)!) {
                const im = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
                const m = new THREE.Matrix4();
                mats.forEach((t, i) => im.setMatrixAt(i, m.multiplyMatrices(t, part.matrix)));
                im.instanceMatrix.needsUpdate = true;
                im.castShadow = false; im.receiveShadow = false;
                im.frustumCulled = false;
                im.name = 'phase3';
                group.add(im);
            }
        };
        FIT.train.files.forEach((f, i) => emit(f, this.trains[i]));
        FIT.low.files.forEach((f, i) => emit(f, this.lows[i]));
        this.trains = [[], []]; this.lows = [[], []];
    }
}
