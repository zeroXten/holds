// One hold session as a state machine. Fed a frame of landmarks each tick (or
// nothing, in honour mode); returns everything the session screen shows.
//
// Camera states: framing → ready → holding ⇄ broken (→ switch for one-sided holds) → done
// Honour states: countdown → holding (→ switch) → done
//
// One-sided holds split the level's target between the two sides. Each side has
// its own target and bonus time; side one switches over once you drop out of
// position (or tap Switch in honour mode).

import { makeBody, scorePose, visible } from './scoring.js';
import { requiredFor } from './holds.js';
import { COIN_SECONDS, coinRateFor, TARGET_BONUS, DAILY_MULT, HONOUR_FORM, formFactor, bonusTier } from './economy.js';
import { play, say } from './audio.js';

export const STRICTNESS = {
  relaxed: { start: 55, hold: 42 },
  normal: { start: 65, hold: 50 },
  strict: { start: 75, hold: 60 },
};

const GRACE = 1.5;        // seconds out of form that still count
const GIVE_UP = 8;        // seconds out of form before the session ends
const GIVE_UP_AFTER = 3.5; // ...once the target has been reached
const SWITCH_TIMEOUT = 15; // seconds allowed to change sides

export class Session {
  constructor({ hold, level, camera, strictness = 'normal', daily = false, now }) {
    Object.assign(this, { hold, level, camera, daily, now0: now, last: now });
    this.target = hold.levels[level - 1].target;
    // Coins per second before form and bonus-time multipliers.
    this.mult = coinRateFor(hold, level) * (daily ? DAILY_MULT : 1);
    this.thr = STRICTNESS[strictness];
    this.required = requiredFor(hold, level);
    this.state = camera ? 'framing' : 'countdown';
    this.stateTime = 0;
    this.held = 0;
    this.coins = 0;
    this.score = 0;
    this.formTime = 0;
    this.formSum = 0;
    this.outTime = 0;
    this.seenTime = 0;
    this.goodTime = 0;
    this.reached = false;
    this.sides = hold.sides ? 2 : 1;
    this.sideTarget = this.target / this.sides;
    this.sideIndex = 0;
    this.sideHeld = new Array(this.sides).fill(0);
    this.sideReached = new Array(this.sides).fill(false);
    this.worst = null;
    this.worstTime = 0;
    this.milestones = new Set();
    this.result = null;
    this.side = null;
  }

  go(state) { this.state = state; this.stateTime = 0; }

  tick(now, frame) {
    // Capped so a pause (switching apps) doesn't count, but loose enough that slow phones
    // at a few frames per second still get full time.
    const dt = Math.min(Math.max(now - this.last, 0), 1);
    this.last = now;
    this.stateTime += dt;
    if (this.state === 'done') return this.view();
    if (this.camera) this.tickCamera(dt, frame); else this.tickHonour(dt);
    return this.view();
  }

  // --- camera mode ---
  tickCamera(dt, frame) {
    const lm = frame?.landmarks;
    const seen = !!lm && visible(lm, this.required);
    let results = null;
    if (seen) {
      const r = scorePose(this.hold, this.level, makeBody(lm, frame.width, frame.height));
      const k = 1 - Math.exp(-dt / 0.25);
      this.score += (r.score - this.score) * k;
      results = r.results;
      this.side = r.side;
      this.seenTime += dt;
    } else {
      this.score += (0 - this.score) * (1 - Math.exp(-dt / 0.4));
      this.seenTime = 0;
    }
    this.results = results;
    this.seen = seen;
    const inForm = seen && this.score >= this.thr.hold;
    const good = seen && this.score >= this.thr.start;
    this.trackWorst(dt, results);

    switch (this.state) {
      case 'framing':
        if (this.seenTime > 0.7) { this.go('ready'); say(`Get into ${this.hold.name.toLowerCase()}`, { priority: true }); }
        break;
      case 'ready':
        this.goodTime = good ? this.goodTime + dt : 0;
        if (!seen && this.stateTime > 1 && this.seenTime === 0) this.go('framing');
        else if (this.goodTime > 0.8) { this.go('holding'); play('go'); say('Hold', { priority: true }); }
        else this.coach(4500);
        break;
      case 'holding':
        if (inForm) {
          this.outTime = 0;
          this.accrue(dt, formFactor(this.score));
          this.coach(6000);
        } else {
          this.outTime += dt;
          if (this.outTime < GRACE) this.accrue(dt, 0);
          else if (this.onFirstSide() && this.sideReached[0]) this.startSwitch();
          else {
            this.go('broken');
            play('slip');
            say(seen ? (this.worst?.cue ?? 'Back into position') : 'I can’t see you', { priority: true });
          }
        }
        this.milestoneChecks();
        break;
      case 'broken':
        this.outTime += dt;
        if (inForm) { this.go('holding'); this.outTime = 0; say('Good', { minGap: 4000 }); }
        else if (this.outTime > (this.sideReached[this.sideIndex] ? GIVE_UP_AFTER : GIVE_UP)) {
          // Giving up on side one still moves on to side two.
          if (this.onFirstSide()) this.startSwitch();
          else this.finish(this.reached ? 'complete' : 'broke');
        }
        else this.coach(4000);
        break;
      case 'switch':
        this.goodTime = inForm ? this.goodTime + dt : 0;
        if (this.goodTime > 1 && (this.side !== this.sideAtSwitch || this.stateTime > 3)) this.resumeSide();
        else if (this.stateTime > SWITCH_TIMEOUT) this.finish(this.reached ? 'complete' : 'broke');
        break;
    }
  }

