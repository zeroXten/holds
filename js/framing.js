// Auto-framing: works out how to scale and pan the camera picture so the body
// fills the screen, using the landmarks we already detect. The pose model always
// sees the whole camera frame; this only changes what's shown on screen.
//
// A view maps video pixels to screen pixels: screenX = tx + s * x', screenY = ty + s * y,
// where x' is the video x, flipped when the picture is mirrored.

const EASE = 0.5;       // seconds for the view to settle on a new framing
const LOST_AFTER = 1.5; // seconds without a body before zooming out to the whole picture
const MAX_ZOOM = 3.5;   // never magnify beyond this many times the whole-picture view
const MIN_ZOOM = 0.5;   // ...or shrink below half of it (when you're close to the phone)

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

// `inset` keeps the body clear of the controls drawn over the screen: top and bottom
// in portrait, a panel down the left side in landscape.
// Seeing the whole body always wins: the picture shrinks (with black bars) rather than
// let the timer or form meter cover the head or feet.
export function targetView(box, vw, vh, cw, ch, inset = {}) {
  const fit = Math.min(cw / vw, ch / vh);
  if (!box) return { s: fit, tx: (cw - fit * vw) / 2, ty: (ch - fit * vh) / 2 };
  const top = Math.min(inset.top ?? 0, ch * 0.3), bottom = Math.min(inset.bottom ?? 0, ch * 0.3);
  const left = Math.min(inset.left ?? 0, cw * 0.45);
  const rh = Math.max(ch * 0.4, ch - top - bottom), rw = cw - left;
  // Landmarks stop at the nose, wrists and ankles: pad for the head, hands and feet.
  // Long boxes (lying down) get a little extra height too.
  let x0 = box.x - 0.175 * box.h - 0.05 * box.w, x1 = box.x + box.w + 0.175 * box.h + 0.05 * box.w;
  let y0 = box.y - 0.22 * box.h - 0.075 * box.w, y1 = box.y + box.h + 0.08 * box.h + 0.075 * box.w;
  // There's no picture beyond the camera frame, so padding (or a body part the model
  // guesses is off the edge) past it would only shrink the picture into black bars.
  x0 = Math.max(0, x0); x1 = Math.min(vw, x1); y0 = Math.max(0, y0); y1 = Math.min(vh, y1);
  const s = Math.max(fit * MIN_ZOOM, Math.min(rw / (x1 - x0), rh / (y1 - y0), fit * MAX_ZOOM));
  // Centre the padded body in the clear area, avoid empty edges where the picture allows...
  let tx = clampAxis(left + rw / 2 - s * (x0 + x1) / 2, s * vw, cw);
  let ty = clampAxis(top + rh / 2 - s * (y0 + y1) / 2, s * vh, ch);
  // ...but never at the cost of hiding part of the body (the feet matter most).
  if (ty + s * y0 < top) ty = top - s * y0;
  if (ty + s * y1 > top + rh) ty = top + rh - s * y1;
  if (tx + s * x0 < left) tx = left - s * x0;
  if (tx + s * x1 > cw) tx = cw - s * x1;
  return { s, tx, ty };
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
