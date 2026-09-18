'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WORLD, GATHER, CORE, TARGETS, FOG, MAX_HUMANS, TRANSITION_MS } = require('../game');
const { createLimiter, sameHost } = require('../net');

function setup(n = 3) {
  let time = 100000;
  const events = [];
  const game = new Game({ now: () => time, random: () => 0.1, emit: (event, payload) => events.push({ event, payload }) });
  const ids = Array.from({ length: n }, (_, i) => `human-${i}`);
  for (const id of ids) game.addPlayer(id);
  return {
    game, ids, events,
    advance(ms) { time += ms; game.tick(ms / 1000); },
    stage(index) {
      game.index = index;
      game.phase = 'playing';
      game.resetStage();
      game.refresh();
    }
  };
}

function click(game, id, target) {
  game.press(id, target.x, target.y, false);
  game.press(id, target.x, target.y, true);
}

function clearFog(game, id) {
  for (let y = 15; y < 720; y += 60) {
    game.move(id, 0, y);
    game.move(id, 1200, y);
  }
}

test('victory preserves participants and starts a fresh cycle after the countdown', () => {
  const { game, ids, stage, advance } = setup();
  stage(4);
  ids.forEach(id => click(game, id, CORE));
  advance(2000);
  assert.equal(game.phase, 'victory');
  assert.ok(game.snapshot().transitionEndsAt);
  advance(TRANSITION_MS * 4 - 1);
  assert.equal(game.phase, 'victory');
  advance(1);
  assert.equal(game.phase, 'playing');
  assert.equal(game.index, 0);
  assert.equal(game.cycle, 2);
  assert.equal(game.victory, null);
  assert.equal(game.clicks, 0);
  assert.equal(game.players.size, 3);
  assert.ok([...game.players.values()].every(p => !p.down));
});

test('fixed layout and initial snapshot contract', () => {
  const { game, ids } = setup(1);
  const s = game.snapshot();
  assert.deepEqual(WORLD, { width: 1200, height: 720 });
  assert.deepEqual(GATHER, { x: 600, y: 350, r: 125 });
  assert.deepEqual(CORE, { x: 600, y: 350, r: 110 });
  assert.deepEqual(FOG, { cols: 40, rows: 24, radius: 55 });
  assert.equal(s.phase, 'waiting');
  assert.equal(s.index, 0);
  assert.equal(s.elapsed, 0);
  assert.equal(s.stage.total, 1);
  assert.equal(s.stage.fog.length, 960);
  assert.equal(s.stage.code, null);
  assert.equal(s.players[0].id, ids[0]);
  assert.deepEqual(Object.keys(s.players[0]).sort(), ['active', 'bot', 'color', 'down', 'id', 'name', 'x', 'y']);
  assert.equal(s.messages[0].at, 100000);
  s.stage.fog[0] = 1;
  s.players[0].x = -1;
  s.messages[0].text = 'mutated';
  assert.equal(game.snapshot().stage.fog[0], 0);
  assert.notEqual(game.snapshot().players[0].x, -1);
  assert.notEqual(game.snapshot().messages[0].text, 'mutated');
});

test('start needs three active participants; inactive people do not count', () => {
  const { game } = setup(2);
  game.setActive('human-1', false);
  game.addPlayer('third');
  assert.equal(game.phase, 'waiting');
  game.move('human-1', 20, 20);
  assert.equal(game.phase, 'playing');
});

test('gathering exact 75%, inclusive circle edge, and continuous three seconds', () => {
  const { game, ids, advance } = setup(4);
  game.move(ids[0], 725, 350);
  game.move(ids[1], 600, 350);
  advance(3000);
  assert.equal(game.snapshot().stage.progress, 0);
  game.move(ids[2], 600, 350);
  assert.equal(game.snapshot().stage.required, 3);
  advance(2999);
  assert.equal(game.phase, 'playing');
  advance(1);
  assert.equal(game.phase, 'transition');
});

test('gathering break and return between ticks resets immediately', () => {
  const { game, ids, advance } = setup();
  ids.forEach(id => game.move(id, 600, 350));
  advance(2900);
  game.move(ids[0], 726, 350);
  game.move(ids[0], 600, 350);
  advance(100);
  assert.equal(game.phase, 'playing');
  assert.equal(game.snapshot().stage.progress, 100 / 3000);
  advance(2900);
  assert.equal(game.phase, 'transition');
});

test('gathering rounds required participants upward', () => {
  const { game, ids, advance } = setup(5);
  ids.slice(0, 3).forEach(id => game.move(id, 600, 350));
  advance(3100);
  assert.equal(game.snapshot().stage.required, 4);
  assert.equal(game.phase, 'playing');
});

