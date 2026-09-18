'use strict';

const { GameMaster, STAGES } = require('./gamemaster');
const { updateBots } = require('./bots');

const WORLD = Object.freeze({ width: 1200, height: 720 });
const GATHER = Object.freeze({ x: 600, y: 350, r: 125 });
const CORE = Object.freeze({ x: 600, y: 350, r: 110 });
const TARGETS = Object.freeze([
  Object.freeze({ x: 300, y: 330, r: 40 }),
  Object.freeze({ x: 600, y: 230, r: 40 }),
  Object.freeze({ x: 900, y: 330, r: 40 })
]);
const FOG = Object.freeze({ cols: 40, rows: 24, radius: 55 });
const MAX_HUMANS = 64;
const MAX_BOTS = 10;
const IDLE_MS = 60000;
const TRANSITION_MS = 1500;
const COLORS = ['#ff4d6d', '#ffb703', '#2ec4b6', '#3a86ff', '#8338ec', '#06d6a0'];
const ANIMALS = ['Capybara', 'Pangolin', 'Axolotl', 'Otter', 'Quokka', 'Narwhal'];
const ADJECTIVES = ['Neon', 'Cosmic', 'Solar', 'Electric', 'Lunar', 'Velvet'];

function validPosition(x, y) {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= WORLD.width &&
    typeof y === 'number' && Number.isFinite(y) && y >= 0 && y <= WORLD.height;
}

function inside(p, circle) {
  return (p.x - circle.x) ** 2 + (p.y - circle.y) ** 2 <= circle.r ** 2;
}

class Game {
  constructor({ emit = () => {}, now = () => Date.now(), random = Math.random } = {}) {
    this.emit = emit;
    this.now = now;
    this.random = random;
    this.players = new Map();
    this.botSerial = 0;
    this.cycle = 1;
    this.messages = [];
    this.gm = new GameMaster((event, message) => {
      const entry = { ...message, at: this.now() };
      this.messages.push(entry);
      this.messages = this.messages.slice(-12);
      this.emit(event, entry);
    });
    this.resetRound();
  }

  resetRound() {
    this.phase = 'waiting';
    this.index = 0;
    this.startedAt = null;
    this.transitionEndsAt = null;
    this.victory = null;
    this.clicks = 0;
    this.peak = 0;
    this.resetStage();
    this.messages = [];
    this.gm.messages = [];
    this.gm.say('Waiting for at least three active cursors. Demo adds ten helpers.');
  }

  resetStage() {
    this.holdSince = null;
    this.targetClicks = TARGETS.map(() => new Map());
    this.fog = Array(FOG.cols * FOG.rows).fill(0);
    this.clearedCells = 0;
    this.secretCode = String(1000 + Math.floor(this.random() * 9000));
    for (const p of this.players.values()) p.down = false;
  }

  humanCount() {
    return [...this.players.values()].filter(p => !p.bot).length;
  }

  activePlayers() {
    return [...this.players.values()].filter(p => p.active);
  }

  addPlayer(id, { bot = false } = {}) {
    if (typeof id !== 'string' || !id || id.length > 128 || typeof bot !== 'boolean') return null;
    if (this.players.has(id)) return this.players.get(id);
    if (bot ? this.players.size - this.humanCount() >= MAX_BOTS : this.humanCount() >= MAX_HUMANS) return null;
    const pick = list => list[Math.floor(this.random() * list.length)];
    const p = {
      id, name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(COLORS),
      x: 60 + this.random() * 1080, y: 60 + this.random() * 600,
      down: false, bot, active: true, lastSeen: this.now()
    };
    this.players.set(id, p);
    this.refresh();
    this.syncHold();
    return p;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return false;
    for (const clicks of this.targetClicks) clicks.delete(id);
    if (this.humanCount() === 0) {
      this.players.clear();
      this.cycle++;
      this.resetRound();
    } else {
      this.refresh();
      this.syncHold();
    }
    return true;
  }

  refresh() {
    const now = this.now();
    for (const p of this.players.values()) {
      if (!p.bot && p.active && now - p.lastSeen >= IDLE_MS) {
        p.active = false;
        p.down = false;
        for (const clicks of this.targetClicks) clicks.delete(p.id);
      }
    }
    const active = this.activePlayers();
    this.peak = Math.max(this.peak, active.length);
    if (this.phase === 'waiting' && active.length >= 3) {
      this.phase = 'playing';
      this.startedAt = now;
      this.gm.introduce(this.index);
    }
    for (const clicks of this.targetClicks) {
      for (const [id, at] of clicks) {
        if (now - at > 500 || !this.players.get(id)?.active) clicks.delete(id);
      }
    }
    this.syncHold();
  }

