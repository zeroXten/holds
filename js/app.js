import { HOLDS, holdById, AREAS, STYLES, AREA_WORDS, mainArea } from './holds.js';
import {
  coinRateFor, DAILY_MULT, BONUS_TIERS, TEMPLE_ITEMS, THEMES, BETS, FREEZE_PRICE, FREEZE_MAX,
  REST_DAY_PRICE, REPAIR_PRICE_PER_DAY, STREAK_MILESTONES, TEST_FORM, testPrice,
} from './economy.js';
import { drawTemple, SCENE_H } from './temple.js';
import { figureSVG } from './figure.js';
import * as P from './progress.js';
import { STRICTNESS } from './session.js';
import { createSession } from './flow.js';
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
let hero = null;       // the hold in the big card: the hold of the day, or a shuffled pick

const COIN = '<svg viewBox="0 0 24 24" class="ico coin"><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.5 9.5h5v5h-5z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>';
// "Soft · Arms & shoulders · Balance": style, then areas from most to least worked.
const areaTags = hold => [STYLES[hold.style], ...Object.entries(hold.areas).sort((a, b) => b[1] - a[1]).map(([a]) => AREAS[a])];
const coinRate = (hold, level) => `${coinRateFor(hold, level)}× coins${hold.style === 'soft' ? ' (soft)' : ''}`;

const fmt = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtLong = s => s < 60 ? `${Math.round(s)}s`
  : s < 3600 ? `${Math.floor(s / 60)}m${Math.round(s % 60) ? ` ${String(Math.round(s % 60)).padStart(2, '0')}s` : ''}`
  : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
// One-sided holds split the target between the sides.
const targetText = (hold, t) => hold.flow ? `${t} slow cycles` : hold.sides ? `${fmtLong(t / 2)} each side` : `${fmtLong(t)} target`;
// A best or a target in the hold's own unit: seconds, or cycles for flowing holds.
const amount = (hold, n) => (hold.flow ? `${n} cycle${n === 1 ? '' : 's'}` : fmtLong(n));
const videoUrl = hold => `https://www.youtube.com/results?search_query=${encodeURIComponent(hold.video)}`;
const viewHint = hold => hold.hint ?? (hold.view === 'front' ? 'Face the camera' : 'Stand side-on to the camera');