for (const window of [499, 500, 501]) {
  test(`constellation authoritative ${window}ms window`, () => {
    const { game, ids, advance, stage } = setup();
    stage(1);
    click(game, ids[0], TARGETS[0]);
    advance(250);
    click(game, ids[1], TARGETS[1]);
    advance(window - 250);
    click(game, ids[2], TARGETS[2]);
    assert.equal(game.phase, window <= 500 ? 'transition' : 'playing');
  });
}

test('constellation needs three different players and three different targets', () => {
  const { game, ids, stage, advance } = setup();
  stage(1);
  TARGETS.forEach(t => click(game, ids[0], t));
  assert.equal(game.phase, 'playing');
  advance(501);
  ids.forEach(id => click(game, id, TARGETS[0]));
  assert.equal(game.phase, 'playing');
  advance(501);
  assert.ok(game.snapshot().stage.targets.every(t => !t.lit && t.remaining === 0));
});

test('constellation considers all valid distinct-player matchings, not first owners only', () => {
  const { game, ids, stage } = setup();
  stage(1);
  click(game, ids[0], TARGETS[0]);
  click(game, ids[0], TARGETS[1]);
  click(game, ids[1], TARGETS[0]);
  click(game, ids[2], TARGETS[2]);
  assert.equal(game.phase, 'transition');
});

test('button down repetition is not another click; inactive and disconnected clicks expire', () => {
  const { game, ids, stage } = setup(4);
  stage(1);
  click(game, ids[0], TARGETS[0]);
  game.press(ids[0], TARGETS[1].x, TARGETS[1].y, true);
  assert.equal(game.clicks, 1);
  assert.equal(game.snapshot().stage.targets[1].lit, false);
  game.setActive(ids[0], false);
  assert.equal(game.players.get(ids[0]).down, false);
  assert.equal(game.snapshot().stage.targets[0].lit, false);
  assert.equal(game.press(ids[0], 600, 230, true), false);
  click(game, ids[1], TARGETS[1]);
  game.removePlayer(ids[1]);
  assert.equal(game.snapshot().stage.targets[1].lit, false);
});

test('fog uses movement, swept radius, full-world grid, and code gating', () => {
  const { game, ids, stage } = setup();
  stage(2);
  const p = game.players.get(ids[0]);
  game.move(ids[0], p.x, p.y);
  click(game, ids[0], { x: 0, y: 0 });
  assert.equal(game.clearedCells, 0);
  assert.equal(game.submitCode(ids[0], game.secretCode).ok, false);
  game.move(ids[0], 1200, 0);
  assert.equal(game.fog[0], 1);
  assert.equal(game.fog[39], 1);
  assert.equal(game.fog[80], 0);
  assert.equal(game.snapshot().stage.code, null);
  clearFog(game, ids[0]);
  const s = game.snapshot();
  assert.ok(s.stage.cleared >= 0.8);
  assert.ok(s.stage.fog.every(v => v === 0 || v === 1));
  assert.equal(s.stage.code, game.secretCode);
  assert.equal(game.submitCode(ids[0], 'wrong').ok, false);
  assert.equal(game.submitCode(ids[0], {}).ok, false);
  assert.equal(game.submitCode(ids[0], 'x'.repeat(33)).ok, false);
  assert.equal(game.submitCode(ids[0], ` ${s.stage.code} `).ok, true);
  assert.equal(game.phase, 'transition');
  assert.equal(game.submitCode(ids[0], s.stage.code).ok, false);
});

test('fog reveals at precisely 768 of 960 cells, never by rounded percentage', () => {
  const { game, ids, stage } = setup();
  stage(2);
  game.fog.fill(1, 0, 767);
  game.clearedCells = 767;
  assert.equal(game.snapshot().stage.code, null);
  assert.equal(game.submitCode(ids[0], game.secretCode).ok, false);
  game.fog[767] = 1;
  game.clearedCells++;
  assert.equal(game.snapshot().stage.cleared, 0.8);
  assert.equal(game.submitCode(ids[0], game.secretCode).ok, true);
});

for (const left of [3, 4, 5, 6, 7]) {
  test(`equilibrium ${left * 10}% left boundary`, () => {
    const { game, ids, stage, advance } = setup(10);
    stage(3);
    ids.forEach((id, i) => game.move(id, i < left ? 300 : 900, 350));
    advance(3999);
    assert.equal(game.phase, 'playing');
    advance(1);
    assert.equal(game.phase, left >= 4 && left <= 6 ? 'transition' : 'playing');
  });
}

