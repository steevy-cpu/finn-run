import * as THREE from 'three';
import Sizes from './size';
import Environment from './environment';
import Player from './player';
import Renderer from './render';
import Stats from 'stats.js';
import {EventEmitter} from 'events';
import {cache} from '@/Game/utils/model';
import {disposeNode} from './utils/dispose';
import { GameScene } from './scene';
import Camera from './camera';
import Time from './time';
// @ts-ignore — plain JS module (Phase 5 VFX kit)
import {FinnEffects} from './FinnEffects.mjs';
import {Pursuer} from './pursuer';
import {PURSUER, PURSUER_URL} from './envart';
// FPS overlay is a dev tool only; never shown in the production build.
const stats = import.meta.env.DEV ? new Stats() : null;
if (stats) document.body.appendChild(stats.dom);

export default class Game extends EventEmitter {
    static instance: Game;
    canvas: HTMLElement | undefined;
    sizes!: Sizes;
    time!: Time;
    renderer!: Renderer;
    scene!: THREE.Scene;
    camera!: Camera;
    environment: Environment | undefined;
    player: Player | undefined;
    clock: THREE.Clock = new THREE.Clock();
    windowResizeFn!: (e: Event) => void;
    // Phase 5 VFX: cosmetic only, lives under the identity-transformed scene,
    // outside every collision group. Runs only while a run is live.
    fx: any;
    fxEnabled: boolean = true;
    // Phase 7: cosmetic pursuer (Arturo), opt-in via ?arturo=1. Observes
    // game state; never influences it.
    pursuer: Pursuer | null = null;
    private onVisibility = () => {
        if (document.hidden) this.fx?.setRunning(false);
        else if (this.fxEnabled && this.player?.controlPlayer?.gameStatus === 'start') this.fx?.setRunning(true);
    };
    constructor(canvas?: HTMLElement) {
        super();
        if (Game.instance) {
            return Game.instance;
        }
        Game.instance = this;
        this.canvas = canvas;
        // 尺寸相关
        this.sizes = new Sizes();
        // 监听window变化
        this.sizes.on("resize", () => {
            this.resize();
        })
        this.time = new Time();
        // 做每一帧的动作更新
        this.time.on("update", () => {
            this.update();
        })
        // scene 场景
        this.scene = new GameScene().scene;
        // 相机
        this.camera = new Camera();
        // 画布
        this.renderer = new Renderer();
        // 环境
        this.environment = new Environment();
        this.player = new Player();
        this.fx = new FinnEffects(THREE, this.scene, {scale: 1.6});
        this.on('gameStatus', (status: string) => {
            // The restart handler empties the scene, which also drops the
            // effects group — re-attach it before any run can emit.
            if (this.fx.group.parent !== this.scene) this.scene.add(this.fx.group);
            // 'start' = actual gameplay after the countdown; anything else clears.
            this.fx.setRunning(status === 'start' && this.fxEnabled);
        });
        document.addEventListener('visibilitychange', this.onVisibility);
        if (PURSUER) this.pursuer = new Pursuer(this, {url: PURSUER_URL});
        this.resize();
        this.resource();
    }
    update() {
        const delta = this.time.delta / 1000;
        stats?.update();
        // VFX advance with the transforms about to be rendered (seconds).
        this.fx?.update(delta, this.camera.perspectiveCamera);
        this.renderer.update();
        this.player?.update && this.player.update(delta);
        // After Finn moved: the pursuer reads his transform, never writes it.
        this.pursuer?.update(delta, this.player?.playerScene, this.player?.controlPlayer);
    }
    resource() {
        THREE.DefaultLoadingManager.onLoad = () => {
            this.emit('progress', {type: 'successLoad'});
        };

        THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            this.emit('progress', {type: 'onProgress', url: url, itemsLoaded: itemsLoaded, itemsTotal: itemsTotal});
        };

        THREE.DefaultLoadingManager.onError = () => {
            this.emit('progress', {type: 'error'});
        };
    }
    removelistener() {
        window.removeEventListener('resize', this.windowResizeFn);
        document.removeEventListener('visibilitychange', this.onVisibility);
    }
    resize() {
        this.renderer.resize();
        this.camera.resize();
    }
    disposeGame() {
        cache?.clearCacheData();
        this.removelistener();
        this.fx?.dispose();
        this.pursuer?.dispose();
        this.pursuer = null;
        this.player?.polish?.dispose();
        disposeNode(this.scene);
        this.scene.clear();
        this.renderer.dispose();
        // this.renderer = null;
    }
}