  onFirstSide() { return this.sides === 2 && this.sideIndex === 0; }

  startSwitch() {
    this.sideAtSwitch = this.side;
    this.goodTime = 0;
    this.outTime = 0;
    this.go('switch');
    play('tick');
    say('Switch sides', { priority: true });
  }

  resumeSide() {
    this.sideIndex = 1;
    this.outTime = 0;
    this.go('holding');
    play('go');
    say('Side two. Hold', { priority: true });
  }

  // Honour mode: the Switch button.
  switchNow() {
    if (this.onFirstSide() && (this.state === 'holding' || this.state === 'paused')) this.startSwitch();
  }

  accrue(dt, factor) {
    this.held += dt;
    const i = this.sideIndex;
    this.sideHeld[i] += dt;
    this.coins += (dt / COIN_SECONDS) * this.mult * factor * bonusTier(this.sideHeld[i], this.sideTarget).mult;
    if (factor > 0) { this.formTime += dt; this.formSum += dt * (this.camera ? this.score : 100); }
  }

  trackWorst(dt, results) {
    const w = results?.filter(r => r.cue && r.s < 0.75).sort((a, b) => a.s * a.weight - b.s * b.weight)[0] ?? null;
    if (w && this.worst && w.id === this.worst.id) this.worstTime += dt;
    else this.worstTime = 0;
    this.worst = w;
  }

  coach(gap) {
    if (this.worst && this.worstTime > 1.2) say(this.worst.cue, { minGap: gap });
  }

  // Spoken and sound milestones for the current side.
  milestoneChecks() {
    const i = this.sideIndex;
    const once = (key, fn) => { key += ':' + i; if (!this.milestones.has(key)) { this.milestones.add(key); fn(); } };
    const t = this.sideTarget, h = this.sideHeld[i];
    if (this.sides === 1 && t >= 40 && h >= t / 2) once('half', () => say('Halfway'));
    if (t - h <= 10 && t >= 30) once('ten', () => say('Ten seconds'));
    for (const n of [3, 2, 1]) if (t - h <= n) once('c' + n, () => play('tick'));
    if (!this.sideReached[i] && h >= t) {
      this.sideReached[i] = true;
      this.reached = this.sideReached.every(Boolean);
      this.coins += (TARGET_BONUS / this.sides) * this.mult * (this.avgForm() / 100);
      play('target');
      say(this.onFirstSide()
        ? (this.camera ? 'Side one done! Keep going for bonus, then switch sides' : 'Side one done! Keep going for bonus, then tap switch')
        : 'Target reached! Bonus coins from here', { priority: true });
    }
    const tier = bonusTier(h, t).tier;
    if (tier === 2) once('tier2', () => { play('target'); say('Bonus level two. Double coins!', { priority: true }); });
    if (tier === 3) once('tier3', () => { play('level'); say('Bonus level three. Triple coins!', { priority: true }); });
  }

  avgForm() { return this.formTime ? this.formSum / this.formTime : 0; }

  // --- honour mode ---
  tickHonour(dt) {
    switch (this.state) {
      case 'countdown': {
        const left = 5 - this.stateTime;
        for (const n of [3, 2, 1]) if (left <= n && !this.milestones.has('cd' + n)) { this.milestones.add('cd' + n); play('tick'); }
        if (left <= 0) { this.go('holding'); play('go'); say('Hold', { priority: true }); }
        break;
      }
      case 'holding':
        this.accrue(dt, HONOUR_FORM);
        this.milestoneChecks();
        break;
      case 'switch':
        if (this.stateTime > 5) this.resumeSide();
        break;
    }
  }

  togglePause() {
    if (this.camera) return;
    if (this.state === 'paused') this.go('holding');
    else if (this.state === 'holding') this.go('paused');
  }

  finish(reason = 'stopped') {
    if (this.state === 'done') return this.result;
    this.go('done');
    play('end');
    this.result = {
      holdId: this.hold.id, level: this.level, held: this.held, target: this.target,
      coins: this.coins, daily: this.daily, avgForm: this.avgForm(), camera: this.camera, reason,
      reached: this.reached, ...(this.sides === 2 ? { sides: this.sideHeld.slice() } : {}),
    };
    return this.result;
  }

  view() {
    return {
      state: this.state, held: this.held, target: this.target, coins: this.coins, daily: this.daily,
      tier: bonusTier(this.sideHeld[this.sideIndex], this.sideTarget),
      score: Math.round(this.score), results: this.results, worst: this.worst, reached: this.reached,
      inPose: !!this.seen && this.score >= this.thr.hold,
      seen: this.seen, stateTime: this.stateTime, side: this.side,
      sides: this.sides, sideIndex: this.sideIndex, sideHeld: this.sideHeld[this.sideIndex],
      sideTarget: this.sideTarget, sideReached: this.sideReached[this.sideIndex], canSwitch: this.onFirstSide(),
    };
  }
}
