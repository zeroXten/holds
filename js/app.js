import { HOLDS, holdById, LEVEL_MULT } from './holds.js';
import { figureSVG } from './figure.js';
import * as P from './progress.js';
import { Session, STRICTNESS } from './session.js';
import { CameraSource, DemoSource, loadLandmarker } from './pose.js';
import { AutoFrame } from './framing.js';
import * as audio from './audio.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const SPEED = params.get('demo') === 'fast' ? 5 : 1;
const clock = () => performance.now() / 1000 * SPEED;

let state = P.load();
audio.configure(state.settings);
let hero = null;

const fmt = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtLong = s => s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
// One-sided holds split the target between the sides.
const targetText = (hold, t) => hold.sides ? `${fmtLong(t / 2)} each side` : `${fmtLong(t)} target`;
const viewHint = hold => hold.hint ?? (hold.view === 'front' ? 'Face the camera' : 'Stand side-on to the camera');

function show(id) {
  $$('.screen').forEach(s => { s.hidden = s.id !== id; });
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function pips(hs) {
  if (hs.mastered) return '<span class="pips mastered">Mastered</span>';
  return `<span class="pips" title="${hs.qualDays.length} of ${P.QUALIFY_DAYS} days to level up">${
    Array.from({ length: P.QUALIFY_DAYS }, (_, i) => `<i class="${i < hs.qualDays.length ? 'on' : ''}"></i>`).join('')}</span>`;
}

// ---------- Home ----------

function renderHome() {
  const r = P.rankFor(state.xp);
  $('#sash').style.setProperty('--sash', r.color);
  $('#rank-name').textContent = r.name;
  $('#xp-fill').style.width = `${Math.round(r.progress * 100)}%`;
  $('#xp-text').textContent = r.next ? `${state.xp.toLocaleString()} / ${r.next.xp.toLocaleString()} XP` : `${state.xp.toLocaleString()} XP`;
  $('#streak').textContent = P.streak(state);
  $('#today').textContent = (state.days[P.dayKey()]?.points ?? 0).toLocaleString();
  $('#intro').hidden = state.history.length > 0;
  hero ??= P.pickHold(state);
  renderHero();
  renderGrid();
}

function renderHero() {
  const hs = P.holdState(state, hero.id);
  const lv = hero.levels[hs.level - 1];
  $('#hero-fig').innerHTML = figureSVG(hero.figure(hs.level));
  $('#hero-name').textContent = hero.name;
  $('#hero-native').textContent = hero.native;
  $('#hero-level').innerHTML = `Level ${hs.level} · ${lv.name} ${pips(hs)}`;
  $('#hero-desc').textContent = lv.desc;
  const best = hs.best[hs.level];
  $('#hero-meta').innerHTML = `
    <span class="tag strong">${targetText(hero, lv.target)}</span>
    <span class="tag">${LEVEL_MULT[hs.level - 1]}× points</span>
    <span class="tag">${hero.camera ? viewHint(hero) : 'Honour system'}</span>
    ${best ? `<span class="tag">Best ${fmtLong(best)}</span>` : ''}`;
}

function renderGrid() {
  $('#grid').innerHTML = HOLDS.map(h => {
    const hs = P.holdState(state, h.id);
    const best = hs.best[hs.level];
    return `<button class="card" data-hold="${h.id}">
      ${figureSVG(h.figure(hs.level))}
      <span class="card-name">${h.name}</span>
      <span class="card-sub">Lv ${hs.level} · ${h.sides ? `${fmtLong(h.levels[hs.level - 1].target / 2)} ×2` : fmtLong(h.levels[hs.level - 1].target)}${best ? ` · best ${fmtLong(best)}` : ''}</span>
      ${pips(hs)}
    </button>`;
  }).join('');
}

// ---------- Hold sheet ----------

let sheetHold = null, sheetLevel = 1;

function openHold(hold) {
  sheetHold = hold;
  const hs = P.holdState(state, hold.id);
  sheetLevel = hs.level;
  $('#hs-name').textContent = hold.name;
  $('#hs-native').textContent = hold.native;
  $('#hs-about').textContent = hold.about;
  $('#hs-cam-row').hidden = !hold.camera;
  $('#hs-cam').checked = state.settings.camera;
  renderSheetLevel();
  $('#hold-sheet').showModal();
}

function renderSheetLevel() {
  const hold = sheetHold, hs = P.holdState(state, hold.id);
  const unlocked = hs.mastered ? 4 : hs.level;
  $('#hs-levels').innerHTML = hold.levels.map((l, i) => {
    const n = i + 1, locked = n > unlocked;
    return `<button type="button" role="tab" class="lv ${n === sheetLevel ? 'on' : ''}" data-level="${n}" ${locked ? 'disabled' : ''} aria-selected="${n === sheetLevel}">
      ${locked ? '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>' : n}</button>`;
  }).join('');
  const lv = hold.levels[sheetLevel - 1];
  $('#hs-fig').innerHTML = figureSVG(hold.figure(sheetLevel));
  $('#hs-lname').textContent = `Level ${sheetLevel} · ${lv.name}`;
  $('#hs-desc').textContent = lv.desc;
  const best = hs.best[sheetLevel];
  $('#hs-meta').innerHTML = `
    <span class="tag strong">${targetText(hold, lv.target)}</span>
    <span class="tag">${LEVEL_MULT[sheetLevel - 1]}× points</span>
    ${hold.camera ? `<span class="tag">${viewHint(hold)}</span>` : '<span class="tag">Honour system</span>'}
    ${best ? `<span class="tag">Best ${fmtLong(best)}</span>` : ''}
    ${sheetLevel === hs.level && !hs.mastered ? pips(hs) : ''}`;
}

// ---------- Session ----------

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const COLORS = { good: '#7bd88f', warn: '#ffb547', bad: '#ff5d5d', idle: 'rgba(255,255,255,0.85)' };

let run = null;  // the active session: { session, source, hold, level, raf, wake }

async function startSession(hold, level, useCamera) {
  audio.unlock();
  stopRun();
  show('session');
  const lv = hold.levels[level - 1];
  $('#s-name').textContent = hold.name;
  $('#s-level').textContent = `Level ${level} · ${lv.name}`;
  $('#s-ref').innerHTML = figureSVG(hold.figure(level));
  $('#s-error').hidden = true;
  $('#honour-fig').hidden = useCamera;
  $('#honour-fig').innerHTML = useCamera ? '' : figureSVG(hold.figure(level), { className: 'figure big' });
  $('#s-meter').hidden = !useCamera;
  $('#s-ref').hidden = !useCamera;
  $('#s-tick').style.left = `${STRICTNESS[state.settings.strictness].hold}%`;
  document.body.classList.toggle('demo', DEMO);
  run = { hold, level, camera: useCamera };
  const myRun = run;
  setStatus('wait', useCamera ? (DEMO ? 'Demo mode' : 'Starting camera…') : '');
  $('#s-cue').textContent = useCamera && !DEMO ? 'The pose model downloads the first time (about 10 MB).' : '';
  $('#s-btns').innerHTML = '';

  let source = null;
  if (useCamera) {
    try {
      source = DEMO ? new DemoSource(hold, level, lv.target, SPEED) : await CameraSource.open($('#video'), state.settings.model);
    } catch (e) {
      if (run !== myRun) return;
      setStatus('wait', '');
      $('#s-cue').textContent = '';
      $('#s-error-msg').textContent = e?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access for this site in your browser settings, or carry on without it.'
        : `${e?.message || e}`;
      $('#s-error').hidden = false;
      return;
    }
    if (run !== myRun) { source.stop(); return; }
  }
  run.source = source;
  run.framer = new AutoFrame({ enabled: state.settings.autoframe });
  run.lastFrameAt = performance.now();
  run.session = new Session({ hold, level, camera: useCamera, strictness: state.settings.strictness, now: source ? source.now() : clock() });
  run.wake = await wakeLock();
  if (!useCamera) {
    $('#s-btns').innerHTML = '<button class="btn" id="s-pause">Pause</button><button class="btn primary" id="s-done">Done</button>';
    $('#s-pause').onclick = () => { run.session.togglePause(); $('#s-pause').textContent = run.session.state === 'paused' ? 'Resume' : 'Pause'; };
    $('#s-done').onclick = () => { if (run.session.view().canSwitch && run.session.state !== 'switch') run.session.switchNow(); else endSession(); };
  }
  const loop = () => {
    if (run !== myRun) return;
    const now = source ? source.now() : clock();
    const frame = source?.next() ?? null;
    const v = run.session.tick(now, frame);
    if (source) {
      const t = performance.now(), dt = (t - run.lastFrameAt) / 1000;
      run.lastFrameAt = t;
      const stage = $('#overlay');
      const view = run.framer.update(dt, frame, stage.clientWidth, stage.clientHeight, source.mirrored, hudInset());
      if (view) {
        placeVideo(view, source.mirrored);
        drawSkeleton(frame, v, view, source.mirrored);
      }
    }
    updateHud(v);
    if (v.state === 'done') return finishSession();
    run.raf = requestAnimationFrame(loop);
  };
  run.raf = requestAnimationFrame(loop);
}

function setStatus(kind, text) {
  const el = $('#s-status');
  el.className = `status ${kind}`;
  el.textContent = text;
}

function updateHud(v) {
  const s = run.session;
  // One-sided holds show the current side's time against that side's target.
  $('#s-time').textContent = fmt(v.sideHeld);
  $('#s-target').textContent = ` / ${fmt(v.sideTarget)}`;
  $('#s-level').textContent = `Level ${run.level} · ${run.hold.levels[run.level - 1].name}${v.sides === 2 ? ` · Side ${v.sideIndex + 1} of 2` : ''}`;
  $('#s-points').textContent = Math.floor(v.points).toLocaleString();
  const bar = $('#s-tbar');
  bar.style.width = `${Math.min(100, (v.sideHeld / v.sideTarget) * 100)}%`;
  bar.classList.toggle('over', v.sideReached);
  const done = $('#s-done');
  if (done) done.textContent = v.canSwitch && v.state !== 'switch' ? 'Switch sides' : 'Done';
  $('#session').dataset.state = v.state;
  $('#s-fill').style.width = `${v.score}%`;
  $('#s-fill').className = `fill ${v.score >= s.thr.start ? 'good' : v.score >= s.thr.hold ? 'warn' : 'bad'}`;
  $('#s-score').textContent = run.camera ? `Form ${v.score}` : '';
  const cue = v.worst?.cue ?? '';
  switch (v.state) {
    case 'framing':
      setStatus('wait', 'Step back so your whole body is in view');
      $('#s-cue').textContent = `${viewHint(run.hold)}, about 2–3 m from the phone.`;
      break;
    case 'ready':
      setStatus('wait', 'Get into position');
      $('#s-cue').textContent = cue || 'Looking good… hold still';
      break;
    case 'holding':
      setStatus('good', v.sideReached ? 'Bonus time!' : 'Hold');
      if (v.sideReached && v.canSwitch) $('#s-cue').textContent = run.camera ? 'Step out of position when you’re ready to switch sides' : 'Tap Switch sides when you’re ready';
      else $('#s-cue').textContent = run.camera ? (v.score >= 90 ? 'Great form' : cue) : (v.sideReached ? 'Keep going for bonus points' : '');
      break;
    case 'broken': {
      const left = Math.ceil((v.sideReached ? 3.5 : 8) - s.outTime);
      setStatus('bad', v.seen ? `Back into position · ${left}` : `Can’t see you · ${left}`);
      $('#s-cue').textContent = cue;
      break;
    }
    case 'switch':
      setStatus('wait', 'Switch sides');
      $('#s-cue').textContent = run.camera ? 'Change legs, then settle back in' : `Resuming in ${Math.ceil(5 - v.stateTime)}`;
      break;
    case 'countdown':
      setStatus('wait', `Get into position · ${Math.ceil(5 - v.stateTime)}`);
      $('#s-cue').textContent = run.hold.levels[run.level - 1].desc;
      break;
    case 'paused':
      setStatus('wait', 'Paused');
      $('#s-cue').textContent = '';
      break;
  }
}

// Screen space taken by the timer at the top and the form meter at the bottom.
function hudInset() {
  const top = $('#s-tbar').getBoundingClientRect().bottom + 8;
  const bottom = window.innerHeight - $('.hud-bottom').getBoundingClientRect().top + 8;
  return { top, bottom };
}

// Position the video element so it shows the auto-framed part of the picture.
function placeVideo(view, mirrored) {
  const el = $('#video');
  const size = `${view.vw}x${view.vh}`;
  if (el.dataset.size !== size) {
    el.dataset.size = size;
    el.style.width = `${view.vw}px`;
    el.style.height = `${view.vh}px`;
  }
  el.style.transform = mirrored
    ? `matrix(${-view.s}, 0, 0, ${view.s}, ${view.tx + view.s * view.vw}, ${view.ty})`
    : `matrix(${view.s}, 0, 0, ${view.s}, ${view.tx}, ${view.ty})`;
}

function drawSkeleton(frame, v, view, mirrored) {
  const canvas = $('#overlay');
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const lm = frame?.landmarks;
  if (!lm) return;
  // Same mapping as the video (see placeVideo).
  const pt = p => [view.tx + view.s * (mirrored ? 1 - p.x : p.x) * view.vw, view.ty + view.s * p.y * view.vh];

  // Each joint/bone takes the worst score of the criteria that involve it.
  const jointS = new Map(), boneS = new Map();
  for (const r of v.results ?? []) {
    const js = r.joints ?? [];
    for (const j of js) jointS.set(j, Math.min(jointS.get(j) ?? 1, r.s));
    for (const [a, b] of BONES) if (js.includes(a) && js.includes(b)) boneS.set(`${a}-${b}`, Math.min(boneS.get(`${a}-${b}`) ?? 1, r.s));
  }
  const active = v.state !== 'framing';
  const holding = v.state === 'holding';
  const color = s => !active ? COLORS.idle : s === undefined ? (holding ? COLORS.good : COLORS.idle)
    : s >= 0.85 ? COLORS.good : s >= 0.5 ? COLORS.warn : COLORS.bad;
  const width = Math.max(4, cw / 90);
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    if (!lm[a] || !lm[b] || (lm[a].visibility ?? 1) < 0.3 || (lm[b].visibility ?? 1) < 0.3) continue;
    const s = boneS.get(`${a}-${b}`);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = width + 4;
    ctx.beginPath(); ctx.moveTo(...pt(lm[a])); ctx.lineTo(...pt(lm[b])); ctx.stroke();
    ctx.strokeStyle = color(s);
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(...pt(lm[a])); ctx.lineTo(...pt(lm[b])); ctx.stroke();
  }
  for (const j of JOINTS) {
    if (!lm[j] || (lm[j].visibility ?? 1) < 0.3) continue;
    const [x, y] = pt(lm[j]);
    ctx.fillStyle = color(jointS.get(j));
    ctx.beginPath(); ctx.arc(x, y, j === 0 ? width * 2.2 : width * 0.95, 0, Math.PI * 2); ctx.fill();
  }
}

