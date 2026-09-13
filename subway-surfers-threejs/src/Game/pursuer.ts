// Phase 7 — Arturo, the cosmetic pursuer.
//
// Owns ONE actor (model + mixer) for the life of the Game. Purely
// presentational: it never touches physics, collisions, scoring, mistakes
// or game-over; it only *observes* committed game state (gameStatus events
// and the ControlPlayer's mistake count) and Finn's transform.
//
// Placement: Arturo runs on Finn's own trail — a ring buffer of where Finn
// was — a fixed gap behind him (Finn travels toward -Z, so "behind" is +Z),
// with a small lateral offset toward the road centre so he peeks out from
// behind Finn instead of being covered by him at the current camera
// (camera sits at Finn +17 z / +9 y looking at Finn +5.8 y). Because the
// trail is the path Finn survived, Arturo mostly runs clear of obstacles;
// where the trail passes *through* one (a jumped barrier), a short upward
// ray from his feet detects the overlap and he is hidden for that stretch.
//
// Lifecycle: the restart handler empties the scene, so the owned group is
// re-attached on every 'start'. Loading happens once; a load failure leaves
// the pursuer inert (no throw, no retry storm). dispose() releases owned
// GPU resources, the mixer and the listener.
import * as THREE from 'three';
import type Game from '.';
import {roadWidth} from './environment';

export type PursuerOptions = {
    url: string;
    /** Runtime height Arturo is scaled to (world units). Finn ≈ 5.3. */
    height?: number;
    /** Base gap behind Finn along Z (world units). */
    gap?: number;
    /** Lateral offset (world units); applied toward the road centre. */
    lateral?: number;
    /** Extra closeness per committed mistake (units), decays back. */
    pressure?: number;
    /** Gap growth per second of clean running (units/s), bounded. */
    drift?: number;
    /** How fast (1/s) the actual gap chases its target. */
    follow?: number;
    /** Upper clamp for the run clip's timeScale (cadence cap). */
    maxCadence?: number;
    /** Authored facing: 'auto' reads it from the bind pose (head→face);
     *  'z+' / 'z-' force it. The run direction is -Z. */
    facing?: 'auto' | 'z+' | 'z-';
};

type Trail = {x: number; y: number; z: number}; // y = Finn's last RESTING root height

