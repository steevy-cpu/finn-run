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
        lowPower = false, target = null,
    }) {
        // target(): normalized {x, y} of the guidance center (the calibrated
        // hip point), used to pick the player when several people are in view.
        this.target = target;
        // Player lock: once found, the camera input is cropped to a vertical
        // band around the player, so bystanders are excluded and inference is
        // cheaper. roi is normalized {x, w} (full height).
        this.track = { locked: false, roi: null, lost: 0 };
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
            numPoses: 3, // several people in view: we pick the player ourselves
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
        this.procCanvas = document.createElement("canvas");
        this.procCtx = this.procCanvas.getContext("2d", { willReadFrequently: false });
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
            const roi = this.track.locked ? this.track.roi : null;
            const source = this._prepareSource(roi);
            const result = this.landmarker.detectForVideo(source, t);
            this.inferMs = performance.now() - t;
            this._trackFps(t);
            // Map crop-relative landmarks back to full-frame coordinates.
            const poses = (result.landmarks || []).map(lm => roi
                ? lm.map(p => ({ ...p, x: roi.x + p.x * roi.w }))
                : lm);
            const landmarks = this.pickPose(poses);
            if (landmarks) {
                this.track.lost = 0;
                this._updateRoi(landmarks);
                this.track.locked = true;
            } else if (++this.track.lost > 8) {
                // Player gone: search the whole frame again.
                this.track.locked = false;
                this.track.roi = null;
            }
            this._draw(landmarks || null);
            if (this.onResults) this.onResults(landmarks || null, this.fps);
        }
        requestAnimationFrame(() => this._loop());
    }

    // Draw the (cropped) frame, downscaled to at most PROC_W wide, for inference.
    _prepareSource(roi) {
        const PROC_W = 640;
        const vw = this.video.videoWidth, vh = this.video.videoHeight;
        const sx = roi ? roi.x * vw : 0;
        const sw = roi ? roi.w * vw : vw;
        const scale = Math.min(1, PROC_W / sw);
        const cw = Math.max(64, Math.round(sw * scale));
        const ch = Math.max(64, Math.round(vh * scale));
        if (this.procCanvas.width !== cw || this.procCanvas.height !== ch) {
            this.procCanvas.width = cw;
            this.procCanvas.height = ch;
        }
        this.procCtx.drawImage(this.video, sx, 0, sw, vh, 0, 0, cw, ch);
        return this.procCanvas;
    }

    // Choose the player among detected people: the one whose hips are closest
    // to the guidance center, measured in that person's own torso lengths —
    // so a big (near) body in the zone beats a small (far) one behind them.
    pickPose(poses) {
        const vis = p => p && (p.visibility === undefined || p.visibility > 0.5);
        const aspect = (this.video.videoWidth || 16) / (this.video.videoHeight || 9);
        const target = (this.target && this.target()) || { x: 0.5, y: 0.55 };
        let best = null, bestScore = Infinity;
        for (const lm of poses) {
            if (!vis(lm[11]) || !vis(lm[12]) || !vis(lm[23]) || !vis(lm[24])) continue;
            const hx = (lm[23].x + lm[24].x) / 2, hy = (lm[23].y + lm[24].y) / 2;
            const shx = (lm[11].x + lm[12].x) / 2, shy = (lm[11].y + lm[12].y) / 2;
            const torso = Math.hypot((shx - hx) * aspect, shy - hy);
            if (torso < 0.03) continue;
            const score = Math.hypot((hx - target.x) * aspect, hy - target.y) / torso;
            if (score < bestScore) { bestScore = score; best = lm; }
        }
        return best;
    }

    // Vertical band around the player (full height keeps head and feet).
    // Wide enough for a lane step either side; only re-centered when the
    // player drifts toward the edge, so the crop stays stable for tracking.
    _updateRoi(lm) {
        const xs = [];
        for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
            const p = lm[i];
            if (p && (p.visibility === undefined || p.visibility > 0.3)) xs.push(p.x);
        }
        if (!xs.length) return;
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const cx = (minX + maxX) / 2, bw = maxX - minX;
        const roi = this.track.roi;
        const inside = roi && minX > roi.x + roi.w * 0.12 && maxX < roi.x + roi.w * 0.88;
        if (inside) return;
        const anchor = (this.target && this.target()) || { x: cx };
        const w = Math.min(1, Math.max(0.55, bw * 2.4));
        const x = Math.min(1 - w, Math.max(0, anchor.x - w / 2));
        this.track.roi = { x, w };
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

        // Player lock band (cyan) — everyone outside it is ignored.
        if (this.track.locked && this.track.roi) {
            const { x, w } = this.track.roi;
            ctx.strokeStyle = "rgba(0, 229, 255, 0.55)";
            ctx.lineWidth = 3;
            ctx.setLineDash([14, 10]);
            ctx.strokeRect(x * canvas.width + 1, 1, w * canvas.width - 2, canvas.height - 2);
            ctx.setLineDash([]);
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