async function wakeLock() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

document.addEventListener('visibilitychange', async () => {
  if (run?.session && document.visibilityState === 'visible') run.wake = await wakeLock();
});

function stopRun() {
  if (!run) return;
  cancelAnimationFrame(run.raf);
  run.source?.stop();
  run.wake?.release?.().catch(() => {});
  audio.hush();
  const c = $('#overlay');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
  run = null;
}

function endSession() {
  if (!run?.session) { stopRun(); show('home'); renderHome(); return; }
  run.session.finish('stopped');
  finishSession();
}

let lastRun = null;

function finishSession() {
  const { session, hold, level, camera } = run;
  const result = session.result;
  stopRun();
  lastRun = { hold, level, camera };
  if (result.held < 3) {
    toast('Session too short to count');
    show('home');
    renderHome();
    return;
  }
  const outcome = P.recordSession(state, result);
  renderSummary(hold, level, result, outcome);
}

// ---------- Summary ----------

function renderSummary(hold, level, r, o) {
  show('summary');
  const pct = r.held / r.target;
  $('#sum-kicker').textContent = `${hold.name} · Level ${level}`;
  $('#sum-title').textContent =
    o.levelUp ? `Level ${o.newLevel} unlocked!` :
    o.mastered ? `${hold.name} mastered!` :
    pct >= 1.5 ? 'Beyond the target!' :
    o.reached ? 'Target reached!' :
    o.pb ? 'New personal best!' :
    pct >= 0.75 ? 'So close!' : 'Good effort';
  countUp($('#sum-points'), o.points);
  $('#sum-breakdown').textContent = o.streakMult > 1
    ? `${o.basePoints.toLocaleString()} × ${o.streakMult.toFixed(2)} streak bonus (${o.streak} day${o.streak === 1 ? '' : 's'})`
    : '';
  $('#sum-stats').innerHTML = `
    <div><b>${fmtLong(r.held)}</b><small>held of ${fmtLong(r.target)}${r.sides ? `<br>${r.sides.map(t => fmtLong(t)).join(' + ')}` : ''}</small></div>
    ${r.camera ? `<div><b>${Math.round(r.avgForm)}</b><small>average form</small></div>` : '<div><b>—</b><small>honour mode</small></div>'}
    <div><b>${o.pb ? 'New!' : o.prevBest ? fmtLong(o.prevBest) : '—'}</b><small>${o.pb ? 'personal best' : 'best'}</small></div>`;

  const hs = P.holdState(state, hold.id);
  let lvl = '';
  if (o.levelUp) lvl = `<div class="banner">Next up: <b>${hold.levels[o.newLevel - 1].name}</b>. ${fmtLong(hold.levels[o.newLevel - 1].target)} target, ${LEVEL_MULT[o.newLevel - 1]}× points.</div>`;
  else if (o.mastered) lvl = '<div class="banner">You’ve completed every level of this stance.</div>';
  else if (level === hs.level && !hs.mastered) {
    const need = P.QUALIFY_DAYS - hs.qualDays.length;
    lvl = `<div class="lvl-progress">${pips(hs)}<span>${o.qualified
      ? `Day counted! ${need} more day${need === 1 ? '' : 's'} to unlock level ${level + 1 > 4 ? 'mastery' : level + 1}.`
      : !o.reached ? `Reach ${fmtLong(r.target)} to count today towards level ${Math.min(level + 1, 4)}.`
      : r.camera && r.avgForm < P.QUALIFY_FORM ? `Average form ${P.QUALIFY_FORM}+ is needed for the day to count.`
      : 'Today already counted. Come back tomorrow.'}</span></div>`;
  }
  $('#sum-level').innerHTML = lvl;

  const items = [
    ...(o.rankUp ? [`<div class="badge earned rank"><span class="sash" style="--sash:${o.rank.color}"></span><b>${o.rank.name}</b><small>New rank</small></div>`] : []),
    ...o.badges.map(b => `<div class="badge earned">${medal()}<b>${b.name}</b><small>${b.desc}</small></div>`),
  ];
  $('#sum-badges').innerHTML = items.join('');
  $('#sum-msg').textContent = encouragement(r, o);
  if (o.levelUp || o.mastered || o.rankUp || o.badges.length) setTimeout(() => audio.play('level'), 500);
  if (o.levelUp) audio.say(`Level ${o.newLevel} unlocked`, { priority: true });
}