function show(id) {
  $$('.screen').forEach(s => { s.hidden = s.id !== id; });
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
  if (id === 'home' || id === 'shop') requestAnimationFrame(() => drawScenes(true));
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

function pips(hs) {
  if (hs.mastered) return '<span class="pips mastered">Mastered</span>';
  return `<span class="pips" title="${hs.qualDays.length} of ${P.QUALIFY_DAYS} days to level up">${
    Array.from({ length: P.QUALIFY_DAYS }, (_, i) => `<i class="${i < hs.qualDays.length ? 'on' : ''}"></i>`).join('')}</span>`;
}

// ---------- Home ----------

function renderHome() {
  const r = P.rankFor(state.lifetime);
  $('#sash').style.setProperty('--sash', r.color);
  $('#rank-name').textContent = r.name;
  $('#xp-fill').style.width = `${Math.round(r.progress * 100)}%`;
  $('#xp-text').textContent = r.next ? `${state.lifetime.toLocaleString()} / ${r.next.coins.toLocaleString()} coins earned` : `${state.lifetime.toLocaleString()} coins earned`;
  $('#streak').textContent = P.streak(state);
  $('#freezes').textContent = state.streak.freezes ? `❄${state.streak.freezes}` : '';
  $('#wallet').textContent = state.coins.toLocaleString();
  document.documentElement.dataset.scene = state.temple.theme;
  renderHomeCards();
  drawScenes(true);
  $('#intro').hidden = state.history.length > 0;
  const daily = P.dailyHold(state);
  if (!hero || !P.isUnlocked(state, hero.id)) hero = daily;
  renderHero();
  renderGrid();
}

function renderHero() {
  const hs = P.holdState(state, hero.id);
  const daily = P.isDaily(state, hero.id);
  $('#hero').classList.toggle('daily', daily);
  $('#hero-kicker').innerHTML = daily ? `Hold of the day <span class="mult">${DAILY_MULT}× coins</span>` : 'Random pick';
  $('#back-daily').hidden = daily;
  const lv = hero.levels[hs.level - 1];
  $('#hero-fig').innerHTML = figureSVG(hero.figure(hs.level));
  $('#hero-name').textContent = hero.name;
  $('#hero-native').textContent = hero.native;
  $('#hero-level').innerHTML = `Level ${hs.level} · ${lv.name} ${pips(hs)}`;
  $('#hero-desc').textContent = lv.desc;
  $('#hero-video').href = videoUrl(hero);
  const best = hs.best[hs.level];
  $('#hero-meta').innerHTML = `
    <span class="tag strong">${targetText(hero, lv.target)}</span>
    <span class="tag">${coinRate(hero, hs.level)}</span>
    <span class="tag">${hero.camera ? viewHint(hero) : 'Honour system'}</span>
    ${best ? `<span class="tag">Best ${amount(hero, best)}</span>` : ''}`;
}

function renderGrid() {
  const price = P.unlockPrice(state);
  const over = P.overworked(state);
  $('#grid').innerHTML = HOLDS.map(h => {
    const tired = over && P.leansOn(h, over.area);
    const kind = `<span class="card-kind ${h.style}">${STYLES[h.style]} · ${AREAS[mainArea(h)]}</span>`;
    const hs = P.holdState(state, h.id);
    const best = hs.best[hs.level];
    if (!P.isUnlocked(state, h.id)) {
      return `<button class="card locked ${state.coins >= price ? 'affordable' : ''}" data-hold="${h.id}">
        ${figureSVG(h.figure(1))}
        <span class="card-name">${h.name}</span>
        ${kind}
        <span class="card-sub price">${LOCK} ${COIN} ${price}</span>
      </button>`;
    }
    return `<button class="card ${P.isDaily(state, h.id) ? 'daily' : ''} ${tired ? 'tired' : ''}" data-hold="${h.id}">
      ${P.isDaily(state, h.id) ? `<span class="card-flag">${DAILY_MULT}× today</span>` : tired ? `<span class="card-flag rest">${over.name} resting</span>` : ''}
      ${figureSVG(h.figure(hs.level))}
      <span class="card-name">${h.name}</span>
      ${kind}
      <span class="card-sub">Lv ${hs.level} · ${h.flow ? `${h.levels[hs.level - 1].target} cycles` : h.sides ? `${fmtLong(h.levels[hs.level - 1].target / 2)} ×2` : fmtLong(h.levels[hs.level - 1].target)}${best ? ` · best ${amount(h, best)}` : ''}</span>
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
  $('#hs-areas').innerHTML = areaTags(hold).map((t, i) => `<span class="tag ${i === 0 ? `style-${hold.style}` : ''}">${t}</span>`).join('');
  $('#hs-video').href = videoUrl(hold);
  $('#hs-cam').checked = state.settings.camera;
  renderSheetLevel();
  $('#hold-sheet').showModal();
}

function renderSheetLevel() {
  const hold = sheetHold, hs = P.holdState(state, hold.id);
  // Locked holds show what they cost instead of the level picker and Start.
  const locked = !P.isUnlocked(state, hold.id);
  $('#hs-unlock').hidden = !locked;
  $('#hs-levels').hidden = locked;
  $('#hs-start').hidden = locked;
  $('#hs-cam-row').hidden = locked || !hold.camera;
  if (locked) {
    const price = P.unlockPrice(state), short = price - state.coins;
    $('#hs-unlock-msg').innerHTML = short > 0
      ? `Unlock this hold for <b>${price} coins</b>. You have ${state.coins}, so ${short} more to go.`
      : `Unlock this hold for <b>${price} coins</b>. You have ${state.coins}.`;
    $('#hs-buy').innerHTML = `${COIN} Unlock for ${price}`;
    $('#hs-buy').disabled = short > 0;
    sheetLevel = 1;
  }
  const unlocked = hs.mastered ? 4 : hs.level;
  // The level after yours can be taken as a test; the rest stay locked.
  const testLevel = !locked && !hs.mastered && hs.level < 4 ? hs.level + 1 : null;
  $('#hs-levels').innerHTML = hold.levels.map((l, i) => {
    const n = i + 1, closed = n > unlocked && n !== testLevel;
    return `<button type="button" role="tab" class="lv ${n === sheetLevel ? 'on' : ''} ${n === testLevel ? 'test' : ''}" data-level="${n}" ${closed ? 'disabled' : ''} aria-selected="${n === sheetLevel}">
      ${n > unlocked ? LOCK : n}</button>`;
  }).join('');
  const testing = sheetLevel === testLevel;
  $('#hs-test-msg').hidden = !testing;
  $('#hs-start').textContent = testing ? 'Take the level test' : 'Start';
  if (testing) {
    const price = testPrice(sheetLevel), short = price > state.coins;
    $('#hs-test-msg').innerHTML = `<b>Level test:</b> reach the target${hold.camera ? ` with ${TEST_FORM}+ average form (camera on)` : ''} to unlock level ${sheetLevel} now. Passing is free; not passing costs <b>${price} coins</b>.${short ? ` You need ${price} coins to take it.` : ''}`;
    $('#hs-start').disabled = short;
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
    ${P.isDaily(state, hold.id) ? `<span class="tag strong">Hold of the day: ${DAILY_MULT}× coins</span>` : ''}
    ${hold.camera ? `<span class="tag">${viewHint(hold)}</span>` : '<span class="tag">Honour system</span>'}
    ${best ? `<span class="tag">Best ${amount(hold, best)}</span>` : ''}
    ${!locked && sheetLevel === hs.level && !hs.mastered ? pips(hs) : ''}`;
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
  run.session = createSession({
    hold, level, camera: useCamera, strictness: state.settings.strictness,
    daily: P.isDaily(state, hold.id), now: source ? source.now() : clock(),
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
  const html = show ? [...new Map(v.results.map(r => [r.label, r])).values()].map(r =>
    `<span class="chk ${r.s >= 0.85 ? 'ok' : r.s >= 0.5 ? 'meh' : 'bad'}">${r.s >= 0.85 ? '✓' : '✗'} ${r.label}</span>`).join('') : '';
  const el = $('#s-checks');
  if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
}

function updateHud(v) {
  renderChecks(v);
  if (v.flow) return updateFlowHud(v);
  const s = run.session;
  // One-sided holds show the current side's time against that side's target.
  $('#s-time').textContent = fmt(v.sideHeld);
  $('#s-target').textContent = ` / ${fmt(v.sideTarget)}`;
  $('#s-level').textContent = `Level ${run.level} · ${run.hold.levels[run.level - 1].name}${v.sides === 2 ? ` · Side ${v.sideIndex + 1} of 2` : ''}${v.daily ? ` · ${DAILY_MULT}× today` : ''}${run.test ? ' · Level test' : ''}`;
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
      $('#s-cue').textContent = run.hold.landscape && innerHeight > innerWidth
        ? 'Tip: turn your phone sideways (landscape) so you can stand closer.'
        : `${viewHint(run.hold)}, about 2–3 m from the phone.`;
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

// The step of the movement you're on, from where your hands are.
function flowStep(v) {
  if (v.phase === 'down') return 'Let go and float your arms down the sides';
  if (v.inPose && v.hands < -0.3) return v.topTime < v.dwell ? 'Stretch up through the palms… hold' : 'Stretch up';
  if (v.worst && v.phaseTime > 6) return v.worst.cue;
  return v.hands > 0.15 ? 'Lift your hands up the front of your body' : 'Turn the palms over and push up to the sky';
}

// Session screen for flowing holds: cycles counted instead of a timer.
function updateFlowHud(v) {
  $('#s-time').textContent = v.count;
  $('#s-target').textContent = ` / ${v.goal}`;
  $('#s-level').textContent = `Level ${run.level} · ${run.hold.levels[run.level - 1].name} · slow cycles${v.daily ? ` · ${DAILY_MULT}× today` : ''}${run.test ? ' · Level test' : ''}`;
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
  $('#s-score').textContent = run.camera ? (v.phase === 'up' && v.state === 'flowing' ? `Reach up ${v.score}` : `Hands low ${v.score}`) : '';
  const done = $('#s-done');
  if (done) done.textContent = 'Done';
  const secs = Math.floor(v.cycleTime);
  switch (v.state) {
    case 'framing':
      setStatus('wait', 'Step back so your whole body is in view');
      $('#s-cue').textContent = `${viewHint(run.hold)}, about 2–3 m from the phone.`;
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
      else setStatus(v.reached ? 'bonus' : 'good', v.phase === 'up' ? (v.reached ? `Rise · bonus ×${v.tier.mult}` : 'Rise') : (v.reached ? `Lower · bonus ×${v.tier.mult}` : 'Lower'));
      $('#s-cue').textContent = v.tooFast
        ? `At least ${v.minCycle} seconds for each cycle`
        : `${flowStep(v)} · ${secs}s${secs < v.minCycle ? ` of at least ${v.minCycle}s` : ''}`;
      break;
  }
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
  // Parts a check covers show how that check is going; the rest go green whenever
  // you're in a good position, so all green means all good.
  const active = v.state !== 'framing';
  const color = s => !active ? COLORS.idle : s === undefined ? (v.inPose ? COLORS.good : COLORS.idle)
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
  const { session, hold, level, camera, test } = run;
  const result = { ...session.result, test };
  stopRun();
  lastRun = { hold, level, camera, test };
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
    ...(o.streakMult > 1 ? [`${o.streak}-day streak +${Math.round((o.streakMult - 1) * 100)}%`] : []),
  ];
  // What to do with the coins: the next unlock, or just the wallet.
  const wallet = o.nextUnlock
    ? (o.wallet >= o.nextUnlock ? `You have ${o.wallet} coins: enough to unlock a new hold!` : `You have ${o.wallet} coins. ${o.nextUnlock - o.wallet} more to unlock a new hold.`)
    : `You have ${o.wallet} coins.`;
  const betLine = o.bet?.result === 'won' ? `Plus ${o.bet.def.payout} coins from your bet.<br>` : '';
  $('#sum-breakdown').innerHTML = `${notes.length ? `Includes ${notes.join(' and ')}.<br>` : ''}${betLine}${wallet}`;
  // Level test, bet and streak milestone results.
  const extra = [];
  if (o.test) {
    extra.push(o.test.passed
      ? `<div class="banner good">Level test passed! Level ${level} is unlocked.</div>`
      : `<div class="banner bad">Level test not passed: −${o.test.price} coins. You need the full target${r.camera ? ` with ${TEST_FORM}+ form` : ''}.</div>`);
  }
  if (o.bet) extra.push(o.bet.result === 'won' ? `<div class="banner good">Bet won: ${o.bet.def.name}! +${o.bet.def.payout} coins.</div>` : `<div class="banner bad">Bet lost: ${o.bet.def.name}.</div>`);
  for (const m of o.milestones) extra.push(`<div class="banner gold">🔥 ${m.name}! +${m.coins} coins${m.freeze ? ' and a free streak freeze' : ''}.</div>`);
  $('#sum-extra').innerHTML = extra.join('');
  if (o.test?.passed) setTimeout(() => audio.play('level'), 300);
  // The big moments get the full-screen treatment, once the summary has appeared.
  setTimeout(() => { if (o.bet) celebrateBet(o.bet); o.milestones.forEach(celebrateMilestone); }, 900);
  $('#sum-stats').innerHTML = `
    ${r.unit === 'cycles'
      ? `<div><b>${r.count}</b><small>of ${r.goal} slow cycles</small></div>`
      : `<div><b>${fmtLong(r.held)}</b><small>held of ${fmtLong(r.target)}${r.sides ? `<br>${r.sides.map(t => fmtLong(t)).join(' + ')}` : ''}</small></div>`}
    ${r.camera ? `<div><b>${Math.round(r.avgForm)}</b><small>average form</small></div>` : '<div><b>—</b><small>honour mode</small></div>'}
    <div><b>${o.pb ? 'New!' : o.prevBest ? amount(hold, o.prevBest) : '—'}</b><small>${o.pb ? 'personal best' : 'best'}</small></div>`;

  const hs = P.holdState(state, hold.id);
  let lvl = '';
  if (o.levelUp) lvl = `<div class="banner">Next up: <b>${hold.levels[o.newLevel - 1].name}</b>. ${targetText(hold, hold.levels[o.newLevel - 1].target)}, ${coinRate(hold, o.newLevel)}.</div>`;
  else if (o.mastered) lvl = '<div class="banner">You’ve completed every level of this stance.</div>';
  else if (level === hs.level && !hs.mastered) {
    const need = P.QUALIFY_DAYS - hs.qualDays.length;
    lvl = `<div class="lvl-progress">${pips(hs)}<span>${o.qualified
      ? `Day counted! ${need} more day${need === 1 ? '' : 's'} to unlock level ${level + 1 > 4 ? 'mastery' : level + 1}.`
      : !o.reached ? `Reach ${r.unit === 'cycles' ? `${r.goal} slow cycles` : fmtLong(r.target)} to count today towards level ${Math.min(level + 1, 4)}.`
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
  const r = P.rankFor(state.lifetime), t = P.totals(state);
  $('#rank-card').innerHTML = `
    <span class="sash big" style="--sash:${r.color}"></span>
    <div><h2>${r.name}</h2><span class="xpbar"><i style="width:${Math.round(r.progress * 100)}%"></i></span>
    <small>${state.lifetime.toLocaleString()} coins earned${r.next ? ` · ${(r.next.coins - state.lifetime).toLocaleString()} to ${r.next.name}` : ''}</small></div>`;
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

function openSettings() {
  renderInstall();
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
    if (!P.isBackup(data)) throw new Error('Not a Shaolin Holds backup');
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
  if (r.result === 'won') {
    celebrate({
      win: true, kicker: 'Bet won', title: r.def.name, coins: r.def.payout,
      msg: `You staked ${r.def.stake} and won ${r.def.payout}. Paid into your wallet.`,
      say: `Bet won! Plus ${r.def.payout} coins`,
    });
  } else {
    celebrate({
      win: false, kicker: 'Bet missed', title: r.def.name,
      msg: `Not this time: you got to ${r.progress.toLowerCase()}. The ${r.def.stake}-coin stake is gone, but the training still counts. Fancy another go?`,
      ok: 'Not now', alt: { label: 'New bet', go: () => openShop('bets') },
    });
  }
}

function celebrateMilestone(m) {
  celebrate({
    win: true, kicker: 'Streak milestone', title: `🔥 ${m.name}!`, coins: m.coins,
    msg: m.freeze ? 'Bonus coins and a free streak freeze. Keep the fire going.' : 'Bonus coins for showing up, day after day.',
    say: `${m.name}! Plus ${m.coins} coins`,
  });
}

// ---------- Home cards: broken streak, active bet ----------

function renderHomeCards() {
  const cards = [];
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
  const bp = P.betProgress(state);
  if (bp) cards.push(betCard(bp));
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
  $('#shop-body').innerHTML = { temple: shopTemple, themes: shopThemes, streak: shopStreak, bets: shopBets }[shopTab]();
  if (shopTab === 'themes') {
    $$('#shop-body canvas[data-theme]').forEach(cv => drawTemple(cv, state, 3.3, cv.dataset.theme));
  }
  drawScenes(true);
}

const buyBtn = (act, id, price, label = `${COIN} ${price}`) =>
  `<button class="btn buy" data-act="${act}" data-id="${id}" ${state.coins < price ? 'disabled' : ''}>${label}</button>`;

function shopTemple() {
  const owned = state.temple.owned.length;
  return `<p class="shop-intro">Build up your temple. Each feature you buy appears in the scene on your home screen. (${owned} of ${TEMPLE_ITEMS.length})</p>
  <ul class="shop-list">${[...TEMPLE_ITEMS].sort((a, b) => a.price - b.price).map(i => `
    <li class="${P.owns(state, i.id) ? 'owned' : ''}"><div><b>${i.name}</b><small>${i.desc}</small></div>
      ${P.owns(state, i.id) ? '<span class="owned-tag">Built</span>' : buyBtn('buy-item', i.id, i.price)}</li>`).join('')}
  </ul>`;
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
  }).join('')}</div>`;
}

function shopStreak() {
  const n = P.streak(state), next = P.nextMilestone(state), today = P.dayKey();
  const days = Array.from({ length: 7 }, (_, i) => P.addDays(today, i + 1));
  const b = state.streak.broken;
  return `
  <div class="streak-head"><span class="big-flame">🔥 ${n}</span><span>day streak${next ? `<br><small>${next.days - n} more day${next.days - n === 1 ? '' : 's'} to the ${next.name}: +${next.coins} coins${next.freeze ? ' and a free freeze' : ''}</small>` : ''}</span></div>
  <p class="shop-intro">Every streak day adds 5% to your coins (up to +50%), and milestones pay out on top. Protecting your streak is cheapest when planned ahead.</p>
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
  <ul class="milestones">${STREAK_MILESTONES.map(m => `<li class="${n >= m.days ? 'done' : ''}"><span>${m.name}</span><span>+${m.coins}${m.freeze ? ' + ❄' : ''}</span></li>`).join('')}</ul>`;
}

function shopBets() {
  const bp = P.betProgress(state);
  const recent = state.betLog.length ? `<h3>Recent results</h3><ul class="history bets-log">${betLogHTML(5)}</ul>` : '';
  if (bp) return `<p class="shop-intro">Your coins are on the line. Finish this bet before placing another.</p>${betCard(bp)}${recent}`;
  return `<p class="shop-intro">Bet on yourself: stake coins, and win more back if you do it in time. Only training after you place the bet counts.</p>
  <ul class="shop-list">${BETS.map(b => {
    const block = P.betBlocker(state, b.id);
    return `<li><div><b>${b.name}</b><small>${b.desc} Stake ${b.stake}, win ${b.payout}.</small>${block && !block.startsWith('Needs ' + b.stake) ? `<small class="blocked">${block}</small>` : ''}</div>
      <button class="btn buy" data-act="bet" data-id="${b.id}" ${block ? 'disabled' : ''}>Bet ${b.stake}</button></li>`;
  }).join('')}</ul>${recent}`;
}

// Every shop and home-card button goes through here.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const id = b.dataset.id;
  const actions = {
    'buy-item': () => P.buyTempleItem(state, id) && `${TEMPLE_ITEMS.find(i => i.id === id).name} built!`,
    'buy-theme': () => P.buyTheme(state, id) && `${THEMES.find(t => t.id === id).name} theme unlocked!`,
    'use-theme': () => P.useTheme(state, id) && '',
    'buy-freeze': () => P.buyFreeze(state) && 'Streak freeze bought',
    'plan-rest': () => P.planRest(state, id) && 'Rest day planned',
    'cancel-rest': () => P.cancelRest(state, id) && 'Rest day cancelled, coins refunded',
    repair: () => P.repairStreak(state) && 'Streak repaired!',
    'dismiss-repair': () => { P.dismissRepair(state); return ''; },
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

function drawScenes(resize = false) {
  const screen = document.body.dataset.screen;
  const cv = screen === 'home' ? $('#temple-canvas') : screen === 'shop' && !$('#shop-preview').hidden ? $('#shop-canvas') : null;
  if (!cv) return;
  if (resize || !cv.dataset.sized) {
    const w = Math.max(150, Math.round(cv.parentElement.clientWidth / ART_PX));
    if (cv.width !== w) cv.width = w;
    cv.height = SCENE_H;
    cv.dataset.sized = '1';
  }
  drawTemple(cv, state, reduceMotion ? 3.3 : performance.now() / 1000);
}

function animateScenes() {
  clearInterval(sceneTimer);
  if (reduceMotion) return;
  sceneTimer = setInterval(() => { if (document.visibilityState === 'visible') drawScenes(); }, 100);
}
window.addEventListener('resize', () => drawScenes(true));

// ---------- Wiring ----------

$('#temple-banner').onclick = () => openShop('temple');
$('#wallet-chip').onclick = () => openShop('temple');
$('#streak-chip').onclick = () => openShop('streak');

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
    const test = sheetLevel > hs.level;
    // Tests always use the camera when the hold supports it.
    startSession(sheetHold, sheetLevel, sheetHold.camera && (test || $('#hs-cam').checked), { test });
  }
  $('#hold-sheet').returnValue = '';
});
$('#settings-btn').onclick = openSettings;
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
const settled = P.settleBet(state, P.dayKey(), { notify: false });
show('home');
renderHome();
flushNotices();
if (settled) celebrateBet(settled);
animateScenes();

// Start fetching the pose model in the background so the first session starts quickly.
if (!DEMO && state.settings.camera) {
  const idle = window.requestIdleCallback ?? (fn => setTimeout(fn, 1500));
  idle(() => loadLandmarker(state.settings.model).catch(() => {}));
}

if ('serviceWorker' in navigator && !DEMO && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
