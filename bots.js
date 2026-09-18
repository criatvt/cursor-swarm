'use strict';

function approach(game, p, x, y, dt) {
  const dx = x - p.x;
  const dy = y - p.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.min(distance, 230 * dt);
  if (distance > 0 && step > 0) game.move(p.id, p.x + dx / distance * step, p.y + dy / distance * step);
  return distance <= 8;
}

function updateBots(game, dt) {
  if (game.phase !== 'playing') return;
  const { TARGETS, CORE } = require('./game');
  const bots = [...game.players.values()].filter(p => p.bot).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const humans = game.activePlayers().filter(p => !p.bot);
  const humanLeft = humans.filter(p => p.x < 600).length;
  const leftBots = Math.max(0, Math.min(bots.length, Math.round((bots.length + humans.length) / 2) - humanLeft));
  bots.forEach((p, i) => {
    if (p.botStage !== game.index) {
      p.botStage = game.index;
      p.waypoint = 0;
    }
    if (game.index === 0) {
      const angle = i * Math.PI * 2 / Math.max(1, bots.length);
      approach(game, p, 600 + Math.cos(angle) * 65, 350 + Math.sin(angle) * 65, dt);
    } else if (game.index === 1) {
      const target = TARGETS[i % 3];
      approach(game, p, target.x, target.y, dt);
    } else if (game.index === 2) {
      const band = 720 / Math.max(1, bots.length);
      const x = p.waypoint % 2 === 0 ? 20 : 1180;
      const y = Math.min(705, Math.max(15, band * (i + 0.5)));
      if (approach(game, p, x, y, dt)) p.waypoint++;
    } else if (game.index === 3) {
      approach(game, p, i < leftBots ? 300 : 900, 190 + (i % 5) * 70, dt);
    } else if (game.index === 4) {
      const angle = i * Math.PI * 2 / Math.max(1, bots.length);
      const arrived = approach(game, p, CORE.x + Math.cos(angle) * 55, CORE.y + Math.sin(angle) * 55, dt);
      if (arrived && !p.down) game.press(p.id, p.x, p.y, true);
    }
  });
  if (game.index === 1 && game.phase === 'playing' && bots.length >= 3) {
    const trio = bots.slice(0, 3);
    if (trio.every((p, i) => Math.hypot(p.x - TARGETS[i].x, p.y - TARGETS[i].y) < 8)) {
      for (const p of trio) {
        game.press(p.id, p.x, p.y, false);
        game.press(p.id, p.x, p.y, true);
      }
    }
  }
}

module.exports = { updateBots };
