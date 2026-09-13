// Phase 2 scenery (Higgsfield Environment Kit 01): city blocks and street
// props along both sides of the track, plus optional tunnel/station.
//
// Rules from the handoff brief:
// - visual only: nothing here is named plane/train/kerbStone/coin and nothing
//   is added to the obstacle/coin/ground groups
// - assets load once and share geometry + materials; every placement is an
//   instance, so a section costs one draw call per asset primitive, however
//   many copies stand along it
// - parented to the section group so pruning drops it with the section
// - no shadows, no imported lights, no legacy per-house scales
import * as THREE from 'three';
import {load3DModel} from '@/Game/utils/model';

const BASE = '/assets/glb/finn-run-phase2/';
const TRACK_EDGE = 7.5;   // roadWidth / 2
const MARGIN = 1.0;       // scenery keeps max.x <= -8.5 (left) / min.x >= 8.5 (right)
const EDGE = TRACK_EDGE + MARGIN;

// facing: rotation about Y applied to the asset so its +Z facade looks at the
// track from that side (left side +π/2, right side -π/2 per the brief).
type Part = {geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4};
type Proto = {parts: Part[]; box: THREE.Box3};

const FILES = {
    blocks: ['city_block_a.glb', 'city_block_b.glb', 'city_block_c.glb'],
    lamp: 'streetlamp_a.glb', palm: 'palm_a.glb', fence: 'fence_a.glb',
    bench: 'bench_a.glb', box: 'utility_box_a.glb', sign: 'transit_sign_a.glb',
    tunnel: 'tunnel_a.glb', station: 'station_a.glb',
};

