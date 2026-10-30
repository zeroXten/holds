import { HOLDS, HOLD_GROUPS, holdById, prefersLandscape, AREAS, STYLES, AREA_WORDS, mainArea } from './holds.js';
import {
  coinsAtTarget, DAILY_MULT, BONUS_TIERS, TEMPLE_TIERS, TEMPLE_ITEMS, THEMES, BETS,
  AVATAR_CHARACTERS, AVATAR_OUTFITS, AVATAR_ACCESSORIES, FRAMES, FREEZE_PRICE, FREEZE_MAX,
  REST_DAY_PRICE, REPAIR_PRICE_PER_DAY, STREAK_MILESTONES, TEST_FORM, testPrice, MILESTONE_DAY_MULT,
} from './economy.js';
import { drawTemple, SCENE_H } from './temple.js';
import { renderAvatar } from './avatar.js';
import { figureSVG } from './figure.js';
import * as P from './progress.js';
import { STRICTNESS } from './session.js';
import { createSession } from './flow.js';
import { CameraSource, DemoSource, loadLandmarker } from './pose.js';
import { AutoFrame } from './framing.js';
import * as audio from './audio.js';
import { VERSION } from './version.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const SPEED = params.get('demo') === 'fast' ? 5 : 1;
const clock = () => performance.now() / 1000 * SPEED;

let state = P.load();
audio.configure(state.settings);
let hero = null;       // the hold in the big card: the hold of the day, or a shuffled pick

const COIN = '<svg viewBox="0 0 24 24" class="ico coin"><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.5 9.5h5v5h-5z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>';
// "Soft · Arms & shoulders · Balance": style, then areas from most to least worked.
const areaTags = hold => [STYLES[hold.style], ...Object.entries(hold.areas).sort((a, b) => b[1] - a[1]).map(([a]) => AREAS[a])];
// The streak bonus and milestone-day double, as short notes: " · +25% streak · 2× day".
const boostParts = b => [
  ...(b.streakMult > 1 ? [`+${Math.round((b.streakMult - 1) * 100)}% streak`] : []),
  ...(b.double ? [`${MILESTONE_DAY_MULT}× milestone day`] : []),
];
const boostText = b => boostParts(b).map(t => ` · ${t}`).join('');
// A milestone's reward in words: "+25 coins and a free freeze".
const milestoneReward = m => {
  const parts = [
    ...(m.coins ? [`+${m.coins} coins`] : []),
    ...(m.freeze ? ['a free freeze'] : []),
    ...(m.double ? [`${MILESTONE_DAY_MULT}× coins all day`] : []),
  ];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
};
const boostTags = () => boostParts(P.coinBoost(state)).map(t => `<span class="tag strong">${t}</span>`).join('');

const coinRate = (hold, level) => `${Math.round(coinsAtTarget(hold, level))} coins at target`;

const fmt = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtLong = s => s < 60 ? `${Math.round(s)}s`
  : s < 3600 ? `${Math.floor(s / 60)}m${Math.round(s % 60) ? ` ${String(Math.round(s % 60)).padStart(2, '0')}s` : ''}`
  : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
// One-sided holds split the target between the sides.
const targetText = (hold, t) => hold.flow ? `${t} slow cycles` : hold.sides ? `${fmtLong(t / 2)} each side` : `${fmtLong(t)} target`;
// A best or a target in the hold's own unit: seconds, or cycles for flowing holds.
const amount = (hold, n) => (hold.flow ? `${n} cycle${n === 1 ? '' : 's'}` : fmtLong(n));
const videoUrl = hold => `https://www.youtube.com/results?search_query=${encodeURIComponent(hold.video)}`;
const viewHint = (hold, level = 1) => `${prefersLandscape(hold, level) ? 'Phone on its side (landscape). ' : ''}${hold.hint ?? (hold.view === 'front' ? 'Face the camera' : 'Stand side-on to the camera')}`;

document.body.classList.toggle('demo', DEMO);

function show(id) {
  if (document.body.dataset.screen === 'temple-view' && id !== 'temple-view') audio.stopAmbient();
  $$('.screen').forEach(s => { s.hidden = s.id !== id; });
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
  if (id === 'home' || id === 'shop' || id === 'temple-view') requestAnimationFrame(() => drawScenes(true));
}

// Toasts queue up, so several notices in a row are each seen.
const toastQueue = [];
function toast(msg) {
  toastQueue.push(msg);
  if (toastQueue.length === 1) showNextToast();
}
function showNextToast() {
  const t = $('#toast');
  if (!toastQueue.length) { t.hidden = true; return; }
  t.textContent = toastQueue[0];
  t.hidden = false;
  setTimeout(() => { toastQueue.shift(); showNextToast(); }, 2800);
}

// Messages saved by the progress logic (a freeze was used, a bet was settled...).
function flushNotices() {
  if (!state.notices.length) return;
  state.notices.splice(0).forEach(toast);
  P.save(state);
}

// Days that counted towards the next level (target reached on camera with good form), as
// a small bar; with `label`, also in words.
function pips(hs, { label = false } = {}) {
  if (hs.mastered) return '<span class="pips mastered">Mastered</span>';
  const next = hs.level < 4 ? `level ${hs.level + 1}` : 'mastery', need = P.qualifyDays(hs.level);
  // Whether today has already counted: if not, there's a day to earn today.
  const today = hs.qualDays.includes(P.dayKey());
  const words = `${hs.qualDays.length} of ${need} days to ${next}`;
  return `<span class="pips ${today ? 'today' : ''}" title="${words}${today ? ' · today counted' : ''}"><b class="lvl-bar"><i style="width:${Math.round(100 * hs.qualDays.length / need)}%"></i></b>${
    today ? '<em>✓ today</em>' : ''}${label ? `<small>${words}${today ? ' · today’s done' : ' · today still to earn'}</small>` : ''}</span>`;
}

// What the sash needs to open something: "Needs Green Sash", or '' if you have it.
const sashNeed = key => (P.hasSash(state, key) ? '' : `Needs ${P.sashByKey(key).name}`);

// ---------- Home ----------

function renderHome() {
  const r = P.sashRank(state);
  renderAvatar($('#avatar-mini'), P.avatarLook(state));
  $('#rank-name').textContent = r.name;
  $('#xp-fill').style.width = `${Math.round(r.progress * 100)}%`;
  $('#xp-text').textContent = r.next ? `${r.points} / ${r.next.points} mastery points` : `${r.points} mastery points`;
  $('#wallet').textContent = state.coins.toLocaleString();
  document.documentElement.dataset.scene = state.temple.theme;
  renderStreakStrip();
  renderHomeCards();
  drawScenes(true);
  const daily = P.dailyHold(state);
  if (!hero || !P.isOpen(state, hero.id)) hero = daily;
  renderHero();
  renderGrid();
}

function renderHero() {
  const hs = P.holdState(state, hero.id);
  const daily = P.isDaily(state, hero.id);
  $('#hero').classList.toggle('daily', daily);
  $('#hero-kicker').innerHTML = daily
    ? `Hold of the day <span class="mult">${P.dailyAvailable(state, hero.id) ? `${DAILY_MULT}× coins` : `${DAILY_MULT}× used today`}</span>` : 'Random pick';
  $('#back-daily').hidden = daily;
  const lv = hero.levels[hs.level - 1];
  $('#hero-fig').innerHTML = figureSVG(hero.figure(hs.level));
  $('#hero-name').textContent = hero.name;
  $('#hero-native').textContent = hero.native;
  $('#hero-level').innerHTML = `Level ${hs.level} · ${lv.name} ${pips(hs, { label: true })}`;
  $('#hero-desc').textContent = lv.desc;
  $('#hero-video').href = videoUrl(hero);
  const best = hs.best[hs.level];
  $('#hero-meta').innerHTML = `
    <span class="tag strong">${targetText(hero, lv.target)}</span>
    <span class="tag">${coinRate(hero, hs.level)}</span>
    <span class="tag">${hero.camera ? viewHint(hero, hs.level) : 'Honour system'}</span>
    ${best ? `<span class="tag">Best ${amount(hero, best)}</span>` : ''}`;
}

