// Pose sources: the front camera run through MediaPipe Pose Landmarker (all
// on-device), or a scripted stick figure for demo mode (?demo, ?demo=fast).

import { syntheticLandmarks, standing, lerpSpec } from './figure.js';

const VERSION = '0.10.14';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

let pending = null, pendingModel = null;

export function loadLandmarker(model = 'full') {
  if (pending && pendingModel === model) return pending;
  pendingModel = model;
  pending = (async () => {
    const { PoseLandmarker, FilesetResolver } = await import(`${BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const options = delegate => ({
      baseOptions: { modelAssetPath: MODELS[model], delegate },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { return await PoseLandmarker.createFromOptions(fileset, options('GPU')); }
    catch { return await PoseLandmarker.createFromOptions(fileset, options('CPU')); }
  })();
  pending.catch(() => { pending = null; });
  return pending;
}

export class CameraSource {
  static async open(video, model) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access (it needs HTTPS).');
    // Ask for 4:3, the camera sensor's own shape, at a high resolution. A 16:9 picture
    // (or, on some phones, a low-resolution one) is cropped from the sensor and sees less.
    const [stream, landmarker] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }),
      loadLandmarker(model),
    ]);
    // Zoom out as far as the camera allows (only some phones support this).
    const track = stream.getVideoTracks()[0];
    const zoom = track.getCapabilities?.().zoom;
    if (zoom && zoom.min < (track.getSettings().zoom ?? 1)) {
      await track.applyConstraints({ advanced: [{ zoom: zoom.min }] }).catch(() => {});
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    return new CameraSource(video, stream, landmarker);
  }

  constructor(video, stream, landmarker) {
    Object.assign(this, { video, stream, landmarker, lastVideoTime: -1, lastTs: 0, last: null });
    this.mirrored = true;
  }

  now() { return performance.now() / 1000; }

  next() {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return null;
    if (v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const ts = Math.max(performance.now(), this.lastTs + 1);
      this.lastTs = ts;
      const res = this.landmarker.detectForVideo(v, ts);
      this.last = { landmarks: res.landmarks?.[0] ?? null, width: v.videoWidth, height: v.videoHeight };
    }
    return this.last;
  }

  stop() { this.stream.getTracks().forEach(t => t.stop()); this.video.srcObject = null; }
}

// Plays a scripted session: stand, get into position, wobble out once, hold
// past the target, then stand up. `speed` > 1 runs the clock faster.
export class DemoSource {
  constructor(hold, level, target, speed = 1) {
    Object.assign(this, { hold, level, target, speed, t0: performance.now() / 1000 });
    this.stand = standing(hold.view);
    this.pose = hold.figure(level);
    this.mirrored = true;
    if (hold.flow) {
      // Flowing holds: start low, then rise and fall slowly for a couple of cycles past
      // the goal (lingering at the top), then stand and rest.
      this.low = hold.flow.lowFigure(level);
      this.period = hold.flow.minCycle[level - 1] + hold.flow.dwell[level - 1] + 2.5;
      this.cycles = hold.levels[level - 1].target + 2;
    }
    // Seconds of wall time for each phase (before speed-up): [start, end, from→to].
    const T = 4.5, B = Math.min(target * 0.4, 25);
    const half = hold.sides ? target / 2 : null;
    const end = T + target + 6 + (half ? 6 : 0) + 4;
    this.keys = [
      [0, 2.5, 0, 0], [2.5, 4.5, 0, 1],
      [T + B, T + B + 0.8, 1, 0.35], [T + B + 0.8, T + B + 3.5, 0.35, 0.35], [T + B + 3.5, T + B + 4.3, 0.35, 1],
      ...(half ? [[T + half + 4.4, T + half + 5.4, 1, 0], [T + half + 8, T + half + 9.5, 0, 1]] : []),
      [end, end + 1.5, 1, 0],
    ];
  }

  now() { return this.t0 + (performance.now() / 1000 - this.t0) * this.speed; }

  mix(t) {
    let m = 0;
    for (const [a, b, from, to] of this.keys) {
      if (t >= b) m = to;
      else if (t >= a) return from + (to - from) * (t - a) / (b - a);
    }
    return m;
  }

  flowSpec(t) {
    const start = 3, end = start + this.period * this.cycles;
    if (t < start) return this.low;
    if (t >= end) return lerpSpec(this.low, this.stand, Math.min(1, (t - end) / 1.5));
    const phase = ((t - start) % this.period) / this.period;
    return lerpSpec(this.low, this.pose, Math.min(1, 1.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase))));
  }

  next() {
    const t = this.now() - this.t0;
    const spec = this.low ? this.flowSpec(t) : lerpSpec(this.stand, this.pose, this.mix(t));
    // Lying-down holds are filmed with the phone in landscape.
    const [width, height] = this.pose.compact ? [1280, 720] : [720, 1280];
    return { landmarks: syntheticLandmarks(spec, { width, height, noise: 0.002 }), width, height };
  }

  stop() {}
}
