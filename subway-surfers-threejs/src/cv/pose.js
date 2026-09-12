// PoseEngine — webcam capture + MediaPipe pose estimation + skeleton overlay.
// Emits per-frame landmarks to an onResults callback; drawing happens on the
// canvas passed in, sized to match the video feed.

// Vendored: the npm package is bundled and the wasm + model live in
// public/mediapipe/, so the game works with no internet connection.
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/pose_landmarker_lite.task";

// Skeleton edges over MediaPipe's 33-landmark model (subset that reads well).
const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],   // arms + shoulders
    [11, 23], [12, 24], [23, 24],                        // torso + hips
    [23, 25], [25, 27], [24, 26], [26, 28],              // legs
    [27, 31], [28, 32],                                  // feet
];

export class PoseEngine {
    constructor({
        video, canvas, onResults = null, onStatus = null, onDraw = null,
        lowPower = false,
    }) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.onResults = onResults;
        this.onStatus = onStatus || (() => {});
        this.onDraw = onDraw; // called after the skeleton: onDraw(ctx, canvas)
        // Low-power: smaller camera feed + infer on every other frame.
        this.lowPower = lowPower;
        this._frameParity = 0;
        this.landmarker = null;
        this.running = false;
        this.lastVideoTime = -1;
        this.fps = 0;
        this.inferMs = 0; // last frame's inference time (incl. downscale)
        this._fpsWindow = [];
        this.procCanvas = null; // downscaled inference input
        this.procCtx = null;
    }

    async init() {
        this.onStatus("Loading MediaPipe model…");
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: MODEL_PATH,
                delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
        });

        this.onStatus("Requesting webcam…");
        const stream = await navigator.mediaDevices.getUserMedia({
            // 60 fps halves the sampling delay on fast moves (jumps) when the
            // camera supports it; low-power boards stay at 30.
            video: this.lowPower
                ? { width: 640, height: 360, frameRate: { ideal: 30 } }
                : { width: 1280, height: 720, frameRate: { ideal: 60 } },
            audio: false,
        });
        this.video.srcObject = stream;
        await new Promise(resolve => {
            this.video.onloadedmetadata = () => resolve();
        });
        await this.video.play();
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;

        // The display stays at full resolution, but inference runs on a
        // downscaled copy — the model's input is tiny anyway, and feeding it
        // 720p only adds GPU upload/preprocess latency.
        const PROC_W = 640;
        if (this.video.videoWidth > PROC_W) {
            const s = PROC_W / this.video.videoWidth;
            this.procCanvas = document.createElement("canvas");
            this.procCanvas.width = PROC_W;
            this.procCanvas.height = Math.round(this.video.videoHeight * s);
            this.procCtx = this.procCanvas.getContext("2d");
        }
        this.onStatus("Running");
    }

    start() {
        this.running = true;
        this._loop();
    }

    stop() {
        this.running = false;
    }

    _loop() {
        if (!this.running) return;
        if (this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;
            if (this.lowPower && (this._frameParity ^= 1)) {
                requestAnimationFrame(() => this._loop());
                return;
            }
            const t = performance.now();
            let source = this.video;
            if (this.procCtx) {
                this.procCtx.drawImage(
                    this.video, 0, 0, this.procCanvas.width, this.procCanvas.height
                );
                source = this.procCanvas;
            }
            const result = this.landmarker.detectForVideo(source, t);
            this.inferMs = performance.now() - t;
            this._trackFps(t);
            const landmarks = result.landmarks && result.landmarks[0];
            this._draw(landmarks || null);
            if (this.onResults) this.onResults(landmarks || null, this.fps);
        }
        requestAnimationFrame(() => this._loop());
    }

    _trackFps(now) {
        this._fpsWindow.push(now);
        while (this._fpsWindow.length && now - this._fpsWindow[0] > 1000) {
            this._fpsWindow.shift();
        }
        this.fps = this._fpsWindow.length;
    }

    _draw(landmarks) {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.onDraw) this.onDraw(ctx, canvas);
        if (!landmarks) return;

        const px = lm => [lm.x * canvas.width, lm.y * canvas.height];
        const visible = lm => lm && (lm.visibility === undefined || lm.visibility > 0.4);

        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0, 230, 118, 0.9)";
        for (const [a, b] of POSE_CONNECTIONS) {
            if (!visible(landmarks[a]) || !visible(landmarks[b])) continue;
            const [ax, ay] = px(landmarks[a]);
            const [bx, by] = px(landmarks[b]);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        }

        // Body joints only — the face/finger landmark clusters are noise here.
        const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
        ctx.fillStyle = "rgba(255, 64, 129, 0.95)";
        for (const i of JOINTS) {
            if (!visible(landmarks[i])) continue;
            const [x, y] = px(landmarks[i]);
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Hip center — the anchor point the gesture layer will use.
        const hipX = (landmarks[23].x + landmarks[24].x) / 2 * canvas.width;
        const hipY = (landmarks[23].y + landmarks[24].y) / 2 * canvas.height;
        ctx.fillStyle = "rgba(255, 235, 59, 0.95)";
        ctx.beginPath();
        ctx.arc(hipX, hipY, 9, 0, Math.PI * 2);
        ctx.fill();
    }
}