function renderGrid() {
  const price = P.unlockPrice(state);
  const over = P.overworked(state);
  const card = h => {
    const tired = over && P.leansOn(h, over.area);
    const kind = `<span class="card-kind ${h.style}">${STYLES[h.style]} · ${AREAS[mainArea(h)]}</span>`;
    const hs = P.holdState(state, h.id);
    const best = hs.best[hs.level];
    if (!P.isOpen(state, h.id)) {
      const need = sashNeed(h.sash);
      return `<button class="card locked ${!need && state.coins >= price ? 'affordable' : ''}" data-hold="${h.id}">
        ${figureSVG(h.figure(1))}
        <span class="card-name">${h.name}</span>
        ${kind}
        <span class="card-sub price">${LOCK} ${need || `${COIN} ${price}`}</span>
      </button>`;
    }
    return `<button class="card ${P.isDaily(state, h.id) ? 'daily' : ''} ${tired ? 'tired' : ''}" data-hold="${h.id}">
      ${P.isDaily(state, h.id) ? `<span class="card-flag">${P.dailyAvailable(state, h.id) ? `${DAILY_MULT}× today` : `${DAILY_MULT}× done`}</span>` : tired ? `<span class="card-flag rest">${over.name} resting</span>` : ''}
      ${figureSVG(h.figure(hs.level))}
      <span class="card-name">${h.name}</span>
      ${kind}
      <span class="card-sub">Lv ${hs.level} · ${h.flow ? `${h.levels[hs.level - 1].target} cycles` : h.sides ? `${fmtLong(h.levels[hs.level - 1].target / 2)} ×2` : fmtLong(h.levels[hs.level - 1].target)}${best ? ` · best ${amount(h, best)}` : ''}</span>
      ${pips(hs)}
    </button>`;
  };
  // Within each section, in the order they open: no sash needed first, then by the sash
  // (a stable sort, so holds needing the same sash keep the section's order).
  const sashOrder = h => (h.sash ? P.RANKS.indexOf(P.sashByKey(h.sash)) : 0);
  $('#grid').innerHTML = HOLD_GROUPS.map(g => `<h3 class="group-title">${g.name}</h3>
    <div class="grid">${g.ids.map(holdById).sort((a, b) => sashOrder(a) - sashOrder(b)).map(card).join('')}</div>`).join('');
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
  $('#hs-areas').innerHTML = areaTags(hold).map((t, i) => `<span class="tag ${i === 0 ? `style-${hold.style}` : ''}">${t}</span>`).join('');
  $('#hs-video').href = videoUrl(hold);
  $('#hs-cam').checked = state.settings.camera;
  renderSheetLevel();
  $('#hold-sheet').showModal();
}

function renderSheetLevel() {
  const hold = sheetHold, hs = P.holdState(state, hold.id);
  // Locked holds show what they cost instead of the level picker and Start.
  const locked = !P.isOpen(state, hold.id);
  $('#hs-unlock').hidden = !locked;
  $('#hs-levels').hidden = locked;
  $('#hs-start').hidden = locked;
  $('#hs-cam-row').hidden = locked || !hold.camera;
  if (locked) {
    const price = P.unlockPrice(state), short = price - state.coins, need = sashNeed(hold.sash);
    $('#hs-unlock-msg').innerHTML = need
      ? `This hold opens at the <b>${P.sashByKey(hold.sash).name}</b>: level up your holds to earn it. Then it unlocks for ${price} coins.`
      : short > 0
        ? `Unlock this hold for <b>${price} coins</b>. You have ${state.coins}, so ${short} more to go.`
        : `Unlock this hold for <b>${price} coins</b>. You have ${state.coins}.`;
    $('#hs-buy').innerHTML = need ? `${LOCK} ${need}` : `${COIN} Unlock for ${price}`;
    $('#hs-buy').disabled = short > 0 || !!need;
    sheetLevel = 1;
  }
  const unlocked = hs.mastered || state.testMode ? 4 : hs.level;
  // The level after yours can be taken as a test; the rest stay locked.
  const testLevel = !locked && !hs.mastered && !state.testMode && hs.level < 4 ? hs.level + 1 : null;
  $('#hs-levels').innerHTML = hold.levels.map((l, i) => {
    const n = i + 1, closed = n > unlocked && n !== testLevel;
    return `<button type="button" role="tab" class="lv ${n === sheetLevel ? 'on' : ''} ${n === testLevel ? 'test' : ''}" data-level="${n}" ${closed ? 'disabled' : ''} aria-selected="${n === sheetLevel}">
      ${n > unlocked ? LOCK : n}</button>`;
  }).join('');
  const testing = sheetLevel === testLevel;
  $('#hs-test-msg').hidden = !testing;
  $('#hs-start').textContent = testing ? 'Take the level test' : 'Start';
  if (testing) {
    const price = testPrice(sheetLevel), short = price > state.coins, done = P.testedToday(state, hold.id);
    $('#hs-test-msg').innerHTML = done
      ? `<b>Level test:</b> you’ve taken today’s test for this hold. The next one opens tomorrow.`
      : `<b>Level test:</b> reach the target with ${TEST_FORM}+ average form on camera to unlock level ${sheetLevel} now. One test a day. Passing is free; not passing costs <b>${price} coins</b>.${short ? ` You need ${price} coins to take it.` : ''}`;
    $('#hs-start').disabled = short || done;
    $('#hs-cam-row').hidden = true;
  } else {
    $('#hs-start').disabled = false;
  }
  const lv = hold.levels[sheetLevel - 1];
  $('#hs-fig').innerHTML = figureSVG(hold.figure(sheetLevel));
  $('#hs-lname').textContent = `Level ${sheetLevel} · ${lv.name}`;
  $('#hs-desc').textContent = lv.desc;
  const best = hs.best[sheetLevel];
  $('#hs-meta').innerHTML = `
    <span class="tag strong">${targetText(hold, lv.target)}</span>
    <span class="tag">${coinRate(hold, sheetLevel)}</span>
    ${P.isDaily(state, hold.id) ? `<span class="tag strong">${P.dailyAvailable(state, hold.id) ? `Hold of the day: ${DAILY_MULT}× coins on your first go` : `Hold of the day: ${DAILY_MULT}× used today`}</span>` : ''}
    ${boostTags()}
    ${hold.camera ? `<span class="tag">${viewHint(hold, sheetLevel)}</span>` : '<span class="tag">Honour system</span>'}
    ${best ? `<span class="tag">Best ${amount(hold, best)}</span>` : ''}
    ${!locked && sheetLevel === hs.level && !hs.mastered ? `${pips(hs, { label: true })}
      <span class="lvl-rule">Reach the target on ${P.qualifyDays(hs.level)} different days, on camera with ${P.qualifyForm(hs.level)}+ average form, to ${hs.level < 4 ? 'move up a level' : 'master this hold'}. Each level earns a point towards your sash.</span>` : ''}`;
}

$('#hs-buy').onclick = () => {
  const badges = P.unlockHold(state, sheetHold.id);
  if (!badges) return;
  audio.unlock();
  audio.play('level');
  toast(`${sheetHold.name} unlocked!${badges.length ? ` Badge: ${badges.map(b => b.name).join(', ')}` : ''}`);
  renderSheetLevel();
  renderHome();
};

// ---------- Session ----------

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const COLORS = { good: '#7bd88f', warn: '#ffb547', bad: '#ff5d5d', idle: 'rgba(255,255,255,0.85)' };

let run = null;  // the active session: { session, source, hold, level, raf, wake }