test('equilibrium movement interruption resets the four-second timer', () => {
  const { game, ids, stage, advance } = setup(4);
  stage(3);
  ids.forEach((id, i) => game.move(id, i < 2 ? 300 : 900, 350));
  advance(3900);
  game.move(ids[0], 600, 350);
  assert.equal(game.snapshot().stage.right, 3);
  game.move(ids[0], 300, 350);
  advance(100);
  assert.equal(game.phase, 'playing');
  advance(3900);
  assert.equal(game.phase, 'transition');
});

test('core needs all active players and at least two, with a human', () => {
  const { game, ids, stage, advance } = setup(2);
  stage(4);
  game.press(ids[0], 710, 350, true);
  advance(2100);
  assert.equal(game.phase, 'playing');
  game.press(ids[1], 600, 350, true);
  advance(1999);
  assert.equal(game.phase, 'playing');
  advance(1);
  assert.equal(game.phase, 'victory');
  assert.equal(game.victory.clicks, 2);
  assert.equal(game.victory.peak, 2);
});

test('single core holder cannot win, even after others deactivate', () => {
  const { game, ids, stage, advance } = setup(2);
  stage(4);
  game.setActive(ids[1], false);
  game.press(ids[0], 600, 350, true);
  advance(3000);
  assert.equal(game.phase, 'playing');
});

for (const action of ['release', 'leave', 'join']) {
  test(`core interruption via ${action} resets immediately`, () => {
    const { game, ids, stage, advance } = setup();
    stage(4);
    ids.forEach(id => game.press(id, 600, 350, true));
    advance(1900);
    if (action === 'release') {
      game.press(ids[0], 600, 350, false);
      game.press(ids[0], 600, 350, true);
    } else if (action === 'leave') {
      game.move(ids[0], 711, 350);
      game.move(ids[0], 600, 350);
    } else {
      game.addPlayer('new');
      game.press('new', 600, 350, true);
    }
    advance(100);
    assert.equal(game.phase, 'playing');
    advance(1900);
    assert.equal(game.phase, 'victory');
  });
}

test('idle at 60 seconds releases down; valid movement resumes without resurrecting hold', () => {
  const { game, ids, advance } = setup(1);
  game.press(ids[0], 600, 350, true);
  advance(59999);
  assert.equal(game.snapshot().stage.total, 1);
  advance(1);
  assert.equal(game.snapshot().stage.total, 0);
  assert.equal(game.players.get(ids[0]).down, false);
  game.move(ids[0], 600, 350);
  assert.equal(game.snapshot().stage.total, 1);
  assert.equal(game.players.get(ids[0]).down, false);
  game.setActive(ids[0], false);
  assert.equal(game.snapshot().stage.total, 0);
  game.setActive(ids[0], true);
  assert.equal(game.snapshot().stage.total, 1);
});

test('invalid payloads do not mutate players or activity', () => {
  const { game, ids } = setup(1);
  const before = { ...game.players.get(ids[0]) };
  for (const value of [NaN, Infinity, -Infinity, '1', null, {}, [], undefined, -1, 1201]) {
    assert.equal(game.move(ids[0], value, 10), false);
    assert.equal(game.press(ids[0], value, 10, true), false);
  }
  for (const value of [NaN, Infinity, '1', null, {}, -1, 721]) assert.equal(game.move(ids[0], 10, value), false);
  assert.equal(game.press(ids[0], 0, 0, 1), false);
  assert.equal(game.setActive(ids[0], 'false'), false);
  assert.equal(game.move('missing', 10, 10), false);
  assert.equal(game.press('missing', 10, 10, true), false);
  assert.equal(game.setActive('missing', true), false);
  assert.equal(game.submitCode('missing', '1234').ok, false);
  assert.equal(game.tick(NaN), false);
  assert.equal(game.tick(-1), false);
  assert.equal(game.addPlayer({}), null);
  assert.deepEqual(game.players.get(ids[0]), before);
  assert.equal(game.move(ids[0], 1200, 720), true);
  assert.equal(game.move(ids[0], 0, 0), true);
});

test('capacity, bounded demo refill, and last-human cleanup', () => {
  const { game, ids } = setup(MAX_HUMANS);
  assert.equal(game.addPlayer('overflow'), null);
  assert.equal(game.addPlayer(ids[0]), game.players.get(ids[0]));
  assert.equal(game.spawnBots(), 10);
  for (let i = 0; i < 100; i++) assert.equal(game.spawnBots(), 0);
  assert.equal(game.players.size, 74);
  const bot = [...game.players.values()].find(p => p.bot);
  game.removePlayer(bot.id);
  assert.equal(game.spawnBots(), 1);
  ids.forEach(id => game.removePlayer(id));
  assert.equal(game.players.size, 0);
  assert.equal(game.phase, 'waiting');
  assert.equal(game.index, 0);
  assert.equal(game.spawnBots(), 0);
  assert.equal(game.cycle, 2);
  assert.equal(game.removePlayer('missing'), false);
});

