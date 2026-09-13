import {load3DModel} from '@/Game/utils/model';
import * as THREE from 'three';
import Game from '.';
import {playerStatus} from './const';
import {ControlPlayer} from './contorlPlayer';

import {EventEmitter} from 'events';
import {FINN_POLISH} from './envart';
// @ts-ignore — plain JS module (Phase 6 material experiment)
import {auditFinn, createFinnPolish} from './FinnPolish.mjs';

const PLAYER_MODEL = '/assets/glb/finn.glb';
const ANIM_DONOR = '/assets/glb/player1.glb';

// Every clip the game plays. Clips baked into the player model are used
// as-is; any missing name is borrowed from the donor and retargeted.
const REQUIRED_CLIPS = [
    'run', 'jump', 'roll', 'fall', 'die', 'dance', 'idle', 'lookback', 'runlookback',
];

// Finn ships without animation clips, so borrow player1's Mixamo clips (the
// two rigs share bone names). Keep only rotation tracks of bones Finn has:
// position/scale tracks are authored for player1's armature (cm scale, X-90
// root) and would distort Finn's meter-scale rig — and the Hips rotation
// carries that root correction too, so it stays out as well. The game moves
// the model root itself, so no root motion is lost.
async function loadDonorClips(target: THREE.Object3D): Promise<THREE.AnimationClip[]> {
    const {animations = []} = await load3DModel(ANIM_DONOR);
    const boneNames = new Set<string>();
    target.traverse(o => {
        if ((o as THREE.Bone).isBone) boneNames.add(o.name);
    });
    return animations.map(clip => {
        const tracks = clip.tracks
            .filter(t => {
                const [node, prop] = t.name.split('.');
                return prop === 'quaternion' && node !== 'mixamorigHips' && boneNames.has(node);
            })
            .map(t => t.clone());
        return new THREE.AnimationClip(clip.name, clip.duration, tracks);
    });
}

export default class Player extends EventEmitter {
    static instance: Player;
    playerAnimationMixer: THREE.AnimationMixer | null = null;
    mixer: THREE.AnimationMixer | null = null;
    game!: Game;
    scene: THREE.Scene = new THREE.Scene();
    allAnimate = {} as any;
    playerScene: THREE.Object3D | any;
    camera: THREE.PerspectiveCamera | any;
    controlPlayer: ControlPlayer | any;
    light!: THREE.DirectionalLight;
    collision!: boolean;
    boxHelper!: THREE.BoxHelper;
    boundingBoxMesh: THREE.Mesh = new THREE.Mesh();
    // Phase 6: reversible material-only polish controller for the cached
    // Finn root. Disposed before every legacy material pass (respawn) so that
    // pass writes the ORIGINAL materials, then re-created and applied once.
    polish: any = null;
    audit: any = null;