async function startSession(hold, level, useCamera, { test = false } = {}) {
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
  run = { hold, level, camera: useCamera, test };
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
  // Test mode earns nothing: no multipliers, and a zero rate.
  run.boost = state.testMode ? { days: 0, streakMult: 1, double: false, total: 0 } : P.coinBoost(state);
  run.daily = !state.testMode && P.dailyAvailable(state, hold.id);
  run.session = createSession({
    hold, level, camera: useCamera, strictness: state.settings.strictness,
    daily: run.daily, boost: run.boost.total, manual: !!state.testMode, now: source ? source.now() : clock(),
  });
  run.wholeCoins = 0;
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

// What the camera is checking right now, ticked or crossed, so it's clear what to fix.
function renderChecks(v) {
  const show = run.camera && ['ready', 'holding', 'broken', 'flowing'].includes(v.state) && v.seen && v.results;
  // With "show check measurements" on, each check also shows its value and target.
  const num = n => (Math.abs(n) >= 10 ? Math.round(n) : n.toFixed(2));
  const range = r => (r.min !== undefined && r.max !== undefined ? `${num(r.min)}–${num(r.max)}` : r.min !== undefined ? `≥ ${num(r.min)}` : `≤ ${num(r.max)}`);
  const detail = r => (state.settings.showValues ? ` <small>${num(r.value)} (${range(r)})</small>` : '');
  // One row per check, kept between frames (so they can slide open and closed), in the
  // hold's own order. A good check is just a tick; one that needs fixing opens with what
  // to do. With measurements on, every row stays open to show its numbers.
  const el = $('#s-checks');
  const rows = el.rows ??= new Map();
  const items = show ? [...new Map(v.results.map(r => [r.label, r])).values()] : [];
  const keep = new Set(items.map(r => r.label));
  for (const [key, row] of rows) if (!keep.has(key)) { row.remove(); rows.delete(key); }
  items.forEach((r, i) => {
    let row = rows.get(r.label);
    if (!row) {
      row = document.createElement('div');
      row.innerHTML = '<i></i><span></span>';
      rows.set(r.label, row);
    }
    const ok = r.s >= 0.85, open = !ok || state.settings.showValues;
    const cls = `chk ${ok ? 'ok' : r.s >= 0.5 ? 'meh' : 'bad'}${open ? ' open' : ''}`;
    if (row.className !== cls) row.className = cls;
    row.firstChild.textContent = ok ? '✓' : '!';
    const text = `${ok ? r.label : r.cue ?? r.label}${detail(r)}`;
    if (row.lastChild.dataset.text !== text) { row.lastChild.dataset.text = text; row.lastChild.innerHTML = text; }
    row.title = r.label;
    if (el.children[i] !== row) el.insertBefore(row, el.children[i] ?? null);  // the hold's order
  });
}

function updateHud(v) {
  renderChecks(v);
  if (v.flow) return updateFlowHud(v);
  const s = run.session;
  // One-sided holds show the current side's time against that side's target.
  $('#s-time').textContent = fmt(v.sideHeld);
  $('#s-target').textContent = ` / ${fmt(v.sideTarget)}`;
  $('#s-level').textContent = `Level ${run.level} · ${run.hold.levels[run.level - 1].name}${v.sides === 2 ? ` · Side ${v.sideIndex + 1} of 2` : ''}${v.daily ? ` · ${DAILY_MULT}× today` : ''}${boostText(run.boost)}${run.test ? ' · Level test' : ''}${state.testMode ? ' · Test mode' : ''}`;
  // Whole coins, plus a bar filling towards the next one; a chime and a pop as each lands.
  const whole = Math.floor(v.coins);
  $('#s-coins').textContent = whole.toLocaleString();
  $('#s-coin-next').style.width = `${Math.round((v.coins % 1) * 100)}%`;
  if (whole > run.wholeCoins) {
    run.wholeCoins = whole;
    audio.play('point');
    const box = $('#s-coins-box');
    box.classList.remove('pop');
    void box.offsetWidth;
    box.classList.add('pop');
  }
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
      $('#s-cue').textContent = orientationTip(run) ?? `${viewHint(run.hold, run.level)}, about 2–3 m from the phone.`;
      break;
    case 'ready':
      setStatus('wait', 'Get into position');
      $('#s-cue').textContent = cue || 'Looking good… hold still';
      break;
    case 'holding':
      setStatus(v.tier.tier ? 'bonus' : 'good', v.tier.tier ? `Bonus ×${v.tier.mult} coins` : 'Hold');
      if (v.sideReached && v.canSwitch) $('#s-cue').textContent = run.camera ? 'Step out of position when you’re ready to switch sides' : 'Tap Switch sides when you’re ready';
      else if (v.tier.tier && v.tier.tier < 3 && (!run.camera || v.score >= 90)) $('#s-cue').textContent = `Bonus level ${v.tier.tier}. Keep going for ×${BONUS_TIERS[v.tier.tier].mult}`;
      else $('#s-cue').textContent = run.camera ? (v.score >= 90 ? 'Great form' : cue) : (v.sideReached ? 'Keep going for bonus coins' : '');
      break;
    case 'broken': {
      // Test mode waits for you (tap Done to finish); otherwise it counts down to the end.
      const left = s.manual ? '' : ` · ${Math.ceil((v.sideReached ? 3.5 : 8) - s.outTime)}`;
      setStatus('bad', v.seen ? `Back into position${left}` : `Can’t see you${left}`);
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

// The step of the movement you're on, from where your hands are.
function flowStep(v) {
  if (v.phase === 'down') return v.worst && v.phaseTime > 3 ? v.worst.cue : 'Float your arms down the sides';
  if (v.inPose && v.hands < -0.3) return v.topTime < v.dwell ? 'Stretch up through the palms… hold' : 'Stretch up';
  if (v.worst && v.phaseTime > 6) return v.worst.cue;
  return v.hands > 0.15 ? 'Lift your hands up the front of your body' : 'Turn the palms over and push up to the sky';
}

// Session screen for flowing holds: cycles counted instead of a timer.
function updateFlowHud(v) {
  $('#s-time').textContent = v.count;
  $('#s-target').textContent = ` / ${v.goal}`;
  $('#s-level').textContent = `Level ${run.level} · ${run.hold.levels[run.level - 1].name} · slow cycles${v.daily ? ` · ${DAILY_MULT}× today` : ''}${boostText(run.boost)}${run.test ? ' · Level test' : ''}${state.testMode ? ' · Test mode' : ''}`;
  const whole = Math.floor(v.coins);
  $('#s-coins').textContent = whole.toLocaleString();
  $('#s-coin-next').style.width = `${Math.round((v.coins % 1) * 100)}%`;
  if (whole > run.wholeCoins) { run.wholeCoins = whole; audio.play('point'); }
  const bar = $('#s-tbar');
  bar.style.width = `${Math.min(100, (v.count / v.goal) * 100)}%`;
  bar.classList.toggle('over', v.reached);
  $('#session').dataset.state = v.state;
  $('#s-fill').style.width = `${v.score}%`;
  $('#s-fill').className = `fill ${v.score >= 70 ? 'good' : v.score >= 45 ? 'warn' : 'bad'}`;
  $('#s-score').textContent = run.camera ? `${{ lift: 'Rise', high: 'Reach up', lower: 'Lower', low: 'Hands low' }[v.aim]} ${v.score}` : '';
  const done = $('#s-done');
  if (done) done.textContent = 'Done';
  const secs = Math.floor(v.cycleTime);
  switch (v.state) {
    case 'framing':
      setStatus('wait', 'Step back so your whole body is in view');
      $('#s-cue').textContent = orientationTip(run) ?? `${viewHint(run.hold, run.level)}, about 2–3 m from the phone.`;
      break;
    case 'ready':
      setStatus('wait', 'Hands at your belly to begin');
      $('#s-cue').textContent = v.worst?.cue ?? 'Hands together in front of your belly, palms up';
      break;
    case 'countdown':
      setStatus('wait', `Get ready · ${Math.ceil(5 - v.stateTime)}`);
      $('#s-cue').textContent = 'Hands together in front of your belly, palms up';
      break;
    case 'paused':
      setStatus('wait', 'Paused');
      $('#s-cue').textContent = '';
      break;
    case 'flowing':
      if (v.tooFast) setStatus('bad', 'Slower');
      else setStatus(v.reached ? 'bonus' : 'good', `${v.phase === 'up' ? 'Rise' : 'Lower'} · ${secs}s${v.reached ? ` · bonus ×${v.tier.mult}` : ''}`);
      $('#s-cue').textContent = v.tooFast ? `At least ${v.minCycle} seconds for each cycle` : flowStep(v);
      break;
  }
}

// A nudge when the phone is held the less useful way round for this pose.
function orientationTip(r) {
  const wide = prefersLandscape(r.hold, r.level), upright = innerHeight > innerWidth;
  if (wide && upright) return 'Tip: turn your phone on its side (landscape). This pose is wider than it is tall, so you can stand closer.';
  if (!wide && !upright) return 'Tip: hold your phone upright (portrait). This pose is taller than it is wide, so it fits from closer that way.';
  return null;
}

// Screen space taken by the controls: the timer at the top and form meter at the bottom
// in portrait, or the side panel in landscape (see the landscape rules in style.css).
const sidePanel = matchMedia('(orientation: landscape) and (max-height: 600px)');
function hudInset() {
  if (sidePanel.matches) {
    const panel = Math.max(...['.timer', '.status', '.cue', '.hud-bottom'].map(q => $(q).getBoundingClientRect().right));
    return { top: $('.hud-top').getBoundingClientRect().bottom, bottom: 0, left: panel + 8 };
  }
  const top = $('#s-tbar').getBoundingClientRect().bottom + 8;
  const bottom = window.innerHeight - $('.hud-bottom').getBoundingClientRect().top + 8;
  // Keep the body clear of the column of ticks down the left.
  const ticks = $('#s-checks').getBoundingClientRect();
  return { top, bottom, left: ticks.width ? Math.min(ticks.right, 64) + 6 : 0 };
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
  // Parts a check covers show how that check is going; the rest go green whenever
  // you're in a good position, so all green means all good.
  const active = v.state !== 'framing';
  const color = s => !active ? COLORS.idle : s === undefined ? (v.inPose ? COLORS.good : COLORS.idle)
    : s >= 0.85 ? COLORS.good : s >= 0.5 ? COLORS.warn : COLORS.bad;
  // Line width follows the body's size on screen (its torso), not the screen's width:
  // a small figure in landscape shouldn't get the same chunky lines as a big one.
  const torso = lm[11] && lm[23] ? Math.hypot(...[0, 1].map(k => (pt(lm[11])[k] + pt(lm[12])[k] - pt(lm[23])[k] - pt(lm[24])[k]) / 2)) : 100;
  const width = Math.max(2.5, Math.min(7, torso / 22));
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
  const { session, hold, level, camera, test, boost } = run;
  const result = { ...session.result, test, boostDouble: boost.double };
  const sumBoost = boost;
  stopRun();
  lastRun = { hold, level, camera, test };
  if (result.held < 3) {
    toast('Session too short to count');
    show('home');
    renderHome();
    return;
  }
  const outcome = state.testMode ? testOutcome(result) : P.recordSession(state, result);
  renderSummary(hold, level, result, outcome, sumBoost);
}

// ---------- Summary ----------

// In test mode nothing is recorded: the summary gets a blank outcome instead.
function testOutcome(r) {
  const hs = P.holdState(state, r.holdId);
  return {
    coins: 0, reached: r.reached ?? r.held >= r.target, pb: false, prevBest: hs.best[r.level] ?? 0, milestoneDouble: 0,
    qualified: false, qualDays: hs.qualDays.length, levelUp: false, mastered: false, newLevel: r.level, test: null,
    bets: [], betSteps: [], milestones: [], badges: [], rankUp: false, rank: P.sashRank(state), levelBonus: 0,
    wallet: state.coins, nextUnlock: null, streak: P.streak(state), testMode: true,
  };
}

function renderSummary(hold, level, r, o, boost) {
  show('summary');
  const pct = r.unit === 'cycles' ? r.count / r.goal : r.held / r.target;
  $('#sum-kicker').textContent = `${hold.name} · Level ${level}`;
  $('#sum-title').textContent =
    o.levelUp ? `Level ${o.newLevel} unlocked!` :
    o.mastered ? `${hold.name} mastered!` :
    pct >= 1.5 ? 'Beyond the target!' :
    o.reached ? 'Target reached!' :
    o.pb ? 'New personal best!' :
    pct >= 0.75 ? 'So close!' : 'Good effort';
  countUp($('#sum-coins'), o.coins);
  const notes = [
    ...(r.daily ? [`hold of the day ${DAILY_MULT}×`] : []),
    ...(boost.streakMult > 1 ? [`${boost.days}-day streak +${Math.round((boost.streakMult - 1) * 100)}%`] : []),
    ...(boost.double || o.milestoneDouble ? [`milestone day ${MILESTONE_DAY_MULT}×`] : []),
  ];
  // What to do with the coins: the next unlock, or just the wallet.
  const wallet = o.nextUnlock
    ? (o.wallet >= o.nextUnlock ? `You have ${o.wallet} coins: enough to unlock a new hold!` : `You have ${o.wallet} coins. ${o.nextUnlock - o.wallet} more to unlock a new hold.`)
    : `You have ${o.wallet} coins.`;
  const stepCoins = o.betSteps.reduce((t, st) => t + st.coins, 0);
  const wonCoins = o.bets.filter(b => b.result === 'won' && !b.def.steps).reduce((t, b) => t + b.payout, 0);
  const betLine = (stepCoins ? `Plus ${stepCoins} coins from your bonus time bet.<br>` : '')
    + (wonCoins ? `Plus ${wonCoins} coins from your bet.<br>` : '');
  const levelLine = o.levelBonus ? `Includes ${o.levelBonus} coins for ${o.mastered ? 'mastering this hold' : `reaching level ${o.newLevel}`}.<br>` : '';
  $('#sum-breakdown').innerHTML = `${notes.length ? `Includes ${notes.join(' and ')}.<br>` : ''}${levelLine}${betLine}${wallet}`;
  // Level test, bet and streak milestone results.
  const extra = [];
  if (o.testMode) extra.push('<div class="banner">Test mode: this session wasn’t recorded and earned nothing.</div>');
  if (o.test) {
    extra.push(o.test.passed
      ? `<div class="banner good">Level test passed! Level ${level} is unlocked.</div>`
      : `<div class="banner bad">Level test not passed: −${o.test.price} coins. You need the full target on camera with ${TEST_FORM}+ form.</div>`);
  }
  for (const b of o.bets) extra.push(b.result === 'won' ? `<div class="banner good">Bet won: ${b.def.name}! +${b.payout} coins.</div>` : `<div class="banner bad">Bet lost: ${b.def.name}.</div>`);
  for (const m of o.milestones) extra.push(`<div class="banner gold">🔥 ${m.name}! ${milestoneReward(m)}${m.double ? ' (starting with this hold)' : ''}.</div>`);
  $('#sum-extra').innerHTML = extra.join('');
  if (o.test?.passed) setTimeout(() => audio.play('level'), 300);
  // The big moments get the full-screen treatment, once the summary has appeared.
  setTimeout(() => {
    o.betSteps.forEach(celebrateBetStep);
    o.bets.forEach(celebrateBet);
    o.milestones.forEach(celebrateMilestone);
  }, 900);
  $('#sum-stats').innerHTML = `
    ${r.unit === 'cycles'
      ? `<div><b>${r.count}</b><small>of ${r.goal} slow cycles</small></div>`
      : `<div><b>${fmtLong(r.held)}</b><small>held of ${fmtLong(r.target)}${r.sides ? `<br>${r.sides.map(t => fmtLong(t)).join(' + ')}` : ''}</small></div>`}
    ${r.camera ? `<div><b>${Math.round(r.avgForm)}</b><small>average form</small></div>` : '<div><b>—</b><small>honour mode</small></div>'}
    <div><b>${o.pb ? 'New!' : o.prevBest ? amount(hold, o.prevBest) : '—'}</b><small>${o.pb ? 'personal best' : 'best'}</small></div>`;

  const hs = P.holdState(state, hold.id);
  let lvl = '';
  if (o.levelUp) lvl = `<div class="banner">Next up: <b>${hold.levels[o.newLevel - 1].name}</b>. ${targetText(hold, hold.levels[o.newLevel - 1].target)}, ${coinRate(hold, o.newLevel)}. That’s a point towards your sash.</div>`;
  else if (o.mastered) lvl = '<div class="banner">You’ve mastered every level of this hold: another point towards your sash.</div>';
  else if (level === hs.level && !hs.mastered && !o.testMode) {
    const need = P.qualifyDays(hs.level) - hs.qualDays.length, form = P.qualifyForm(hs.level);
    const toward = hs.level < 4 ? `level ${hs.level + 1}` : 'mastery';
    lvl = `<div class="lvl-progress">${pips(hs)}<span>${o.qualified
      ? `Day counted! ${need} more day${need === 1 ? '' : 's'} to ${toward}.`
      : !r.camera ? 'Honour sessions earn coins but don’t count towards levels: use the camera for that.'
      : !o.reached ? `Reach ${r.unit === 'cycles' ? `${r.goal} slow cycles` : fmtLong(r.target)} to count today towards ${toward}.`
      : r.avgForm < form ? `Average form ${form}+ is needed for the day to count.`
      : 'Today already counted. Come back tomorrow.'}</span></div>`;
  }
  $('#sum-level').innerHTML = lvl;

  const items = [
    ...(o.rankUp ? [`<div class="badge earned rank"><span class="sash" style="--sash:${o.rank.color};--deg:${o.rank.degree ?? 0}"></span><b>${o.rank.name}</b><small>New rank</small></div>`] : []),
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
  if (r.unit === 'cycles') {
    const short = r.goal - r.count;
    return o.pb ? `More cycles than ever. ${short} to go to the target.` : `${short} cycle${short === 1 ? '' : 's'} short. Slow and steady: each one needs at least a few seconds.`;
  }
  const left = r.sides ? r.sides.reduce((t, x) => t + Math.max(0, r.target / 2 - x), 0) : r.target - r.held;
  if (o.pb) return `Further than ever. ${fmtLong(left)} to go to reach the target.`;
  return `${fmtLong(left)} short of the target. Rest for a minute and try again, or try an easier level.`;
}

function countUp(el, to, prefix = '') {
  const t0 = performance.now(), dur = 900;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    el.textContent = prefix + Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

const medal = () => '<svg viewBox="0 0 24 24" class="medal"><circle cx="12" cy="14" r="7"/><path d="M8 2h3l1 5-3 1zM16 2h-3l-1 5 3 1z"/></svg>';

// ---------- Progress ----------

function renderProgress() {
  show('progress');
  const r = P.sashRank(state), t = P.totals(state);
  $('#rank-card').innerHTML = `
    <span class="sash big" style="--sash:${r.color};--deg:${r.degree ?? 0}"></span>
    <div><h2>${r.name}</h2><span class="xpbar"><i style="width:${Math.round(r.progress * 100)}%"></i></span>
    <small>${r.points} mastery points${r.next ? ` · ${r.next.points - r.points} to ${r.next.name}` : ''}. A point for each level you reach on a hold, and one for mastering it.</small></div>`;
  const week = P.areaLoad(state, { days: 7 });
  const top = Math.max(1, ...Object.values(week));
  $('#area-bars').innerHTML = Object.entries(AREAS).map(([a, name]) => `
    <div class="area-row"><span>${name}</span><span class="area-bar"><i style="width:${Math.round((week[a] / top) * 100)}%"></i></span></div>`).join('');
  $('#stats').innerHTML = `
    <div><b>${fmtLong(t.time)}</b><small>total held</small></div>
    <div><b>${t.sessions}</b><small>sessions</small></div>
    <div><b>${P.streak(state)}</b><small>day streak</small></div>
    <div><b>${t.bestStreak}</b><small>best streak</small></div>`;

  // 16 weeks, Monday-first columns, ending this week.
  const weeks = 16, today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const max = Math.max(1, ...Object.values(state.days).map(d => d.coins));
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = P.dayKey(d), day = state.days[key];
    const lvl = d > today ? 'future' : day ? `l${Math.min(4, 1 + Math.floor((day.coins / max) * 3.999))}` : '';
    cells += `<i class="${lvl}" title="${key}${day ? `: ${day.coins} coins, ${fmtLong(day.time)}` : ''}"></i>`;
  }
  $('#heatmap').innerHTML = cells;

  $('#bet-log').innerHTML = betLogHTML();
  $('#badges').innerHTML = P.BADGES.map(b => `<div class="badge ${state.badges[b.id] ? 'earned' : 'locked'}">${medal()}<b>${b.name}</b><small>${b.desc}</small></div>`).join('');
  const recent = state.history.slice(-12).reverse();
  $('#history').innerHTML = recent.length ? recent.map(h => {
    const hold = holdById(h.holdId);
    const d = new Date(h.at);
    return `<li><span><b>${hold?.name ?? h.holdId}</b> <small>Lv ${h.level}</small></span>
      <span>${fmtLong(h.held)}${h.held >= h.target ? ' ✓' : ''}</span>
      <span>${h.avgForm ?? '—'}</span><span>+${h.coins}</span>
      <small class="when">${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></li>`;
  }).join('') : '<li class="empty">No sessions yet.</li>';
}

// ---------- Settings ----------

// ---------- Installing as an app ----------

// Chrome, Edge and Android offer an install prompt we can trigger; Safari doesn't,
// so iPhone gets the Add to Home Screen steps instead.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; renderInstall(); });
window.addEventListener('appinstalled', () => { installPrompt = null; renderInstall(); toast('Installed! Open it from your home screen.'); });

const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function renderInstall() {
  const msg = $('#install-msg'), btn = $('#install-btn');
  btn.hidden = true;
  if (isInstalled()) msg.textContent = 'Installed. You’re using the app.';
  else if (installPrompt) { msg.textContent = 'Opens full screen from your home screen, works offline, and keeps your progress safe.'; btn.hidden = false; }
  else if (isIOS()) msg.innerHTML = 'In Safari, tap the <b>Share</b> button (the square with an arrow), then <b>Add to Home Screen</b>. This also stops Safari clearing your progress.';
  else msg.textContent = 'Use your browser’s menu and choose “Install app” or “Add to Home screen”.';
}

$('#install-btn').onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  renderInstall();
};

// Compares this version with the newest one online, so you know you're testing the latest.
// ---------- Test mode ----------

// Tap the version number 5 times quickly to switch test mode on or off: every hold and
// level opens for trying out, and nothing is recorded or earned while it's on.
let versionTaps = [];
$('#version').addEventListener('click', () => {
  const now = performance.now();
  versionTaps = [...versionTaps.filter(t => now - t < 2000), now];
  if (versionTaps.length >= 5) {
    versionTaps = [];
    P.setTestMode(state, !state.testMode);
    $('#settings').close();
    toast(state.testMode ? 'Test mode on: everything open, nothing earned' : 'Test mode off');
    renderHome();
  }
});

async function checkVersion() {
  const el = $('#version-check');
  el.className = '';
  el.textContent = '· checking for updates…';
  try {
    const text = await (await fetch(`js/version.js?check=${Date.now()}`, { cache: 'no-store' })).text();
    const latest = text.match(/VERSION = '([^']+)'/)?.[1];
    if (!latest) throw new Error();
    const newer = latest.split('.').map(Number).some((n, i, a) => {
      const mine = VERSION.split('.').map(Number);
      return a.slice(0, i).every((m, j) => m === mine[j]) && n > mine[i];
    });
    el.className = newer ? 'stale' : 'fresh';
    el.textContent = newer ? `· ${latest} is available: close and reopen the app to update` : '· latest version';
  } catch {
    el.textContent = '· couldn’t check for updates (offline?)';
  }
}

function openSettings() {
  renderInstall();
  $('#version').textContent = `Version ${VERSION}`;
  checkVersion();
  const f = $('#settings form');
  for (const k of ['voice', 'sounds', 'camera', 'autoframe', 'showValues']) f.elements[k].checked = state.settings[k];
  f.elements.strictness.value = state.settings.strictness;
  f.elements.appearance.value = state.settings.appearance;
  f.elements.model.value = state.settings.model;
  $('#settings').showModal();
}

$('#settings form').addEventListener('change', e => {
  const el = e.target;
  if (!el.name) return;
  state.settings[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  audio.configure(state.settings);
  applyAppearance();
  P.save(state);
});

// Light or dark from Settings, or follow the phone ("system").
function applyAppearance() {
  const a = state.settings.appearance;
  if (a === 'light' || a === 'dark') document.documentElement.dataset.theme = a;
  else delete document.documentElement.dataset.theme;
}
applyAppearance();

$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mabu-backup-${P.dayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!P.isBackup(data)) throw new Error('Not a Mabu backup');
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
  if (!confirm('Delete all progress, coins, unlocked holds and badges? This can’t be undone.')) return;
  const settings = state.settings;
  try { localStorage.removeItem('holds.v1'); } catch {}
  state = P.load();
  state.settings = settings;
  P.save(state);
  $('#settings').close();
  renderHome();
  toast('Progress reset');
};

// ---------- Celebrations ----------

// Queued full-screen moments for bet results and streak milestones.
const celebrations = [];
function celebrate(c) {
  celebrations.push(c);
  if (celebrations.length === 1) showCelebration();
}

function showCelebration() {
  const c = celebrations[0], el = $('#celebrate');
  if (!c) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `celebrate ${c.win ? 'win' : 'lose'}`;
  $('#cel-kicker').textContent = c.kicker;
  $('#cel-title').textContent = c.title;
  $('#cel-msg').textContent = c.msg;
  $('#cel-coins-row').hidden = !c.coins;
  $('#cel-ok').textContent = c.ok ?? (c.win ? 'Nice!' : 'OK');
  $('#cel-alt').hidden = !c.alt;
  if (c.alt) { $('#cel-alt').textContent = c.alt.label; $('#cel-alt').onclick = () => { nextCelebration(); c.alt.go(); }; }
  // A burst of coins flying out from the centre.
  $('#cel-burst').innerHTML = c.win ? Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2, r = 110 + (i % 3) * 40;
    return `<i style="--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r)}px;--d:${(i % 4) * 60}ms">${COIN}</i>`;
  }).join('') : '';
  if (c.coins) countUp($('#cel-coins'), c.coins, '+');
  audio.unlock();
  if (c.win) { audio.play('level'); setTimeout(() => audio.play('target'), 450); } else audio.play('end');
  if (c.say) audio.say(c.say, { priority: true });
}

