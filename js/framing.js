// Auto-framing: works out how to scale and pan the camera picture so the body
// fills the screen, using the landmarks we already detect. The pose model always
// sees the whole camera frame; this only changes what's shown on screen.
//
// A view maps video pixels to screen pixels: screenX = tx + s * x', screenY = ty + s * y,
// where x' is the video x, flipped when the picture is mirrored.

const EASE = 0.5;       // seconds for the view to settle on a new framing
const LOST_AFTER = 1.5; // seconds without a body before zooming out to the whole picture
const MAX_ZOOM = 3.5;   // never magnify beyond this many times the whole-picture view

export function bodyBox(landmarks, vw, vh, mirrored) {
  if (!landmarks) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  for (const p of landmarks) {
    if (!p || (p.visibility ?? 1) < 0.4) continue;
    const x = (mirrored ? 1 - p.x : p.x) * vw, y = p.y * vh;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    n++;
  }
  if (n < 8) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Keep the picture covering the screen where it's big enough; centre it where it isn't.
const clampAxis = (t, size, screen) => (size >= screen ? Math.min(0, Math.max(screen - size, t)) : (screen - size) / 2);

// `inset` keeps the body clear of the controls drawn over the top and bottom of the screen.
export function targetView(box, vw, vh, cw, ch, inset = { top: 0, bottom: 0 }) {
  const fit = Math.min(cw / vw, ch / vh);
  let s = fit, cx = vw / 2, cy = vh / 2, screenCy = ch / 2;
  if (box) {
    const rh = Math.max(ch * 0.4, ch - inset.top - inset.bottom);
    screenCy = Math.min(inset.top, ch * 0.3) + rh / 2;
    // Landmarks stop at the nose, wrists and ankles, so leave room for the head,
    // hands and feet, plus breathing space. Long boxes (lying down) get a little height too.
    const w = box.w + 0.35 * box.h + 0.1 * box.w;
    const h = box.h * 1.35 + 0.15 * box.w;
    s = Math.min(cw / w, rh / h);
    s = Math.max(fit, Math.min(s, fit * MAX_ZOOM));
    cx = box.x + box.w / 2;
    cy = box.y + box.h / 2 - box.h * 0.05;  // nudge up for the top of the head
  }
  return {
    s,
    tx: clampAxis(cw / 2 - s * cx, s * vw, cw),
    ty: clampAxis(screenCy - s * cy, s * vh, ch),
  };
}

export class AutoFrame {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.view = null;
    this.lost = Infinity;
    this.size = '';
  }

  update(dt, frame, cw, ch, mirrored, inset) {
    if (!frame?.width) return this.view;
    const { width: vw, height: vh } = frame;
    const box = this.enabled ? bodyBox(frame.landmarks, vw, vh, mirrored) : null;
    this.lost = box ? 0 : this.lost + dt;
    if (box) this.box = box;
    const target = targetView(this.enabled && this.lost < LOST_AFTER ? this.box : null, vw, vh, cw, ch, inset);
    // Snap on the first frame, or when the screen or camera picture changes size (e.g. rotation).
    const size = `${cw}x${ch}:${vw}x${vh}`;
    if (!this.view || size !== this.size) {
      this.size = size;
      this.view = target;
    } else {
      const k = 1 - Math.exp(-dt / EASE);
      for (const key of ['s', 'tx', 'ty']) this.view[key] += (target[key] - this.view[key]) * k;
    }
    this.view.vw = vw;
    this.view.vh = vh;
    return this.view;
  }
}