// Deterministic per-section variety (seeded by the section's z).
function rng(seed: number) {
    let s = (Math.floor(Math.abs(seed)) + 0x9e3779b9) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Phase2Scenery {
    private static instance: Phase2Scenery | null = null;
    static get() { return Phase2Scenery.instance ||= new Phase2Scenery(); }

    private loaded: Promise<void> | null = null;
    private scenes = new Map<string, THREE.Object3D>();
    private protos = new Map<string, Proto>(); // key: file|rotY|scale

    // Load every module once through the existing cached loader.
    load() {
        if (!this.loaded) {
            const files = [...FILES.blocks, FILES.lamp, FILES.palm, FILES.fence, FILES.bench,
                           FILES.box, FILES.sign, FILES.tunnel, FILES.station];
            this.loaded = Promise.all(files.map(async f => {
                const {scene} = await load3DModel(BASE + f);
                scene.traverse((o: any) => {
                    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
                });
                this.scenes.set(f, scene);
            })).then(() => {});
        }
        return this.loaded;
    }

    // A prototype = the asset's mesh parts flattened to matrices relative to
    // its root, after the facing rotation + scale, plus the resulting bounds.
    private proto(file: string, rotY: number, scale = 1): Proto {
        const key = `${file}|${rotY.toFixed(4)}|${scale}`;
        let p = this.protos.get(key);
        if (p) return p;
        const root = this.scenes.get(file)!.clone(); // shares geometry + materials
        root.rotation.y = rotY;
        root.scale.setScalar(scale);
        root.updateMatrixWorld(true);
        const parts: Part[] = [];
        root.traverse((o: any) => {
            if (o.isMesh) parts.push({geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone()});
        });
        p = {parts, box: new THREE.Box3().setFromObject(root)};
        this.protos.set(key, p);
        return p;
    }

    // Build one road section: z runs from houseZ down to houseZ - roadLength.
    async build(group: THREE.Group, houseZ: number, roadLength: number, crossings: boolean) {
        await this.load();
        const zEnd = houseZ - roadLength;
        const rand = rng(houseZ);
        const placements = new Map<Proto, THREE.Matrix4[]>();
        const place = (p: Proto, x: number, z: number, y = 0) => {
            const list = placements.get(p) || [];
            list.push(new THREE.Matrix4().makeTranslation(x, y, z));
            placements.set(p, list);
        };
        // x that puts the asset's box just outside the track on that side.
        const sideX = (p: Proto, side: -1 | 1, extra = 0) =>
            side < 0 ? -EDGE - extra - p.box.max.x : EDGE + extra - p.box.min.x;
        // z-intervals no building may overlap (tunnel / station footprints).
        const blocked: Array<[number, number]> = [];
        const isBlocked = (z0: number, z1: number) => blocked.some(([a, b]) => z0 < b && z1 > a);

        if (crossings) {
            // Tunnel: centred on the track mid-section, uniform scale 2.2 (see
            // CLEARANCE.md): opening 17.2 wide, 15.5 high — clears the track
            // (15) and the camera's highest point (~13.5 at the jump apex).
            const tunnel = this.proto(FILES.tunnel, 0, 2.2);
            const tz = houseZ - roadLength / 2;
            place(tunnel, 0, tz);
            blocked.push([tz + tunnel.box.min.z - 4, tz + tunnel.box.max.z + 4]);
            // Station: decorative platform fully outside the track, right side.
            const station = this.proto(FILES.station, -Math.PI / 2);
            const sz = houseZ - roadLength * 0.2;
            place(station, sideX(station, 1, 0.5), sz);
            blocked.push([sz + station.box.min.z - 2, sz + station.box.max.z + 2]);
        }

        // City blocks: facade toward the track, packed along z on both sides.
        for (const side of [-1, 1] as const) {
            const rotY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
            const blocks = FILES.blocks.map(f => this.proto(f, rotY));
            let zCursor = houseZ;
            while (true) {
                const p = blocks[Math.floor(rand() * blocks.length)];
                const depth = p.box.max.z - p.box.min.z;
                const zTop = zCursor, zBottom = zCursor - depth;
                if (zBottom < zEnd) break;
                if (!isBlocked(zBottom, zTop)) place(p, sideX(p, side), zTop - p.box.max.z);
                zCursor = zBottom - (1.5 + rand() * 2.5); // small gap between blocks
            }
        }

        // Street props (modest counts; everything instanced).
        const lampL = this.proto(FILES.lamp, 0);             // arm (+X) toward the track
        const lampR = this.proto(FILES.lamp, Math.PI);
        for (let z = houseZ - 12; z > zEnd; z -= 36) {
            if (isBlocked(z - 1, z + 1)) continue;
            place(lampL, sideX(lampL, -1, 0.2), z);
            place(lampR, sideX(lampR, 1, 0.2), z);
        }
        const palm = this.proto(FILES.palm, rand() * Math.PI * 2);
        for (let z = houseZ - 30, i = 0; z > zEnd; z -= 55, i++) {
            const side = i % 2 === 0 ? -1 : 1;
            if (isBlocked(z - 3, z + 3)) continue;
            place(palm, sideX(palm, side, 2.5), z);
        }
        const fenceL = this.proto(FILES.fence, Math.PI / 2), fenceR = this.proto(FILES.fence, -Math.PI / 2);
        for (let z = houseZ - 60; z > zEnd; z -= 110) {
            if (isBlocked(z - 3, z + 3)) continue;
            place(fenceL, sideX(fenceL, -1, 0.1), z);
            place(fenceR, sideX(fenceR, 1, 0.1), z);
        }
        const bench = this.proto(FILES.bench, Math.PI / 2), ubox = this.proto(FILES.box, -Math.PI / 2), sign = this.proto(FILES.sign, -Math.PI / 2);
        place(bench, sideX(bench, -1, 0.3), houseZ - 24);
        place(ubox, sideX(ubox, 1, 0.3), houseZ - 48);
        place(sign, sideX(sign, 1, 0.3), houseZ - roadLength * 0.75);

        // Emit: one InstancedMesh per prototype part.
        for (const [p, mats] of placements) {
            for (const part of p.parts) {
                const im = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
                const m = new THREE.Matrix4();
                mats.forEach((t, i) => im.setMatrixAt(i, m.multiplyMatrices(t, part.matrix)));
                im.instanceMatrix.needsUpdate = true;
                im.castShadow = false;
                im.receiveShadow = false;
                im.frustumCulled = false; // instances span the whole section
                im.name = 'scenery2';
                group.add(im);
            }
        }
    }
}