function nextCelebration() { celebrations.shift(); showCelebration(); }
$('#cel-ok').onclick = nextCelebration;

function celebrateBet(r) {
  const payout = r.payout ?? r.def.payout;
  if (r.result === 'won' && r.def.steps) {
    // Stepped bets have already paid (and celebrated) each step; this is the wrap-up.
    const all = r.steps >= r.def.steps.length;
    celebrate({
      win: true, kicker: all ? 'Bet complete' : 'Bet finished', title: r.def.name, coins: payout,
      msg: `${all ? 'Every step reached' : `${r.steps} of ${r.def.steps.length} steps reached`}: ${payout} coins in all for a ${r.def.stake}-coin stake, paid as you went.`,
      say: all ? `Bet complete! ${payout} coins in all` : undefined,
    });
  } else if (r.result === 'won') {
    celebrate({
      win: true, kicker: 'Bet won', title: r.def.name, coins: payout,
      msg: `You staked ${r.def.stake} and won ${payout}. Paid into your wallet.`,
      say: `Bet won! Plus ${payout} coins`,
    });
  } else {
    celebrate({
      win: false, kicker: 'Bet missed', title: r.def.name,
      msg: `Not this time: you got to ${r.progress.toLowerCase()}. The ${r.def.stake}-coin stake is gone, but the training still counts. Fancy another go?`,
      ok: 'Not now', alt: { label: 'New bet', go: () => openShop('bets') },
    });
  }
}