function encouragement(r, o) {
  if (o.levelUp || o.mastered) return 'Your stance is getting stronger. Keep showing up.';
  if (o.reached && r.camera && r.avgForm >= 90) return 'Excellent form all the way through.';
  if (o.reached) return o.streak > 1 ? `${o.streak} days in a row. Keep the streak alive tomorrow.` : 'Come back tomorrow to build a streak.';
  const left = r.sides ? r.sides.reduce((t, x) => t + Math.max(0, r.target / 2 - x), 0) : r.target - r.held;
  if (o.pb) return `Further than ever. ${fmtLong(left)} to go to reach the target.`;
  return `${fmtLong(left)} short of the target. Rest for a minute and try again, or try an easier level.`;
}

function countUp(el, to) {
  const t0 = performance.now(), dur = 900;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

const medal = () => '<svg viewBox="0 0 24 24" class="medal"><circle cx="12" cy="14" r="7"/><path d="M8 2h3l1 5-3 1zM16 2h-3l-1 5 3 1z"/></svg>';

// ---------- Progress ----------

function renderProgress() {
  show('progress');
  const r = P.rankFor(state.xp), t = P.totals(state);
  $('#rank-card').innerHTML = `
    <span class="sash big" style="--sash:${r.color}"></span>
    <div><h2>${r.name}</h2><span class="xpbar"><i style="width:${Math.round(r.progress * 100)}%"></i></span>
    <small>${state.xp.toLocaleString()} XP${r.next ? ` · ${(r.next.xp - state.xp).toLocaleString()} to ${r.next.name}` : ''}</small></div>`;
  $('#stats').innerHTML = `
    <div><b>${fmtLong(t.time)}</b><small>total held</small></div>
    <div><b>${t.sessions}</b><small>sessions</small></div>
    <div><b>${P.streak(state)}</b><small>day streak</small></div>
    <div><b>${t.bestStreak}</b><small>best streak</small></div>`;

  // 16 weeks, Monday-first columns, ending this week.
  const weeks = 16, today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const max = Math.max(1, ...Object.values(state.days).map(d => d.points));
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = P.dayKey(d), day = state.days[key];
    const lvl = d > today ? 'future' : day ? `l${Math.min(4, 1 + Math.floor((day.points / max) * 3.999))}` : '';
    cells += `<i class="${lvl}" title="${key}${day ? `: ${day.points} pts, ${fmtLong(day.time)}` : ''}"></i>`;
  }
  $('#heatmap').innerHTML = cells;

  $('#badges').innerHTML = P.BADGES.map(b => `<div class="badge ${state.badges[b.id] ? 'earned' : 'locked'}">${medal()}<b>${b.name}</b><small>${b.desc}</small></div>`).join('');
  const recent = state.history.slice(-12).reverse();
  $('#history').innerHTML = recent.length ? recent.map(h => {
    const hold = holdById(h.holdId);
    const d = new Date(h.at);
    return `<li><span><b>${hold?.name ?? h.holdId}</b> <small>Lv ${h.level}</small></span>
      <span>${fmtLong(h.held)}${h.held >= h.target ? ' ✓' : ''}</span>
      <span>${h.avgForm ?? '—'}</span><span>+${h.points}</span>
      <small class="when">${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></li>`;
  }).join('') : '<li class="empty">No sessions yet.</li>';
}

