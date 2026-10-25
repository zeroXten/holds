// Flowing holds: instead of timing a still position, count slow cycles through key
// positions (for Holding Up the Sky: hands low at the belly → palms high overhead →
// low again). A cycle only counts if it takes at least the level's minimum time, so
// the movement stays slow and soft. Without the camera it becomes a paced guide.
//
// Camera states: framing → ready (waiting in the start position) → flowing → done
// Honour states: countdown → flowing (paused) → done

import { makeBody, scorePose, visible } from './scoring.js';
import { requiredFor } from './holds.js';
import { COIN_SECONDS, LEVEL_MULT, TARGET_BONUS, DAILY_MULT, HONOUR_FORM, formFactor, bonusTier } from './economy.js';
import { Session } from './session.js';
import { play, say } from './audio.js';

const REACHED = 70;        // a position counts as reached at this score
const IDLE = 20;           // seconds without progress before the session ends
const IDLE_AFTER = 8;      // ...once the goal is met
const HONOUR_PAUSE = 2.5;  // honour mode: seconds added to the minimum, for a comfortable pace

const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export const createSession = opts => (opts.hold.flow ? new FlowSession(opts) : new Session(opts));

export class FlowSession {
  constructor({ hold, level, camera, daily = false, now }) {
    Object.assign(this, { hold, level, camera, daily, last: now });
    const f = hold.flow;
    this.goal = hold.levels[level - 1].target;
    this.minCycle = f.minCycle[level - 1];
    this.dwell = f.dwell[level - 1];
    this.mult = LEVEL_MULT[level - 1] * (daily ? DAILY_MULT : 1);
    this.poses = { low: { criteria: f.low, sides: false }, high: { criteria: hold.criteria, sides: false } };
    this.required = requiredFor(hold, level);
    this.state = camera ? 'framing' : 'countdown';
    this.stateTime = 0;
    this.phase = 'up';           // heading for the high position ('up') or back to low ('down')
    this.phaseTime = 0;
    this.count = 0;
    this.held = 0;               // seconds of counted cycles (for bets and totals)
    this.coins = 0;
    this.scores = { low: 0, high: 0 };
    this.topScore = 0;
    this.topTime = 0;
    this.lowTime = 0;
    this.seenTime = 0;
    this.idle = 0;
    this.cycleStart = now;
    this.formSum = 0;
    this.reached = false;
    this.tooFastAt = -1e9;
    this.result = null;
  }

  go(state) { this.state = state; this.stateTime = 0; }

  tick(now, frame) {
    const dt = Math.min(Math.max(now - this.last, 0), 1);
    this.last = now;
    this.now = now;
    this.stateTime += dt;
    this.phaseTime += dt;
    if (this.state === 'done') return this.view();
    if (this.camera) this.tickCamera(dt, frame); else this.tickHonour(dt);
    return this.view();
  }

  tickCamera(dt, frame) {
    const lm = frame?.landmarks;
    const seen = !!lm && visible(lm, this.required);
    this.seen = seen;
    const k = 1 - Math.exp(-dt / 0.2);
    let results = { low: null, high: null };
    if (seen) {
      const body = makeBody(lm, frame.width, frame.height);
      for (const p of ['low', 'high']) {
        const r = scorePose(this.poses[p], this.level, body);
        this.scores[p] += (r.score - this.scores[p]) * k;
        results[p] = r.results;
      }
      this.seenTime += dt;
    } else {
      for (const p of ['low', 'high']) this.scores[p] *= 1 - k;
      this.seenTime = 0;
    }
    // Coaching and skeleton colours follow the position you're heading for.
    const aim = this.state === 'flowing' && this.phase === 'up' ? 'high' : 'low';
    this.results = results[aim];
    this.worst = this.results?.filter(r => r.cue && r.s < 0.75).sort((a, b) => a.s * a.weight - b.s * b.weight)[0] ?? null;
    const low = this.scores.low >= REACHED, high = this.scores.high >= REACHED;

    switch (this.state) {
      case 'framing':
        if (this.seenTime > 0.7) { this.go('ready'); say('Interlace your fingers in front of your belly, palms up', { priority: true }); }
        break;
      case 'ready':
        this.lowTime = low ? this.lowTime + dt : 0;
        if (this.lowTime > 0.6) {
          this.go('flowing');
          this.startCycle();
          play('go');
          say('Slowly raise your hands, turn your palms up and push to the sky', { priority: true });
        }
        break;
      case 'flowing':
        this.idle += dt;
        if (this.phase === 'up') {
          this.topScore = Math.max(this.topScore, this.scores.high);
          this.topTime = high ? this.topTime + dt : 0;
          if (this.topTime >= Math.max(0.3, this.dwell)) {
            this.setPhase('down');
            say(this.dwell >= 1 ? 'Open your hands and float them down the sides' : 'And slowly down', { minGap: 4000 });
          } else if (this.phaseTime > 6 && this.worst) say(this.worst.cue, { minGap: 6000 });
        } else {
          this.lowTime = low ? this.lowTime + dt : 0;
          if (this.lowTime > 0.4) this.completeCycle();
        }
        if (this.idle > (this.reached ? IDLE_AFTER : IDLE)) this.finish(this.reached ? 'complete' : 'stopped');
        break;
    }
  }