// A step of the bonus time bet, paid the moment it's reached.
function celebrateBetStep(st) {
  celebrate({
    win: true, kicker: `Bonus time · step ${st.n} of ${st.of}`, title: `${st.name}!`, coins: st.coins,
    msg: st.n < st.of ? 'Paid into your wallet. Keep holding past your targets for the next step.' : 'The last step: paid into your wallet.',
    say: `${st.name}! Plus ${st.coins} coins`,
  });
}

function celebrateMilestone(m) {
  celebrate({
    win: true, kicker: 'Streak milestone', title: `🔥 ${m.name}!`, coins: m.coins || undefined,
    msg: `${milestoneReward(m)}.${m.double ? ' Every hold you do today earns double.' : ''} Keep the fire going.`,
    say: `${m.name}! ${m.coins ? `Plus ${m.coins} coins` : m.double ? 'Double coins today' : 'A free freeze'}`,
  });
}

// ---------- Streak strip: the last week, today, and the days to the next milestone ----------

const SHOW_PAST = 6, SHOW_AHEAD = 7;
const MARK_ICON = { trained: '✓', rest: 'z', freeze: '❄', repair: '✓', missed: '', open: '' };

function renderStreakStrip() {
  const today = P.dayKey(), n = P.streak(state), boost = P.coinBoost(state);
  const doneToday = !!state.days[today];
  const next = P.nextMilestone(state);
  // The day the next milestone lands, training every day from now.
  const toGo = next ? next.days - n - (doneToday ? 0 : 1) : null;
  const goalDay = next ? P.addDays(today, toGo) : null;
  const ahead = next ? Math.min(toGo, SHOW_AHEAD) : 3;
  const days = P.dayMarks(state, P.addDays(today, -SHOW_PAST), P.addDays(today, ahead));
  const letter = d => new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' });
  const dot = ({ day, mark }) => {
    const goal = day === goalDay;
    return `<span class="ss-day ${mark} ${day === today ? 'today' : ''} ${goal ? 'goal' : ''}">
      <i>${goal ? '🎁' : MARK_ICON[mark]}</i><small>${day === today ? 'Today' : letter(day)}</small></span>`;
  };
  const dots = days.map(dot).join('');
  // A milestone further off than the strip shows gets its own dot after a gap.
  const far = next && toGo > SHOW_AHEAD
    ? `<span class="ss-gap">···</span><span class="ss-day open goal"><i>🎁</i><small>Day ${next.days}</small></span>` : '';
  const reward = next ? milestoneReward(next) : '';
  const when = toGo === 0 ? 'Train today for' : toGo === 1 ? 'Tomorrow:' : `${toGo} days to go:`;
  $('#streak-strip').innerHTML = `
    <span class="ss-head"><b>🔥 ${n ? `${n}-day streak` : 'No streak yet'}</b>
      <span>${[
        ...(boost.streakMult > 1 ? [`+${Math.round((boost.streakMult - 1) * 100)}% streak bonus`] : n && boost.nextStepIn ? [`+5% from day ${boost.days + boost.nextStepIn}`] : []),
        ...(boost.double ? [`${MILESTONE_DAY_MULT}× day`] : []),
        ...(state.streak.freezes ? [`<span class="freezes" title="Streak freezes">❄${state.streak.freezes}</span>`] : []),
      ].join(' · ')}</span></span>
    <span class="ss-days">${dots}${far}</span>
    <span class="ss-next">${!doneToday ? `<b>Train today</b> to make it ${n + 1}. ` : ''}${next ? `${next.name} · ${when} ${reward}` : 'Every milestone reached. Keep the fire going.'}</span>`;
}