// ---------- Settings ----------

function openSettings() {
  const f = $('#settings form');
  for (const k of ['voice', 'sounds', 'camera', 'autoframe']) f.elements[k].checked = state.settings[k];
  f.elements.strictness.value = state.settings.strictness;
  f.elements.model.value = state.settings.model;
  $('#settings').showModal();
}

$('#settings form').addEventListener('change', e => {
  const el = e.target;
  if (!el.name) return;
  state.settings[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  audio.configure(state.settings);
  P.save(state);
});

$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shaolin-holds-${P.dayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || typeof data.xp !== 'number') throw new Error('Not a Shaolin Holds backup');
    if (!confirm('Replace your current progress with this backup?')) return;
    localStorage.setItem('holds.v1', JSON.stringify(data));
    state = P.load();
    audio.configure(state.settings);
    $('#settings').close();
    renderHome();
    toast('Backup restored');
  } catch (err) { toast(err.message); }
  e.target.value = '';
};
$('#reset').onclick = () => {
  if (!confirm('Delete all progress, points and badges? This can’t be undone.')) return;
  const settings = state.settings;
  try { localStorage.removeItem('holds.v1'); } catch {}
  state = P.load();
  state.settings = settings;
  P.save(state);
  $('#settings').close();
  renderHome();
  toast('Progress reset');
};