    constructor() {
        super();
        if (Player.instance) {
            return Player.instance;
        }
        Player.instance = this;
        this.game = new Game();
        this.scene = this.game.scene;
        this.camera = this.game.camera.perspectiveCamera;
        this.createPlayer();
        this.collision = false;

    }
    // 创建玩家
    async createPlayer(first: boolean = true) {
        const {scene: playerScene, animations = []} = await load3DModel(PLAYER_MODEL);
        // Native clips (baked into the model) win; borrow whatever is missing.
        // Restore original material bindings before the legacy pass below
        // rewrites emissive/metalness (cached model: same object on respawn).
        this.polish?.dispose();
        this.polish = null;
        const nativeNames = new Set(animations.map(c => c.name));
        let clips: THREE.AnimationClip[] = [...animations];
        const missing = REQUIRED_CLIPS.filter(n => !nativeNames.has(n));
        if (missing.length) {
            const donor = await loadDonorClips(playerScene);
            clips = clips.concat(donor.filter(c => missing.includes(c.name)));
        }
        playerScene.traverse((child: any) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material.emissive = child.material.color;
                child.material.emissiveMap = child.material.map;
                child.material.metalness = 0;
            }
            // The model object is cached across respawns, so the death pose
            // stays baked into the bones — reset the skeleton to bind pose.
            if (child.isSkinnedMesh) {
                child.skeleton.pose();
            }
        });
        // Runtime audit (after the legacy material setup, before polish).
        this.audit = auditFinn(playerScene, animations);
        if (import.meta.env.DEV && first) console.log('[finn audit]', JSON.stringify(this.audit, null, 2));
        try {
            this.polish = createFinnPolish(playerScene);
            this.polish.setMode(FINN_POLISH);
        } catch (err) {
            console.warn('[finn polish] not applied:', (err as Error).message);
            this.polish = null;
        }
        playerScene.position.set(0, 20, 5);
        first && playerScene.rotateY(Math.PI);
        playerScene.scale.set(2.8, 2.8, 2.8);

        this.playerAnimationMixer = new THREE.AnimationMixer(playerScene);
        this.mixer = new THREE.AnimationMixer(playerScene);
        this.allAnimate = {};

        for (const animate of clips) {
            const actionName = animate.name;
            // Donor clips (player1) carry junk frames and odd timing, so they
            // get subclipped/rescaled; native clips play as authored.
            const isNative = nativeNames.has(actionName);
            let action = this.mixer.clipAction(animate);
            if (actionName === playerStatus.JUMP) {
                if (!isNative) {
                    const actionClip = THREE.AnimationUtils.subclip(animate, 'run', 12, 30);
                    action = this.mixer.clipAction(actionClip);
                }
                action.loop = THREE.LoopOnce;
                // 播放到最后一帧
                action.clampWhenFinished = true;
                action.timeScale = 1;
            }
            if (actionName === playerStatus.RUN) {
                action.timeScale = isNative ? 1 : 1.1;
            }
            if (actionName === playerStatus.ROLL) {
                if (!isNative) {
                    const actionClip = THREE.AnimationUtils.subclip(animate, 'run', 0, 44);
                    action = this.mixer.clipAction(actionClip);
                    action.timeScale = 2;
                }
                action.loop = THREE.LoopOnce;
                // 播放到最后一帧s
                action.clampWhenFinished = true;
            }
            if (actionName === playerStatus.LOOKBACK || actionName === playerStatus.RUNLOOKBACK) {
                action.loop = THREE.LoopOnce;
                action.timeScale = isNative ? 1 : 1.8;
                action.clampWhenFinished = true;
            }
            if (actionName === playerStatus.FALL) {
                if (!isNative) {
                    const actionClip = THREE.AnimationUtils.subclip(animate, 'run', 3, 12);
                    action = this.mixer.clipAction(actionClip);
                    action.loop = THREE.LoopOnce;
                    action.timeScale = 0.2;
                }
                // native fall keeps the default loop so it holds while airborne
            }
            if (actionName === playerStatus.DIE) {
                action.loop = THREE.LoopOnce;
                // 播放到最后一帧s
                action.clampWhenFinished = true;
                // 播放到最后一帧s
                // action.clampWhenFinished = true;
                // action.timeScale = 0.2;
            }

            this.allAnimate[actionName as playerStatus] = action;
        }
        this.playerScene = playerScene;
        this.scene.add(playerScene);
        // Respawn replaces the light; the old one is already off the scene
        // (restart empties it) but its shadow-map render target is GPU memory
        // that only dispose() returns.
        this.light?.dispose();
        this.light = new THREE.DirectionalLight(0xffffff, 1);
        this.light.position.set(0, 10, 5);
        this.light.lookAt(new THREE.Vector3(0, 100, 5));
        this.light.castShadow = true;
        const cam = this.light.shadow.camera;
        cam.near = 0.1;
        cam.far = 120;
        cam.left = -20;
        cam.right = 20;
        cam.bottom = -20;
        // const helper = new THREE.DirectionalLightHelper(this.light, 0.5);
        this.scene.add(this.light);
        // this.scene.add(helper);


        const control = new ControlPlayer(playerScene, this.mixer, 'dance', this.allAnimate);
        this.controlPlayer = control;
        this.controlPlayer.on('collision', () => {
            this.collision = true;
            setTimeout(() => {
                this.collision = false;
            }, 300);
        });
    }
    updateCamrera(delta: number) {
        const playerPosition = this.playerScene?.position;
        const lookAtCamera = new THREE.Vector3(
            this.playerScene?.position.x,
            this.playerScene?.position.y + 5.8,
            this.playerScene?.position.z
        );
        this.camera.position.set(playerPosition.x, playerPosition.y + 9, playerPosition.z + 17);
        if (this.collision) {
            this.shakeCamera(delta);
        }
        this.camera.lookAt(lookAtCamera);
    }
    shakeCamera(delta: number) {
        const randomOffset = new THREE.Vector3(Math.sin(delta * Math.PI) * 5, Math.random() * 0, 0);

        // 修改摄像机的位置
        this.camera.position.add(randomOffset);
    }

    update(delta: number) {
        if (this.controlPlayer) {
            this.controlPlayer?.update(delta);
        }
        if (this.mixer) {
            this.mixer?.update(delta);
            // CV layer: pose mimicry overrides arm bones after the mixer.
            (window as any).__cvAfterMixer?.(this.playerScene);
            this.updateCamrera(delta);
        }

    }
}