  // Honour mode: a paced guide that calls "rise" and "lower" and counts each cycle.
  tickHonour(dt) {
    const period = this.minCycle + HONOUR_PAUSE;
    switch (this.state) {
      case 'countdown':
        if (this.stateTime >= 5) { this.go('flowing'); this.startCycle(); play('go'); say('Rise', { priority: true }); }
        break;
      case 'flowing':
        if (this.phase === 'up' && this.phaseTime >= period / 2) { this.setPhase('down'); say('Lower', { priority: true }); }
        else if (this.phase === 'down' && this.phaseTime >= period / 2) {
          this.completeCycle();
          if (this.state === 'flowing') say('Rise', { minGap: 1000 });
        }
        break;
    }
  }

  startCycle() {
    this.cycleStart = this.now ?? this.last;
    this.topScore = 0;
    this.topTime = 0;
    this.lowTime = 0;
    this.setPhase('up');
  }

  setPhase(phase) { this.phase = phase; this.phaseTime = 0; this.idle = 0; }

  completeCycle() {
    const dur = (this.now ?? this.last) - this.cycleStart;
    if (dur + 0.05 < this.minCycle) {
      // Too quick to count: the point is slow, soft movement.
      this.tooFastAt = this.now;
      play('slip');
      say(`Slower. Take at least ${this.minCycle} seconds for each one`, { minGap: 5000, priority: true });
    } else {
      const form = this.camera ? this.topScore : 100;
      const factor = this.camera ? formFactor(form) : HONOUR_FORM;
      this.coins += (dur / COIN_SECONDS) * this.mult * factor * bonusTier(this.count, this.goal).mult;
      this.count++;
      this.held += dur;
      this.formSum += form;
      play('point');
      if (!this.reached && this.count >= this.goal) {
        this.reached = true;
        this.coins += TARGET_BONUS * this.mult * (this.avgForm() / 100);
        play('target');
        say('Target reached! Bonus coins from here', { priority: true });
      } else {
        say(NUMBERS[this.count - 1] ?? String(this.count), { minGap: 1000 });
      }
    }
    this.startCycle();
  }

  avgForm() { return this.count ? this.formSum / this.count : 0; }

  togglePause() {
    if (this.camera) return;
    if (this.state === 'paused') this.go('flowing');
    else if (this.state === 'flowing') this.go('paused');
  }

  finish(reason = 'stopped') {
    if (this.state === 'done') return this.result;
    this.go('done');
    play('end');
    this.result = {
      holdId: this.hold.id, level: this.level, held: this.held, target: this.goal * this.minCycle,
      coins: this.coins, daily: this.daily, avgForm: this.avgForm(), camera: this.camera, reason, reached: this.reached,
      unit: 'cycles', count: this.count, goal: this.goal,
    };
    return this.result;
  }

  view() {
    return {
      flow: true, state: this.state, phase: this.phase, phaseTime: this.phaseTime, stateTime: this.stateTime,
      count: this.count, goal: this.goal, minCycle: this.minCycle, held: this.held, coins: this.coins, daily: this.daily,
      tier: bonusTier(this.count, this.goal), reached: this.reached, seen: this.seen,
      score: Math.round(this.state === 'flowing' && this.phase === 'up' ? this.scores.high : this.scores.low),
      results: this.results, worst: this.worst, tooFast: (this.now ?? 0) - this.tooFastAt < 2.5,
      cycleTime: (this.now ?? this.last) - this.cycleStart,
      sides: 1, sideIndex: 0, canSwitch: false,
    };
  }
}