  counts() {
    const active = this.activePlayers();
    return {
      total: active.length,
      inside: active.filter(p => inside(p, GATHER)).length,
      left: active.filter(p => p.x < WORLD.width / 2).length,
      right: active.filter(p => p.x >= WORLD.width / 2).length,
      holders: active.filter(p => p.down && inside(p, CORE)).length,
      humans: active.filter(p => !p.bot).length
    };
  }

  holdCondition() {
    const c = this.counts();
    if (this.index === 0) return c.total > 0 && c.inside >= Math.ceil(c.total * 0.75);
    if (this.index === 3) return c.total >= 2 && c.left * 10 >= c.total * 4 && c.left * 10 <= c.total * 6;
    if (this.index === 4) return c.total >= 2 && c.humans >= 1 && c.holders === c.total;
    return false;
  }

  syncHold() {
    if (this.phase !== 'playing' || !this.holdCondition()) this.holdSince = null;
    else if (this.holdSince === null) this.holdSince = this.now();
  }

  move(id, x, y) {
    if (!validPosition(x, y) || !this.players.has(id)) return false;
    this.refresh();
    const p = this.players.get(id);
    const previous = { x: p.x, y: p.y };
    const wasActive = p.active;
    p.x = x;
    p.y = y;
    p.active = true;
    p.lastSeen = this.now();
    this.refresh();
    if (this.phase === 'playing' && this.index === 2 && (previous.x !== x || previous.y !== y)) {
      this.scrub(wasActive ? previous : p, p);
    }
    this.syncHold();
    return true;
  }

  press(id, x, y, down) {
    if (typeof down !== 'boolean' || !validPosition(x, y) || !this.players.has(id)) return false;
    this.refresh();
    const p = this.players.get(id);
    if (!p.active) return false;
    p.x = x;
    p.y = y;
    p.lastSeen = this.now();
    const clicked = down && !p.down;
    p.down = down;
    this.syncHold();
    if (clicked && this.phase === 'playing') {
      this.clicks++;
      this.emit('effect', { type: 'click', x, y, color: p.color });
      if (this.index === 1) {
        const target = TARGETS.findIndex(t => inside(p, t));
        if (target !== -1) {
          this.targetClicks[target].set(id, this.now());
          this.checkConstellation();
        }
      }
    }
    return true;
  }

  setActive(id, active) {
    const p = this.players.get(id);
    if (!p || typeof active !== 'boolean' || (p.bot && !active)) return false;
    this.refresh();
    p.active = active;
    if (active) p.lastSeen = this.now();
    else {
      p.down = false;
      for (const clicks of this.targetClicks) clicks.delete(id);
    }
    this.refresh();
    this.syncHold();
    return true;
  }

  checkConstellation() {
    this.refresh();
    for (const a of this.targetClicks[0].keys()) {
      for (const b of this.targetClicks[1].keys()) {
        if (a === b) continue;
        for (const c of this.targetClicks[2].keys()) {
          if (c !== a && c !== b) {
            this.completeStage();
            return;
          }
        }
      }
    }
  }

