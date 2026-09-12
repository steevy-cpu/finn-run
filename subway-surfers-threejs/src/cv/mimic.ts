// mimic.ts — drives the character's Mixamo arm bones from MediaPipe pose
// landmarks, layered on top of the AnimationMixer each frame.
//
// Coordinate mapping: the character runs facing -z with the camera behind it,
// while the player faces their webcam and sees themselves mirrored. Mapping a
// landmark delta (dx, dy, dz) to character world space works out to a point
// reflection: (-dx, -dy, -dz) — same-side arms then move mirror-like.
import * as THREE from 'three';

type Landmark = {x: number; y: number; z: number; visibility?: number};

// Note: three's GLTFLoader sanitizes node names, stripping the "mixamorig:"
// colon — bones arrive as e.g. "mixamorigLeftArm".
const ARM_CHAIN = [
    {bone: 'mixamorigLeftArm', child: 'mixamorigLeftForeArm', a: 11, b: 13},
    {bone: 'mixamorigLeftForeArm', child: 'mixamorigLeftHand', a: 13, b: 15},
    {bone: 'mixamorigRightArm', child: 'mixamorigRightForeArm', a: 12, b: 14},
    {bone: 'mixamorigRightForeArm', child: 'mixamorigRightHand', a: 14, b: 16},
];

// Legs follow too, but only pre-game — during the run they belong to the
// run animation. Landmarks: 23/24 hips, 25/26 knees, 27/28 ankles.
const LEG_CHAIN = [
    {bone: 'mixamorigLeftUpLeg', child: 'mixamorigLeftLeg', a: 23, b: 25},
    {bone: 'mixamorigLeftLeg', child: 'mixamorigLeftFoot', a: 25, b: 27},
    {bone: 'mixamorigRightUpLeg', child: 'mixamorigRightLeg', a: 24, b: 26},
    {bone: 'mixamorigRightLeg', child: 'mixamorigRightFoot', a: 26, b: 28},
];
const ALL_CHAIN = [...ARM_CHAIN, ...LEG_CHAIN];

// Only mimic while these animations play; jump/roll/die keep both arms.
const MIMIC_STATUSES = new Set(['run', 'dance', 'idle']);
// Pre-game statuses: no clip is playing, so the whole body is ours to drive.
// Pre-game the character is turned to FACE the camera (see cv/index.ts), so
// sides swap like a real mirror: the player's left limb drives the
// character's right bone. The world-direction mapping stays the same.
const FULL_BODY_STATUSES = new Set(['dance', 'idle']);

const swapSide = (name: string) =>
    name.includes('Left') ? name.replace('Left', 'Right') : name.replace('Right', 'Left');

const MIN_VIS = 0.5;
const SMOOTH = 0.35; // slerp factor per frame toward the target pose

export class ArmMimic {
    enabled = true;
    private bones = new Map<string, THREE.Bone>();
    private restDirs = new Map<string, THREE.Vector3>();
    private model: THREE.Object3D | null = null;
    private tmpQ = new THREE.Quaternion();
    private tmpV = new THREE.Vector3();

    // Re-scan bones (called on first frame and again after player respawn).
    bind(model: THREE.Object3D) {
        this.model = model;
        this.bones.clear();
        this.restDirs.clear();
        model.traverse(obj => {
            if ((obj as THREE.Bone).isBone) {
                this.bones.set(obj.name, obj as THREE.Bone);
            }
        });
        for (const {bone, child} of ALL_CHAIN) {
            const b = this.bones.get(bone);
            const c = this.bones.get(child);
            if (b && c) {
                // Direction the bone points at rest, in its own local space.
                this.restDirs.set(bone, c.position.clone().normalize());
            }
        }
    }

    ready() {
        return ARM_CHAIN.every(({bone}) => this.restDirs.has(bone));
    }

    // Called after mixer.update(); overrides arm bone rotations.
    apply(model: THREE.Object3D, landmarks: Landmark[] | null, status: string) {
        if (!this.enabled || !landmarks) return;
        if (!MIMIC_STATUSES.has(status)) return;
        if (this.model !== model) this.bind(model);
        if (!this.ready()) return;

        model.updateWorldMatrix(true, true);

        const mirrored = FULL_BODY_STATUSES.has(status); // facing the camera
        const chains = mirrored ? ALL_CHAIN : ARM_CHAIN;
        for (const {bone: chainBone, a, b} of chains) {
            const boneName = mirrored ? swapSide(chainBone) : chainBone;
            const bone = this.bones.get(boneName);
            const rest = this.restDirs.get(boneName);
            if (!bone || !rest) continue;
            const la = landmarks[a];
            const lb = landmarks[b];
            if (!la || !lb) continue;
            if ((la.visibility ?? 1) < MIN_VIS || (lb.visibility ?? 1) < MIN_VIS) continue;

            // Landmark delta → character world direction (point reflection).
            const dir = this.tmpV.set(
                -(lb.x - la.x),
                -(lb.y - la.y),
                -((lb.z ?? 0) - (la.z ?? 0))
            );
            const len = dir.lengthSq();
            if (!Number.isFinite(len) || len < 1e-8) continue;
            dir.normalize();

            // World direction → bone-parent local space.
            const parent = bone.parent as THREE.Object3D;
            parent.getWorldQuaternion(this.tmpQ).invert();
            dir.applyQuaternion(this.tmpQ);

            const target = new THREE.Quaternion().setFromUnitVectors(rest, dir);
            bone.quaternion.slerp(target, SMOOTH);
        }
        // Children world matrices are refreshed by the renderer before drawing.
    }
}