// ---------- Home cards: broken streak, active bet ----------

function renderHomeCards() {
  const cards = [];
  if (state.testMode) {
    cards.push(`<div class="home-card test-mode">
      <p><b>Test mode is on.</b> Every hold and level is open to try, and nothing is recorded or earned. Tap the version in Settings 5 times to leave, or:</p>
      <div class="row"><button class="btn" data-act="test-mode-off">Leave test mode</button></div>
    </div>`);
  }
  const b = state.streak.broken;
  if (b) {
    cards.push(`<div class="home-card warn">
      <p><b>Your ${b.streak}-day streak ended.</b> Repair it for ${b.price} coins to keep it going.</p>
      <div class="row"><button class="btn" data-act="dismiss-repair">Let it go</button><button class="btn primary" data-act="repair" ${state.coins < b.price ? 'disabled' : ''}>${COIN} Repair for ${b.price}</button></div>
    </div>`);
  }
  const over = P.overworked(state);
  if (over) {
    const { unlocked, locked } = P.restingHolds(state, over.area);
    const [work, rest] = AREA_WORDS[over.area];
    const picks = (unlocked.length ? unlocked : locked).map(h => `<button class="chip-btn" data-open-hold="${h.id}">${h.name}${unlocked.length ? '' : ` ${LOCK}`}</button>`).join('');
    cards.push(`<div class="home-card rest-hint">
      <p><b>You’ve done a lot of ${work} lately.</b> Give ${rest} a rest and try ${unlocked.length ? 'one of these' : 'unlocking one of these'}:</p>
      <div class="chip-row">${picks}</div>
    </div>`);
  }
  for (const slot of ['bet', 'weekBet']) { const bp = P.betProgress(state, slot); if (bp) cards.push(betCard(bp)); }
  $('#home-cards').innerHTML = cards.join('');
}