export class Pursuer {
    readonly group = new THREE.Group();
    readonly opts: Required<PursuerOptions>;
    state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    error: string | null = null;
    /** Measured asset facts (filled after load). */
    report: any = null;
    active = false;      // a run is live (between 'start' and 'end'/'ready')
    hidden = true;       // visibility decision for this frame
    mixer: THREE.AnimationMixer | null = null;
    clips: Record<string, THREE.AnimationAction> = {};
    current: string | null = null;
    gap = 0;             // actual gap
    gapTarget = 0;
    private pressureLeft = 0;
    private lastMistakes = 0;
    reactions = 0;       // committed mistake increases reacted to (for tests)
    private trail: Trail[] = [];
    private lastZ: number | null = null;
    speed = 0;
    runTimeScaleWanted = 0;
    private static readonly TRAIL_MAX = 240;
    private root: THREE.Object3D | null = null;
    private owned: {geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material>; textures: Set<THREE.Texture>} =
        {geometries: new Set(), materials: new Set(), textures: new Set()};
    private ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0, 1);
    private tmp = new THREE.Vector3();
    private onStatus: (s: string) => void;

    constructor(private game: Game, options: PursuerOptions) {
        this.opts = {
            height: 5.3, gap: 4.5, lateral: 2.0, pressure: 1.4, drift: 0.12, follow: 2.5, facing: 'auto', maxCadence: 1.6,
            ...options,
        };
        this.group.name = 'pursuer';
        this.group.visible = false;
        this.gap = this.gapTarget = this.opts.gap;
        this.onStatus = (status: string) => this.handleStatus(status);
        game.on('gameStatus', this.onStatus);
        this.load().catch(() => {});
    }

    // ---------- loading ----------
    async load() {
        if (this.state !== 'idle') return;
        this.state = 'loading';
        try {
            const {GLTFLoader} = await import('three/examples/jsm/loaders/GLTFLoader.js');
            const gltf = await new GLTFLoader().loadAsync(this.opts.url);
            this.adopt(gltf.scene, gltf.animations || []);
            this.state = 'ready';
            if (this.active) { this.attach(); this.play('run'); } // run started before the asset arrived
        } catch (err: any) {
            this.state = 'failed';
            this.error = err?.message || String(err);
            console.warn('[pursuer] Arturo not available:', this.error);
        }
    }

    private adopt(scene: THREE.Group, animations: THREE.AnimationClip[]) {
        // Own every GPU resource the file brought in so dispose() can free it.
        let triangles = 0, bones = 0, maxInfluences = 0;
        const materials = new Set<THREE.Material>();
        const textures = new Set<THREE.Texture>();
        const cameras: string[] = [], lights: string[] = [];
        scene.traverse((o: any) => {
            if (o.isCamera) cameras.push(o.name);
            if (o.isLight) lights.push(o.name);
            if (o.isBone) bones++;
            if (o.isMesh) {
                o.castShadow = false; o.receiveShadow = false;
                o.raycast = () => {}; // cosmetic: never pickable by any ray
                o.frustumCulled = false; // skinned bounds lag the pose
                const g: THREE.BufferGeometry = o.geometry;
                this.owned.geometries.add(g);
                const idx = g.index ? g.index.count : g.attributes.position.count;
                triangles += idx / 3;
                if (g.attributes.skinIndex) maxInfluences = Math.max(maxInfluences, g.attributes.skinIndex.itemSize);
                for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                    materials.add(m); this.owned.materials.add(m);
                    for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
                        if (m[k]) { textures.add(m[k]); this.owned.textures.add(m[k]); }
                    }
                }
            }
        });
        // Material: the file omits metallicFactor (glTF default 1 → a black,
        // mirror-like diffuse under our lights) and carries a 0.41 roughness
        // + KHR specular. Finn is matte (roughness 0.9, metalness 0) and
        // self-lit (emissiveMap = base map). Arturo's own material gets the
        // same treatment so both read alike under the unchanged lighting.
        for (const m of materials as Set<any>) {
            m.metalness = 0;
            m.roughness = 0.9;
            if (m.specularColor) m.specularColor.set(0xffffff);
            if ('specularIntensity' in m) m.specularIntensity = 0.2;
            if (m.map && !m.emissiveMap) { m.emissiveMap = m.map; m.emissive.set(0xffffff); }
            m.needsUpdate = true;
        }
        // Embedded cameras/lights would change the scene: drop them.
        for (const o of [...scene.children]) if ((o as any).isCamera || (o as any).isLight) scene.remove(o);

        // Facing from the bind pose: head→face and foot→toe both point the
        // way the character looks. Positive = authored facing +Z. (The
        // delivery note said +Z; the file actually faces -Z — measure it.)
        const dirZ = (a: string, b: string) => {
            const A = scene.getObjectByName(a), B = scene.getObjectByName(b);
            if (!A || !B) return null;
            const pa = A.getWorldPosition(new THREE.Vector3()), pb = B.getWorldPosition(new THREE.Vector3());
            return +(pb.z - pa.z).toFixed(4);
        };
        scene.updateMatrixWorld(true);
        const facing = {headToFace: dirZ('Head', 'headfront'), footToToe: dirZ('LeftFoot', 'LeftToeBase')};
        const authoredPlusZ = this.opts.facing === 'auto'
            ? ((facing.headToFace ?? facing.footToToe ?? 1) > 0)
            : this.opts.facing === 'z+';
        // Normalise: soles at y=0, centred on x/z, scaled to the target height,
        // facing the running direction (-Z) like Finn.
        // Bounds from the SKINNED bind pose: Box3.setFromObject ignores skinning,
        // so an armature-scaled rig (cm rig, metre mesh) would be mis-measured.
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        const mb = new THREE.Box3();
        scene.traverse((o: any) => {
            if (!o.isMesh) return;
            if (o.isSkinnedMesh) { o.computeBoundingBox(); mb.copy(o.boundingBox); }
            else { o.geometry.computeBoundingBox(); mb.copy(o.geometry.boundingBox); }
            mb.applyMatrix4(o.matrixWorld);
            box.union(mb);
        });
        const size = box.getSize(new THREE.Vector3());
        const scale = size.y > 0 ? this.opts.height / size.y : 1;
        const pivot = new THREE.Group();
        pivot.name = 'pursuer-actor';
        scene.position.set(-(box.min.x + size.x / 2), -box.min.y, -(box.min.z + size.z / 2));
        pivot.add(scene);
        pivot.scale.setScalar(scale);
        if (authoredPlusZ) pivot.rotation.y = Math.PI; // turn to face -Z
        this.root = pivot;
        this.group.add(pivot);

        this.mixer = new THREE.AnimationMixer(scene);
        // Contract: looping, in-place clips on the character's own rig. Scale
        // tracks are never wanted at runtime, and a position track whose travel
        // is a large fraction of the model's height is root motion (or a unit
        // mismatch between clip and mesh) — strip those so the actor stays on
        // its pivot; small hip bobs survive.
        const worldScaleOf = (nodeName: string) => {
            const n = scene.getObjectByName(nodeName);
            return n ? n.getWorldScale(new THREE.Vector3()).x : 1;
        };
        const travel: Record<string, number> = {};
        animations = animations.map(clip => {
            const keep = clip.tracks.filter(t => {
                const [node, prop] = [t.name.slice(0, t.name.lastIndexOf('.')), t.name.split('.').pop()];
                if (prop === 'scale') return false;
                if (prop !== 'position') return true;
                let range = 0;
                for (let i = 0; i < 3; i++) {
                    let lo = Infinity, hi = -Infinity;
                    for (let k = i; k < t.values.length; k += 3) { lo = Math.min(lo, t.values[k]); hi = Math.max(hi, t.values[k]); }
                    range = Math.max(range, hi - lo);
                }
                // Track values are in the bone's local units (cm under a 0.01
                // armature); compare in world units against the model height.
                const world = range * worldScaleOf(node);
                travel[`${clip.name}:${node}`] = +world.toFixed(4);
                return world < 0.25 * size.y;
            });
            const c = new THREE.AnimationClip(clip.name, clip.duration, keep);
            (c as any).droppedTracks = clip.tracks.length - keep.length;
            return c;
        });
        const names = animations.map(c => c.name);
        const pick = (want: RegExp, fallback?: THREE.AnimationClip) =>
            animations.find(c => want.test(c.name)) || fallback;
        const run = pick(/run|sprint|charge/i, animations.length === 1 ? animations[0] : undefined);
        const idle = pick(/idle|stand|breath/i);
        if (run) this.clips.run = this.mixer.clipAction(run);
        if (idle) this.clips.idle = this.mixer.clipAction(idle);
        for (const a of Object.values(this.clips)) { a.loop = THREE.LoopRepeat; a.clampWhenFinished = false; }

        this.report = {
            url: this.opts.url,
            bounds: {x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3)},
            runtimeScale: +scale.toFixed(4),
            runtimeHeight: this.opts.height,
            triangles: Math.round(triangles),
            materials: materials.size,
            textures: [...textures].map(t => ({w: t.image?.width, h: t.image?.height})),
            bones,
            maxInfluences,
            clips: animations.map(c => ({name: c.name, duration: +c.duration.toFixed(3), tracks: c.tracks.length, dropped: (c as any).droppedTracks})),
            mapped: {run: run?.name ?? null, idle: idle?.name ?? null},
            embedded: {cameras, lights},
            names,
            facing: {...facing, authoredPlusZ, rotatedY: authoredPlusZ ? Math.PI : 0},
            rootTravelWorld: travel,
            materialAudit: [...materials].map((m: any) => ({
                type: m.type, side: m.side, roughness: m.roughness, metalness: m.metalness,
                emissiveIntensity: m.emissiveIntensity, hasEmissiveMap: !!m.emissiveMap,
                specularColor: m.specularColor ? m.specularColor.getHexString() : null, ior: m.ior ?? null,
                transparent: m.transparent,
            })),
            fittedToFinn: null,
            stride: null,
        };
        this.measureStride(animations);
    }

    /** Foot travel per run cycle (world units at the current pivot scale):
     *  step the mixer through the clip once and take the toe's z range
     *  relative to the hips. Used to sync the cycle rate to the real speed. */
    private stride = 0;
    private runDuration = 0;
    private measureStride(animations: THREE.AnimationClip[]) {
        const run = animations.find(c => this.clips.run && c.name === (this.clips.run.getClip().name));
        if (!run || !this.mixer || !this.root) return;
        const toe = this.root.getObjectByName('LeftToeBase') || this.root.getObjectByName('LeftFoot');
        const hips = this.root.getObjectByName('Hips');
        if (!toe || !hips) return;
        const action = this.clips.run;
        action.reset().play();
        const N = 24, tp = new THREE.Vector3(), hp = new THREE.Vector3(), mb = new THREE.Box3();
        let lo = Infinity, hi = -Infinity, minY = Infinity;
        const skinned: any[] = []; this.root.traverse((o: any) => { if (o.isSkinnedMesh) skinned.push(o); });
        for (let i = 0; i <= N; i++) {
            this.mixer.setTime(run.duration * i / N);
            this.root.updateMatrixWorld(true);
            toe.getWorldPosition(tp); hips.getWorldPosition(hp);
            const rel = tp.z - hp.z;
            lo = Math.min(lo, rel); hi = Math.max(hi, rel);
            for (const m of skinned) { m.computeBoundingBox(); mb.copy(m.boundingBox).applyMatrix4(m.matrixWorld); minY = Math.min(minY, mb.min.y); }
        }
        action.stop();
        this.mixer.setTime(0);
        const scale = this.root.scale.x;
        this.stride = (hi - lo) / scale; // per unit of pivot scale
        this.runDuration = run.duration;
        // Lowest point of the run cycle → track level (pivot-local units).
        const inner = this.root.children[0];
        if (inner && isFinite(minY)) inner.position.y -= minY / scale;
        if (this.report) this.report.stride = {perCycleAtScale1: +this.stride.toFixed(4), cycle: run.duration, runCycleMinYAtScale1: +(minY / scale).toFixed(4)};
    }

    /** Scale Arturo to Finn's ACTUAL runtime height (skinned world bounds),
     *  measured once when both actors exist. */
    private fitted = false;
    private restRootY = 0;
    private restY = 0;
    private fitToFinn(finn: THREE.Object3D) {
        if (this.fitted || !this.root || !this.report) return;
        finn.updateMatrixWorld(true);
        const box = new THREE.Box3(), mb = new THREE.Box3();
        finn.traverse((o: any) => {
            if (!o.isMesh) return;
            if (o.isSkinnedMesh) { o.computeBoundingBox(); mb.copy(o.boundingBox); } else { o.geometry.computeBoundingBox(); mb.copy(o.geometry.boundingBox); }
            mb.applyMatrix4(o.matrixWorld); box.union(mb);
        });
        const finnHeight = box.max.y - box.min.y;
        if (!(finnHeight > 1)) return; // Finn not measurable yet
        const scale = finnHeight / this.report.bounds.y;
        this.root.scale.setScalar(scale);
        this.fitted = true;
        // Finn's root rests this far above the rail surface (his soles are
        // modelled below the root); Arturo's soles go on the surface itself.
        this.restRootY = finn.position.y;
        this.report.fittedToFinn = {finnHeight: +finnHeight.toFixed(3), finnRootY: +finn.position.y.toFixed(3), finnSoleY: +box.min.y.toFixed(3), arturoScale: +scale.toFixed(4), arturoHeight: +finnHeight.toFixed(3)};
    }

    // ---------- game state (observed, never decided) ----------
    private handleStatus(status: string) {
        if (status === 'start') {
            this.active = true;
            this.attach();
            this.trail.length = 0;
            this.lastZ = null;
            this.restY = this.restRootY;
            this.gap = this.gapTarget = this.opts.gap;
            this.pressureLeft = 0;
            this.lastMistakes = 0;
            this.play('run');
        } else if (status === 'end') {
            this.active = false;
            this.play('idle');
        } else {
            // 'ready': Finn is respawning and the scene was just emptied.
            this.active = false;
            this.hidden = true;
            this.group.visible = false;
        }
    }

    /** Re-add the owned group after the restart handler emptied the scene. */
    attach() {
        if (this.group.parent !== this.game.scene) this.game.scene.add(this.group);
    }

    private play(name: 'run' | 'idle') {
        const next = this.clips[name] || this.clips.run || this.clips.idle;
        if (!next || !this.mixer) return;
        const prev = this.current ? this.clips[this.current] : null;
        if (prev === next) return;
        next.reset().play();
        if (prev) { prev.crossFadeTo(next, 0.25, false); } 
        this.current = name;
    }

    // ---------- per frame (called from Game.update, seconds) ----------
    update(delta: number, finn: THREE.Object3D | undefined, ctl: any) {
        if (this.state !== 'ready' || !this.root || !finn) return;
        if (!this.active) {
            // Idle after 'end': hold position, keep the idle loop breathing.
            if (this.group.visible && this.mixer) this.mixer.update(delta);
            return;
        }
        if (!ctl?.gameStart) return; // paused / pre-game: freeze
        this.attach();
        this.fitToFinn(finn);
        // Forward speed from Finn's own motion (units/s, smoothed); the run
        // cycle rate follows it so the feet plant instead of sliding.
        if (this.lastZ !== null && delta > 0) {
            const v = (this.lastZ - finn.position.z) / delta;
            this.speed += (v - this.speed) * Math.min(1, 4 * delta);
        }
        this.lastZ = finn.position.z;
        if (this.clips.run && this.stride > 0 && this.root) {
            const strideWorld = this.stride * this.root.scale.x;
            const wanted = (this.speed / strideWorld) * this.runDuration; // cycles/s × s
            // Physically exact would be ~2.6 at full speed (a 5 cycle/s blur);
            // capped so he reads as sprinting beside Finn's 1.14 cycle/s.
            this.runTimeScaleWanted = wanted;
            this.clips.run.timeScale = THREE.MathUtils.clamp(wanted, 0.6, this.opts.maxCadence);
        }

        // Committed mistakes: react once per increase (not per collision callback).
        const mistakes = ctl.smallMistake ?? 0;
        if (mistakes > this.lastMistakes) {
            this.reactions += mistakes - this.lastMistakes;
            this.pressureLeft = Math.min(this.pressureLeft + 3.0, 6.0); // seconds of "closing in"
            this.lastMistakes = mistakes;
        }
        // Gap target: base, minus pressure while it lasts, plus bounded drift while clean.
        if (this.pressureLeft > 0) {
            this.pressureLeft = Math.max(0, this.pressureLeft - delta);
            this.gapTarget = Math.max(this.opts.gap - this.opts.pressure, this.gapTarget - 3 * delta);
        } else {
            this.gapTarget = Math.min(this.opts.gap * 1.6, this.gapTarget + this.opts.drift * delta);
        }
        const k = 1 - Math.exp(-this.opts.follow * delta);
        this.gap += (this.gapTarget - this.gap) * k;

        // Record Finn's trail (only while he moves forward). Height is his
        // last RESTING height (ground or a train roof) — no jump arcs: the
        // pursuer has no jump mechanic, he runs on the surface Finn ran on.
        const airborne = ctl.isJumping || !ctl.downCollide || ctl.fallingSpeed > 0;
        if (!airborne) this.restY = finn.position.y;
        const last = this.trail[this.trail.length - 1];
        if (!last || finn.position.z < last.z - 0.05) {
            this.trail.push({x: finn.position.x, y: this.restY, z: finn.position.z});
            if (this.trail.length > Pursuer.TRAIL_MAX) this.trail.shift();
        }
        // Sample the trail at z = finn.z + gap (behind), interpolating.
        const zWant = finn.position.z + this.gap;
        let sx = finn.position.x, sy = finn.position.y;
        for (let i = this.trail.length - 1; i > 0; i--) {
            const a = this.trail[i], b = this.trail[i - 1]; // a is newer (smaller z)
            if (b.z >= zWant && a.z <= zWant) {
                const t = (zWant - a.z) / Math.max(1e-6, b.z - a.z);
                sx = a.x + (b.x - a.x) * t; sy = a.y + (b.y - a.y) * t;
                break;
            }
        }
        if (this.trail.length && zWant > this.trail[0].z) { sx = this.trail[0].x; sy = this.trail[0].y; }
        // Lateral: toward the road centre so he shows beside Finn, not under him.
        const side = sx > 0.5 ? -1 : 1;
        const lateral = this.opts.lateral * side;
        const x = THREE.MathUtils.clamp(sx + lateral, -roadWidth / 2 + 1, roadWidth / 2 - 1);
        const y = Math.max(0, sy - this.restRootY); // soles on the rail surface, never below
        this.group.position.set(x, y, zWant);

        // Overlap with a passed obstacle → hide for that stretch (presentation only).
        this.hidden = this.overlapsObstacle(x, y, zWant, ctl);
        this.group.visible = !this.hidden;
        this.mixer?.update(delta);
    }

    private overlapsObstacle(x: number, y: number, z: number, ctl: any): boolean {
        const groups = (ctl?.environement?.obstacal || []).filter(Boolean);
        if (!groups.length) return false;
        this.ray.ray.origin.set(x, y + 0.2, z);
        this.ray.far = this.opts.height * 0.9;
        return this.ray.intersectObjects(groups, true).length > 0;
    }

    // ---------- teardown ----------
    dispose() {
        this.game.off('gameStatus', this.onStatus);
        this.mixer?.stopAllAction();
        if (this.mixer && this.root) this.mixer.uncacheRoot(this.root);
        this.group.removeFromParent();
        for (const t of this.owned.textures) t.dispose();
        for (const m of this.owned.materials) m.dispose();
        for (const g of this.owned.geometries) g.dispose();
        this.owned.textures.clear(); this.owned.materials.clear(); this.owned.geometries.clear();
        this.group.clear();
        this.root = null;
        this.mixer = null;
        this.clips = {};
        this.state = 'idle';
    }
}