test('transition timing, stage reset, bounded messages, and stable victory metrics', () => {
  const { game, ids, advance, stage, events } = setup();
  ids.forEach(id => game.move(id, 600, 350));
  advance(3000);
  const end = game.transitionEndsAt;
  assert.equal(end, 103000 + TRANSITION_MS);
  advance(TRANSITION_MS - 1);
  assert.equal(game.index, 0);
  advance(1);
  assert.equal(game.index, 1);
  assert.equal(game.phase, 'playing');
  assert.equal(game.transitionEndsAt, null);
  stage(4);
  ids.forEach(id => game.press(id, 600, 350, true));
  advance(2000);
  const victory = game.snapshot().victory;
  advance(5000);
  assert.deepEqual(game.snapshot().victory, victory);
  assert.equal(game.snapshot().elapsed, victory.duration);
  assert.ok(events.some(e => e.event === 'effect' && e.payload.type === 'victory'));
  for (let i = 0; i < 100; i++) game.gm.say(`message ${i}`);
  assert.equal(game.snapshot().messages.length, 12);
  ids.forEach(id => game.removePlayer(id));
  assert.equal(game.victory, null);
});

test('bots solve naturally, balance deterministically, but need human code and hold', () => {
  const { game, ids, advance } = setup(1);
  game.spawnBots();
  const step = () => {
    game.move(ids[0], 600, 350);
    advance(50);
  };
  for (let i = 0; i < 1000 && !(game.index === 2 && game.snapshot().stage.cleared >= 0.8); i++) step();
  assert.equal(game.index, 2);
  assert.ok(game.snapshot().stage.cleared >= 0.8);
  for (let i = 0; i < 100; i++) step();
  assert.equal(game.phase, 'playing');
  const bot = [...game.players.values()].find(p => p.bot);
  assert.equal(game.submitCode(bot.id, game.secretCode).ok, false);
  assert.equal(game.submitCode(ids[0], game.secretCode).ok, true);
  for (let i = 0; i < 500 && game.index !== 4; i++) step();
  assert.equal(game.index, 4);
  for (let i = 0; i < 150; i++) step();
  assert.equal(game.phase, 'playing');
  assert.equal(game.snapshot().stage.holders, 10);
  game.setActive(ids[0], false);
  for (let i = 0; i < 60; i++) advance(50);
  assert.equal(game.phase, 'playing');
  game.move(ids[0], 600, 350);
  game.press(ids[0], 600, 350, true);
  for (let i = 0; i < 40; i++) step();
  assert.equal(game.phase, 'victory');
  assert.equal(game.victory.peak, 11);
});

test('equilibrium bots keep stable sides and account for humans', () => {
  const { game, ids, stage, advance } = setup(2);
  game.spawnBots();
  game.move(ids[0], 300, 350);
  game.move(ids[1], 300, 350);
  stage(3);
  for (let i = 0; i < 50; i++) advance(50);
  const bots = () => [...game.players.values()].filter(p => p.bot).map(p => [p.id, p.x < 600]);
  const settled = bots();
  assert.equal(settled.filter(([, left]) => left).length, 4);
  for (let i = 0; i < 20; i++) advance(50);
  assert.deepEqual(bots(), settled);
  assert.equal(game.snapshot().stage.left, 6);
});

test('same-host origin validation and refillable per-event rate limits', () => {
  const host = 'localhost:3000';
  assert.equal(sameHost(undefined, host), true);
  assert.equal(sameHost('http://localhost:3000', host), true);
  assert.equal(sameHost('https://example.com', 'example.com'), true);
  for (const origin of ['null', 'https://evil.test', 'http://localhost:3001', 'http://localhost:3000/path', 'file://localhost:3000', 'bad']) {
    assert.equal(sameHost(origin, host), false);
  }
  let now = 0;
  const allow = createLimiter(() => now);
  for (let i = 0; i < 90; i++) assert.equal(allow('move'), true);
  assert.equal(allow('move'), false);
  assert.equal(allow('demo'), true);
  assert.equal(allow('demo'), false);
  assert.equal(allow('code'), true);
  assert.equal(allow('unknown'), false);
  now = 5000;
  assert.equal(allow('demo'), true);
  assert.equal(allow('move'), true);
});

// The Node HTTP/Socket.IO transport was retired in favor of Cloudflare Workers +
// Durable Objects (see src/worker.js, src/swarm.js). The WebSocket upgrade, security
// headers, origin rejection, and graceful shutdown behavior are covered by manual and
// integration verification (wrangler dev / wrangler deploy --dry-run) instead of a
// Node-level HTTP test here.