  scrub(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    for (let row = 0; row < FOG.rows; row++) {
      for (let col = 0; col < FOG.cols; col++) {
        const index = row * FOG.cols + col;
        if (this.fog[index]) continue;
        const x = (col + 0.5) * WORLD.width / FOG.cols;
        const y = (row + 0.5) * WORLD.height / FOG.rows;
        const t = length2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2)) : 0;
        if ((x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2 <= FOG.radius ** 2) {
          this.fog[index] = 1;
          this.clearedCells++;
        }
      }
    }
  }

  submitCode(id, code) {
    this.refresh();
    const fail = message => ({ ok: false, message });
    const p = this.players.get(id);
    if (!p || !p.active || p.bot) return fail('An active human must enter the code.');
    if (typeof code !== 'string' || code.length > 32) return fail('Enter a valid code.');
    if (this.phase !== 'playing' || this.index !== 2) return fail('No code is needed right now.');
    if (this.clearedCells / this.fog.length < 0.8) return fail('Clear at least 80% of the fog first.');
    if (code.trim() !== this.secretCode) return fail('Incorrect code. Read the revealed digits.');
    p.lastSeen = this.now();
    this.completeStage();
    return { ok: true, message: 'Code accepted. The swarm advances.' };
  }

  spawnBots() {
    if (!this.humanCount()) return 0;
    let added = 0;
    while (this.players.size - this.humanCount() < MAX_BOTS) {
      const id = `bot-${++this.botSerial}`;
      if (this.players.has(id)) continue;
      this.addPlayer(id, { bot: true });
      added++;
    }
    return added;
  }

  completeStage() {
    if (this.phase !== 'playing') return;
    this.holdSince = null;
    this.emit('effect', { type: 'complete', x: 600, y: 350, color: '#2ec4b6' });
    if (this.index === 4) {
      this.phase = 'victory';
      this.transitionEndsAt = this.now() + TRANSITION_MS * 4;
      this.victory = { duration: (this.now() - this.startedAt) / 1000, clicks: this.clicks, peak: this.peak };
      this.gm.say('The swarm is one. Overload complete.', 'victory');
      this.emit('effect', { type: 'victory', x: 600, y: 350, color: '#ffb703' });
    } else {
      this.phase = 'transition';
      this.transitionEndsAt = this.now() + TRANSITION_MS;
      this.gm.say(`${STAGES[this.index].title} complete. Synchronizing the next stage.`, 'success');
    }
    for (const p of this.players.values()) p.down = false;
  }

  tick(dt) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) return false;
    this.refresh();
    if (this.phase === 'victory' && this.now() >= this.transitionEndsAt) {
      this.cycle++;
      this.resetRound();
      this.gm.say(`Cycle ${this.cycle} initialized. The swarm gathers again.`, 'objective');
    }
    if (this.phase === 'transition' && this.now() >= this.transitionEndsAt) {
      this.index++;
      this.resetStage();
      this.phase = 'playing';
      this.transitionEndsAt = null;
      this.gm.introduce(this.index);
    }
    updateBots(this, Math.min(dt, 0.1));
    this.refresh();
    const duration = { 0: 3000, 3: 4000, 4: 2000 }[this.index];
    if (this.phase === 'playing' && duration && this.holdSince !== null && this.now() - this.holdSince >= duration) {
      this.completeStage();
    }
    return true;
  }

  snapshot() {
    this.refresh();
    const c = this.counts();
    const cleared = this.clearedCells / this.fog.length;
    const duration = { 0: 3000, 3: 4000, 4: 2000 }[this.index];
    const targets = TARGETS.map((t, i) => {
      const times = [...this.targetClicks[i].values()];
      return { ...t, lit: times.length > 0, remaining: times.length ? Math.max(0, 500 - (this.now() - Math.max(...times))) : 0 };
    });
    let progress = duration && this.holdSince !== null ? Math.min(1, (this.now() - this.holdSince) / duration) : 0;
    if (this.index === 1) progress = targets.filter(t => t.lit).length / 3;
    if (this.index === 2) progress = Math.min(1, cleared / 0.8);
    if (this.phase === 'transition' || this.phase === 'victory') progress = 1;
    return {
      phase: this.phase, index: this.index, cycle: this.cycle,
      elapsed: this.victory ? this.victory.duration : this.startedAt === null ? 0 : (this.now() - this.startedAt) / 1000,
      players: [...this.players.values()].map(({ id, name, color, x, y, down, bot, active }) => ({ id, name, color, x, y, down, bot, active })),
      stage: {
        ...STAGES[this.index], progress, inside: c.inside,
        required: this.index === 0 ? Math.ceil(c.total * 0.75) : this.index === 1 ? 3 : this.index === 4 ? Math.max(2, c.total) : Math.ceil(c.total * 0.4),
        targets, fog: this.fog.slice(), cleared, code: this.index === 2 && cleared >= 0.8 ? this.secretCode : null,
        left: c.left, right: c.right, holders: c.holders, total: c.total,
        layout: { world: WORLD, gathering: GATHER, core: CORE, fog: FOG }
      },
      messages: this.messages.map(m => ({ ...m })),
      victory: this.victory ? { ...this.victory } : null,
      transitionEndsAt: this.transitionEndsAt
    };
  }
}

module.exports = { Game, WORLD, GATHER, CORE, TARGETS, FOG, MAX_HUMANS, MAX_BOTS, IDLE_MS, TRANSITION_MS };
