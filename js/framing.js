// Auto-framing: works out how to scale and pan the camera picture so the body
// fills the screen, using the landmarks we already detect. The pose model always
// sees the whole camera frame; this only changes what's shown on screen.
//
// A view maps video pixels to screen pixels: screenX = tx + s * x', screenY = ty + s * y,
// where x' is the video x, flipped when the picture is mirrored.

const EASE = 0.5;        // seconds for the view to settle on a new framing (zooming out or panning)
const EASE_IN = 2.5;     // ...and to zoom in, gently, once you're in position
const LOST_AFTER = 5;    // seconds without a body before easing back out to the whole picture
const MAX_ZOOM = 3.5;    // never magnify beyond this many times the whole-picture view
const MIN_ZOOM = 0.5;    // ...or shrink below half of it (when you're close to the phone)
// Holding still, the pose model's confidence in some joints (often the far side, side-on)
// flickers. A joint that drops out is remembered where it was last seen for this long, so
// the body doesn't seem to shrink and the view doesn't lunge in on what's left.
const REMEMBER = 4;
// Zooming out happens at once (never cut the body off); zooming in only once you're in
// the hold's position, and have been for this long.
const ZOOM_IN_AFTER = 1;
const ZOOM_IN_RATIO = 1.2; // ...and only if it would magnify at least this much more

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
  // A face close to the lens (setting the phone down) isn't a body to frame.
  const has = i => (landmarks[i]?.visibility ?? 1) >= 0.4;
  if (n < 8 || !(has(11) || has(12)) || !(has(23) || has(24))) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Keep the picture covering the screen where it's big enough; centre it where it isn't.
const clampAxis = (t, size, screen) => (size >= screen ? Math.min(0, Math.max(screen - size, t)) : (screen - size) / 2);

// `inset` keeps the body clear of the controls drawn over the screen: top and bottom
// in portrait, a panel down the left side in landscape.
// Seeing the whole body always wins: the picture shrinks (with black bars) rather than
// let the timer or form meter cover the head or feet.
// `cap`: the most it may magnify (to re-centre without zooming in).
export function targetView(box, vw, vh, cw, ch, inset = {}, cap = Infinity) {
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
  const s = Math.min(cap, Math.max(fit * MIN_ZOOM, Math.min(rw / (x1 - x0), rh / (y1 - y0), fit * MAX_ZOOM)));
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

// Where the body sits on screen under `view`, and whether all of it is clear of the controls.
function fitsIn(view, box, cw, ch, inset = {}) {
  const top = Math.min(inset.top ?? 0, ch * 0.3), bottom = Math.min(inset.bottom ?? 0, ch * 0.3);
  const left = Math.min(inset.left ?? 0, cw * 0.45);
  const m = 0.04 * Math.max(box.w, box.h);  // landmarks stop short of the head, hands and feet
  return view.tx + view.s * (box.x - m) >= left - 2 && view.tx + view.s * (box.x + box.w + m) <= cw + 2
    && view.ty + view.s * (box.y - m) >= top - 2 && view.ty + view.s * (box.y + box.h + m) <= ch - bottom + 2;
}

export class AutoFrame {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.view = null;   // what's on screen now, easing towards `goal`
    this.goal = null;   // the framing we've settled on
    this.lost = Infinity;
    this.inFor = 0;     // seconds the body has looked small enough to zoom in on
    this.seen = [];     // per landmark: last clear position (video pixels) and seconds since
    this.size = '';
  }

  // The body's box from every joint seen clearly in the last few seconds.
  steadyBox(landmarks, dt, vw, vh, mirrored) {
    if (!this.enabled) return null;
    const live = bodyBox(landmarks, vw, vh, mirrored);
    if (!live) return null;
    landmarks.forEach((p, i) => {
      const s = this.seen[i];
      if (p && (p.visibility ?? 1) >= 0.4) this.seen[i] = { x: (mirrored ? 1 - p.x : p.x) * vw, y: p.y * vh, age: 0 };
      else if (s) s.age += dt;
    });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of this.seen) {
      if (!s || s.age > REMEMBER) continue;
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // `inPosition`: the session has you in the hold's position. Until then the view only
  // ever zooms out or pans, so it never closes in on someone still getting set up.
  update(dt, frame, cw, ch, mirrored, inset, inPosition = true) {
    if (!frame?.width) return this.view;
    const { width: vw, height: vh } = frame;
    const box = this.steadyBox(frame.landmarks, dt, vw, vh, mirrored);
    this.lost = box ? 0 : this.lost + dt;
    if (box) this.box = box;
    if (this.lost >= LOST_AFTER) this.seen = [];  // gone: the next person starts afresh
    const size = `${cw}x${ch}:${vw}x${vh}`;
    const resized = size !== this.size;
    const body = this.enabled && this.lost < LOST_AFTER ? this.box : null;
    const want = targetView(body, vw, vh, cw, ch, inset);
    if (!this.goal || resized || !body) {
      // Start on the whole picture (and go back to it when the screen turns, or nobody's
      // there); zooming in waits until a body has been seen steadily.
      this.goal = targetView(null, vw, vh, cw, ch, inset);
      this.inFor = 0;
    } else if (box) {
      // Only re-frame when the body needs it: straight away if any of it would be cut
      // off (zooming in only if you're in position), and closer in once you've been in
      // position for a moment and look much smaller on screen than you could.
      if (!fitsIn(this.goal, box, cw, ch, inset)) {
        this.goal = inPosition ? want : targetView(body, vw, vh, cw, ch, inset, this.goal.s);
        this.inFor = 0;
      } else if (inPosition && want.s > this.goal.s * ZOOM_IN_RATIO) {
        this.inFor += dt;
        if (this.inFor > ZOOM_IN_AFTER) { this.goal = want; this.inFor = 0; }
      } else this.inFor = 0;
    }
    // Snap on the first frame, or when the screen or camera picture changes size (e.g. rotation).
    if (!this.view || resized) {
      this.size = size;
      this.view = { ...this.goal };
    } else {
      const k = 1 - Math.exp(-dt / (this.goal.s > this.view.s * 1.01 ? EASE_IN : EASE));
      for (const key of ['s', 'tx', 'ty']) this.view[key] += (this.goal[key] - this.view[key]) * k;
    }
    this.view.vw = vw;
    this.view.vh = vh;
    return this.view;
  }
}