// ---------- Wiring ----------

$('#shuffle').onclick = () => { hero = P.pickHold(state, hero.id); renderHero(); };
$('#hero-start').onclick = () => {
  const hs = P.holdState(state, hero.id);
  startSession(hero, hs.level, hero.camera && state.settings.camera);
};
$('#hero-fig').onclick = () => openHold(hero);
$('#grid').onclick = e => { const c = e.target.closest('[data-hold]'); if (c) openHold(holdById(c.dataset.hold)); };
$('#hs-levels').onclick = e => { const b = e.target.closest('[data-level]'); if (b && !b.disabled) { sheetLevel = +b.dataset.level; renderSheetLevel(); } };
$('#hold-sheet').addEventListener('close', () => {
  if ($('#hold-sheet').returnValue === 'start') startSession(sheetHold, sheetLevel, sheetHold.camera && $('#hs-cam').checked);
  $('#hold-sheet').returnValue = '';
});
$('#settings-btn').onclick = openSettings;
$('#rank-btn').onclick = renderProgress;
$('#progress-btn').onclick = renderProgress;
$('#end-btn').onclick = () => endSession();
$('#s-retry').onclick = () => { const { hold, level } = run ?? lastRun; startSession(hold, level, true); };
$('#s-honour').onclick = () => { const { hold, level } = run ?? lastRun; startSession(hold, level, false); };
$('#sum-again').onclick = () => { const { hold, level, camera } = lastRun; startSession(hold, level, camera); };
document.addEventListener('click', e => {
  if (e.target.closest('[data-home]')) { stopRun(); show('home'); renderHome(); }
});

show('home');
renderHome();

// Start fetching the pose model in the background so the first session starts quickly.
if (!DEMO && state.settings.camera) {
  const idle = window.requestIdleCallback ?? (fn => setTimeout(fn, 1500));
  idle(() => loadLandmarker(state.settings.model).catch(() => {}));
}

if ('serviceWorker' in navigator && !DEMO && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