// Settled bets, newest first.
function betLogHTML(limit = 30) {
  const log = state.betLog.slice(0, limit);
  if (!log.length) return '<li class="empty">No bets yet. Find them in the shop.</li>';
  return log.map(b => {
    const def = BETS.find(x => x.id === b.id);
    const when = new Date(b.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `<li class="${b.result}"><span><b>${def?.name ?? b.id}</b> <small>${when}</small></span>
      <span class="bet-result">${b.result === 'won' ? `Won +${b.payout}` : `Lost −${b.stake}`}</span></li>`;
  }).join('');
}

function betCard(bp) {
  const ends = bp.end === P.dayKey() ? 'ends tonight' : `ends ${new Date(bp.end + 'T12:00').toLocaleDateString(undefined, { weekday: 'long' })}`;
  return `<div class="home-card bet">
    <p><b>Bet: ${bp.def.name}</b> · win ${bp.def.payout} coins · ${ends}</p>
    <div class="progress"><i style="width:${Math.round(bp.frac * 100)}%"></i></div>
    <small>${bp.text}</small>
  </div>`;
}

// ---------- Shop ----------

let shopTab = 'temple';

function openShop(tab = shopTab) {
  shopTab = tab;
  show('shop');
  renderShop();
}

function renderShop() {
  $('#shop-wallet').textContent = state.coins.toLocaleString();
  $$('#shop-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === shopTab));
  $('#shop-preview').hidden = !(shopTab === 'temple' || shopTab === 'themes');
  $('#shop-body').innerHTML = { temple: shopTemple, themes: shopThemes, monk: shopMonk, streak: shopStreak, bets: shopBets }[shopTab]();
  if (shopTab === 'themes') {
    $$('#shop-body canvas[data-theme]').forEach(cv => drawTemple(cv, state, 3.3, cv.dataset.theme, templeMonk()));
  }
  if (shopTab === 'monk') renderAvatar($('#monk-preview'), P.avatarLook(state));
  drawScenes(true);
}

const buyBtn = (act, id, price, label = `${COIN} ${price}`) =>
  `<button class="btn buy" data-act="${act}" data-id="${id}" ${state.coins < price ? 'disabled' : ''}>${label}</button>`;

function shopTemple() {
  const tier = state.temple.tier ?? 0, now = TEMPLE_TIERS[tier], next = P.nextTier(state);
  const owned = TEMPLE_ITEMS.filter(i => P.owns(state, i.id)).length;
  // Seasonal packs on sale now: buy while the season lasts; they return each year.
  const seasonal = P.activeSeasons().map(season => {
    const until = new Date(`2000-${season.to}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `<h3>${season.icon} ${season.name} <small>on sale until ${until}</small></h3>
    <p class="shop-note">Yours to keep: they appear in your temple each ${season.name}.</p>
    <ul class="shop-list seasonal">${season.items.map(i => {
      const built = P.owns(state, i.id), hidden = built && P.isHidden(state, i.id);
      return `<li class="${built ? 'owned' : ''} ${hidden ? 'put-away' : ''}"><div><b>${i.name}</b><small>${built ? (hidden ? 'Put away' : 'In your temple') : i.desc}</small></div>
        ${built ? `<button class="btn buy" data-act="toggle-item" data-id="${i.id}">${hidden ? 'Show' : 'Hide'}</button>` : buyBtn('buy-seasonal', i.id, i.price)}</li>`;
    }).join('')}</ul>`;
  }).join('');
  const item = i => {
    const built = P.owns(state, i.id), allowed = P.canBuild(state, i), hidden = built && P.isHidden(state, i.id);
    const note = allowed ? `<small>${i.desc}</small>` : `<small class="blocked">Needs the ${TEMPLE_TIERS[i.needs].name}</small>`;
    // Owned decorations can be put away and brought back out, to arrange the temple.
    const toggle = `<button class="btn buy" data-act="toggle-item" data-id="${i.id}">${hidden ? 'Show' : 'Hide'}</button>`;
    return `<li class="${built ? 'owned' : ''} ${hidden ? 'put-away' : ''}"><div><b>${i.name}</b>${built ? `<small>${hidden ? 'Put away' : 'In your temple'}</small>` : note}</div>
      ${built ? toggle : allowed ? buyBtn('buy-item', i.id, i.price) : ''}</li>`;
  };
  return `<p class="shop-intro">Your temple: <b>${now.name}</b> (stage ${tier + 1} of ${TEMPLE_TIERS.length}).</p>
  <ul class="shop-list">${next
    ? `<li><div><b>Upgrade to ${next.name}</b><small>${next.desc}</small>${sashNeed(next.sash) ? `<small class="blocked">${sashNeed(next.sash)}</small>` : ''}</div>${sashNeed(next.sash) ? '' : buyBtn('upgrade-temple', next.id, next.price)}</li>`
    : `<li class="owned"><div><b>${now.name}</b><small>Your temple is complete.</small></div><span class="owned-tag">Built</span></li>`}</ul>
  ${seasonal}
  <h3>Decorations <small>${owned} of ${TEMPLE_ITEMS.length}</small></h3>
  <ul class="shop-list">${[...TEMPLE_ITEMS].sort((a, b) => a.price - b.price).map(item).join('')}</ul>`;
}

// Your monk: a big preview, then characters, outfits and accessories to buy and wear.
function shopMonk() {
  const a = state.avatar, r = P.sashRank(state);
  const row = (kind, i) => {
    const owned = P.ownsAvatar(state, i.id);
    const on = kind === 'accessory' ? a.wear[i.slot] === i.id : a[kind] === i.id;
    const btn = !owned ? buyBtn('buy-avatar', `${kind}:${i.id}`, i.price)
      : on && kind !== 'accessory' ? '<span class="owned-tag">Wearing</span>'
      : `<button class="btn buy" data-act="wear-avatar" data-id="${kind}:${i.id}">${on ? 'Take off' : 'Wear'}</button>`;
    return `<li class="${on ? 'owned' : ''}"><div><b>${i.name}</b><small>${i.desc}</small></div>${btn}</li>`;
  };
  const list = (kind, items) => `<ul class="shop-list">${items.map(i => row(kind, i)).join('')}</ul>`;
  return `<div class="monk-stage">
    <canvas id="monk-preview" class="avatar-big" width="13" height="20"></canvas>
    <div><p class="shop-intro">Your monk wears your sash: <b>${r.name}</b>. It changes as you earn your way up.</p>
      <button class="btn" data-act="avatar-temple">${a.inTemple ? 'Shown in your temple · Hide' : 'Show in your temple'}</button></div>
  </div>
  <h3>Characters</h3>${list('character', AVATAR_CHARACTERS)}
  <h3>Outfits</h3>${list('outfit', AVATAR_OUTFITS)}
  <h3>Accessories <small>one each for head, neck and hand</small></h3>${list('accessory', AVATAR_ACCESSORIES)}`;
}

function shopThemes() {
  return `<p class="shop-intro">Themes change the time of day or season in your temple, and the app's colours.</p>
  <div class="theme-grid">${THEMES.map(t => {
    const have = state.temple.themes.includes(t.id), active = state.temple.theme === t.id;
    return `<div class="theme-card ${active ? 'active' : ''}">
      <canvas data-theme="${t.id}" width="120" height="${SCENE_H}"></canvas>
      <b>${t.name}</b><small>${t.desc}</small>
      ${active ? '<span class="owned-tag">In use</span>' : have ? `<button class="btn buy" data-act="use-theme" data-id="${t.id}">Use</button>` : buyBtn('buy-theme', t.id, t.price)}
    </div>`;
  }).join('')}</div>
  <h3>Frames <small>around your temple picture</small></h3>
  <ul class="shop-list">${FRAMES.map(f => {
    const have = state.temple.frames.includes(f.id), active = state.temple.frame === f.id;
    return `<li class="${active ? 'owned' : ''}"><div><b>${f.name}</b><small>${f.desc}</small></div>
      ${active ? '<span class="owned-tag">In use</span>' : have ? `<button class="btn buy" data-act="use-frame" data-id="${f.id}">Use</button>` : buyBtn('buy-frame', f.id, f.price)}</li>`;
  }).join('')}</ul>`;
}

function shopStreak() {
  const n = P.streak(state), next = P.nextMilestone(state), today = P.dayKey();
  const days = Array.from({ length: 7 }, (_, i) => P.addDays(today, i + 1));
  const b = state.streak.broken;
  return `
  <div class="streak-head"><span class="big-flame">🔥 ${n}</span><span>day streak${next ? `<br><small>${next.days - n} more day${next.days - n === 1 ? '' : 's'} to the ${next.name}: ${milestoneReward(next)}</small>` : ''}</span></div>
  <p class="shop-intro">Each full week of your streak adds 5% to your coins (+5% from day 8, +10% from day 15, up to +50%). Milestones pay out on top: coins, free freezes, or ${MILESTONE_DAY_MULT}× coins for the day. Protecting your streak is cheapest when planned ahead.</p>
  ${b ? `<div class="home-card warn"><p><b>Your ${b.streak}-day streak ended.</b> Repair it: ${REPAIR_PRICE_PER_DAY} coins per missed day.</p>
    <div class="row"><button class="btn primary" data-act="repair" ${state.coins < b.price ? 'disabled' : ''}>${COIN} Repair for ${b.price}</button></div></div>` : ''}
  <h3>Rest days <small>${COIN} ${REST_DAY_PRICE} each · up to 2 a week</small></h3>
  <p class="shop-note">Plan a day off in advance and your streak carries on. Rest is part of training.</p>
  <div class="rest-strip">${days.map(d => {
    const planned = state.streak.covered[d] === 'rest', block = P.restBlocker(state, d, today);
    const date = new Date(d + 'T12:00');
    return `<button class="rest-day ${planned ? 'on' : ''}" data-act="${planned ? 'cancel-rest' : 'plan-rest'}" data-id="${d}" ${!planned && block ? `disabled title="${block}"` : ''}>
      <small>${date.toLocaleDateString(undefined, { weekday: 'short' })}</small><b>${date.getDate()}</b><small>${planned ? 'Rest' : '+'}</small></button>`;
  }).join('')}</div>
  <h3>Streak freezes <small>${COIN} ${FREEZE_PRICE} each</small></h3>
  <div class="shop-row"><p class="shop-note">Covers a day you miss without planning. Used automatically. You have <b>${state.streak.freezes} of ${FREEZE_MAX}</b>.</p>
    ${state.streak.freezes >= FREEZE_MAX ? '<span class="owned-tag">Full</span>' : buyBtn('buy-freeze', 'freeze', FREEZE_PRICE)}</div>
  <h3>Milestones</h3>
  <ul class="milestones">${STREAK_MILESTONES.map(m => `<li class="${n >= m.days ? 'done' : ''}"><span>${m.name}</span><span>${[...(m.coins ? [`+${m.coins}`] : []), ...(m.freeze ? ['❄'] : []), ...(m.double ? [`${MILESTONE_DAY_MULT}× day`] : [])].join(' · ')}</span></li>`).join('')}</ul>`;
}

function shopBets() {
  const recent = state.betLog.length ? `<h3>Recent results</h3><ul class="history bets-log">${betLogHTML(5)}</ul>` : '';
  const todayDone = state.lastBetDay === P.dayKey();
  // Daily bets, then weekly ones; an active bet shows in place of its list.
  const group = (slot, title, note) => {
    const bp = P.betProgress(state, slot);
    if (bp) return `<h3>${title}</h3>${betCard(bp)}`;
    if (slot === 'bet' && todayDone) return `<h3>${title}</h3><div class="home-card"><p><b>You’ve had today’s bet.</b> The next one opens tomorrow.</p></div>`;
    return `<h3>${title} <small>${note}</small></h3><ul class="shop-list">${BETS.filter(b => !b.retired && P.betSlot(b) === slot).map(b => {
      const block = P.betBlocker(state, b.id);
      return `<li><div><b>${b.name}</b><small>${b.desc} Stake ${b.stake}, win ${b.payout}.</small>${block && !block.startsWith('Needs ' + b.stake) ? `<small class="blocked">${block}</small>` : ''}</div>
        <button class="btn buy" data-act="bet" data-id="${b.id}" ${block ? 'disabled' : ''}>Bet ${b.stake}</button></li>`;
    }).join('')}</ul>`;
  };
  return `<p class="shop-intro">Bet on yourself: stake coins, and win more back if you do it in time. Only training after you place a bet counts.</p>
  ${group('bet', 'Daily bets', 'one a day')}
  ${group('weekBet', 'Weekly bets', 'alongside your daily bets')}${recent}`;
}

// Every shop and home-card button goes through here.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const id = b.dataset.id;
  const actions = {
    'upgrade-temple': () => P.upgradeTemple(state) && `${TEMPLE_TIERS[state.temple.tier].name} built!`,
    'buy-avatar': () => { const [kind, item] = id.split(':'); return P.buyAvatarItem(state, kind, item) && `${P.avatarItem(kind, item).name}: yours!`; },
    'wear-avatar': () => { const [kind, item] = id.split(':'); return P.wearAvatarItem(state, kind, item) && ''; },
    'avatar-temple': () => { P.toggleAvatarInTemple(state); return ''; },
    'toggle-item': () => P.toggleTempleItem(state, id) && '',
    'buy-seasonal': () => P.buySeasonalItem(state, id) && 'Bought! It’s in your temple.',
    'buy-item': () => P.buyTempleItem(state, id) && `${TEMPLE_ITEMS.find(i => i.id === id).name} built!`,
    'buy-theme': () => P.buyTheme(state, id) && `${THEMES.find(t => t.id === id).name} theme unlocked!`,
    'use-theme': () => P.useTheme(state, id) && '',
    'buy-frame': () => P.buyFrame(state, id) && `${FRAMES.find(f => f.id === id).name} frame bought!`,
    'use-frame': () => P.useFrame(state, id) && '',
    'buy-freeze': () => P.buyFreeze(state) && 'Streak freeze bought',
    'plan-rest': () => P.planRest(state, id) && 'Rest day planned',
    'cancel-rest': () => P.cancelRest(state, id) && 'Rest day cancelled, coins refunded',
    repair: () => P.repairStreak(state) && 'Streak repaired!',
    'dismiss-repair': () => { P.dismissRepair(state); return ''; },
    'test-mode-off': () => { P.setTestMode(state, false); return 'Test mode off'; },
    bet: () => P.placeBet(state, id) && 'Bet placed. Good luck!',
  };
  const msg = actions[b.dataset.act]?.();
  if (msg === false || msg === undefined) return;
  audio.unlock();
  if (msg) { toast(msg); audio.play(/built|unlocked|repaired/.test(msg) ? 'level' : 'point'); }
  document.documentElement.dataset.scene = state.temple.theme;
  if (document.body.dataset.screen === 'shop') renderShop(); else renderHome();
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-open-hold]');
  if (b) openHold(holdById(b.dataset.openHold));
});

$('#shop-tabs').onclick = e => { const t = e.target.closest('[data-tab]'); if (t) { shopTab = t.dataset.tab; renderShop(); } };

// ---------- Temple scene animation ----------

// Art pixels are this many CSS pixels; canvases keep a fixed height in art pixels
// and grow wider to fill their container.
const ART_PX = 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let sceneTimer = null;

// Your monk as drawn in the temple, or null when it's hidden.
// Your monk in the temple: in the pose of your last hold if you've trained today,
// otherwise sitting in meditation, waiting. Null when it's hidden.
function templeMonk() {
  if (!state.avatar.inTemple) return null;
  const last = state.history.at(-1), today = !!state.days[P.dayKey()];
  return { look: P.avatarLook(state), holdId: today && last ? last.holdId : 'zuochan' };
}

// The full-screen temple, in whole art pixels. Upright, it's zoomed to about 125 art
// pixels wide (the far edges of a wide temple crop off) with tall sky and courtyard;
// on its side, sized to the picture's usual 104 rows of height.
function drawFullTemple() {
  const upright = innerHeight > innerWidth;
  const s = upright ? Math.max(2, Math.round(innerWidth / 125)) : Math.max(2, Math.floor(Math.min(innerWidth / 170, innerHeight / 104)));
  const cv = $('#temple-full');
  const w = Math.ceil(innerWidth / s), h = Math.ceil(innerHeight / s);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  drawTemple(cv, state, reduceMotion ? 3.3 : performance.now() / 1000, state.temple.theme, templeMonk(), Math.max(22, Math.round(h * 0.28)));
}

// What the ambient sound can hear in the temple you've built.
const ambientScene = () => {
  const shown = P.shownItems(state);
  return { water: shown.includes('pond') || shown.includes('waterfall'), wind: shown.includes('bamboo') || shown.includes('mist'), bell: shown.includes('bell') };
};

function renderSoundButton() {
  const on = !!state.settings.ambient;
  $('#tv-sound').textContent = on ? '♪ Sound on' : '♪ Sound off';
  $('#tv-sound').setAttribute('aria-pressed', on);
}

function openTempleView() {
  show('temple-view');
  renderSoundButton();
  if (state.settings.ambient) { audio.unlock(); audio.startAmbient(ambientScene()); }
}

$('#tv-sound').onclick = () => {
  state.settings.ambient = !state.settings.ambient;
  P.save(state);
  renderSoundButton();
  audio.unlock();
  if (state.settings.ambient) audio.startAmbient(ambientScene()); else audio.stopAmbient();
};
$('#tv-shop').onclick = () => openShop('temple');
// Quiet when you switch away from the app; back when you return to the temple.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') audio.stopAmbient();
  else if (document.body.dataset.screen === 'temple-view' && state.settings.ambient) audio.startAmbient(ambientScene());
});

function drawScenes(resize = false) {
  const screen = document.body.dataset.screen;
  if (screen === 'temple-view') return drawFullTemple();
  const cv = screen === 'home' ? $('#temple-canvas') : screen === 'shop' && !$('#shop-preview').hidden ? $('#shop-canvas') : null;
  if (!cv) return;
  if (resize || !cv.dataset.sized) {
    const w = Math.max(150, Math.round(cv.parentElement.clientWidth / ART_PX));
    if (cv.width !== w) cv.width = w;
    cv.height = SCENE_H;
    cv.dataset.sized = '1';
  }
  drawTemple(cv, state, reduceMotion ? 3.3 : performance.now() / 1000, state.temple.theme, templeMonk());
}

function animateScenes() {
  clearInterval(sceneTimer);
  if (reduceMotion) return;
  sceneTimer = setInterval(() => { if (document.visibilityState === 'visible') drawScenes(); }, 100);
}
window.addEventListener('resize', () => drawScenes(true));

// ---------- Wiring ----------

$('#temple-banner').onclick = openTempleView;
$('#wallet-chip').onclick = () => openShop('temple');
$('#streak-strip').onclick = () => openShop('streak');

$('#shuffle').onclick = () => { hero = P.pickHold(state, hero.id); renderHero(); };
$('#back-daily').onclick = () => { hero = P.dailyHold(state); renderHero(); };
$('#hero-start').onclick = () => {
  const hs = P.holdState(state, hero.id);
  startSession(hero, hs.level, hero.camera && state.settings.camera);
};
$('#hero-fig').onclick = () => openHold(hero);
$('#grid').onclick = e => { const c = e.target.closest('[data-hold]'); if (c) openHold(holdById(c.dataset.hold)); };
$('#hs-levels').onclick = e => { const b = e.target.closest('[data-level]'); if (b && !b.disabled) { sheetLevel = +b.dataset.level; renderSheetLevel(); } };
$('#hold-sheet').addEventListener('close', () => {
  if ($('#hold-sheet').returnValue === 'start') {
    const hs = P.holdState(state, sheetHold.id);
    const test = !state.testMode && sheetLevel > hs.level;  // in test mode every level is simply open
    // Tests always use the camera when the hold supports it.
    startSession(sheetHold, sheetLevel, sheetHold.camera && (test || $('#hs-cam').checked), { test });
  }
  $('#hold-sheet').returnValue = '';
});
$('#settings-btn').onclick = openSettings;

// Welcome: once on first use, and whenever asked for from Settings.
// Opening a dialog focuses its first button, which can scroll it; start at the top.
function openWelcome() { $('#welcome').showModal(); $('#welcome').scrollTop = 0; }
$('#welcome').addEventListener('close', () => { if (!state.welcomed) { state.welcomed = true; P.save(state); } });
$('#how-btn').onclick = () => { $('#settings').close(); openWelcome(); };
$('#rank-btn').onclick = renderProgress;
$('#progress-btn').onclick = renderProgress;
$('#end-btn').onclick = () => endSession();
$('#s-retry').onclick = () => { const { hold, level } = run ?? lastRun; startSession(hold, level, true); };
$('#s-honour').onclick = () => { const { hold, level } = run ?? lastRun; startSession(hold, level, false); };
$('#sum-again').onclick = () => {
  const { hold, level, camera, test } = lastRun;
  // After a passed test the level is yours, so "go again" is an ordinary session.
  startSession(hold, level, camera, { test: test && level > P.holdState(state, hold.id).level });
};
document.addEventListener('click', e => {
  if (e.target.closest('[data-home]')) { stopRun(); show('home'); renderHome(); }
});

// On opening: spend freezes or offer a repair, settle an expired bet, then show what happened.
P.protectStreak(state);
const settled = P.settleBets(state, P.dayKey(), { notify: false });
show('home');
renderHome();
if (!state.welcomed) openWelcome();
flushNotices();
settled.forEach(celebrateBet);
animateScenes();

// Start fetching the pose model in the background so the first session starts quickly.
if (!DEMO && state.settings.camera) {
  const idle = window.requestIdleCallback ?? (fn => setTimeout(fn, 1500));
  idle(() => loadLandmarker(state.settings.model).catch(() => {}));
}

if ('serviceWorker' in navigator && !DEMO && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
