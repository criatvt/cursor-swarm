(function () {
  'use strict';

  const WIDTH = 1200;
  const HEIGHT = 720;
  const palette = ['#22e6ff', '#ff3ec8', '#b8ff2f', '#ffb02f'];
  const cursors = new Map();
  const ripples = [];
  const particles = [];
  const stars = Array.from({ length: 150 }, function (_, i) {
    return { x: (i * 719.3) % WIDTH, y: (i * 317.7) % HEIGHT, size: 0.5 + (i % 4) * 0.35, phase: i * 1.7 };
  });
  let canvas;
  let ctx;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let localId;
  let clock = 0;
  let shake = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== width || h !== height || ratio !== pixelRatio) {
      width = w;
      height = h;
      pixelRatio = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    scale = Math.min(width / WIDTH, height / HEIGHT);
    offsetX = (width - WIDTH * scale) / 2;
    offsetY = (height - HEIGHT * scale) / 2;
  }

  function circle(x, y, radius, color, lineWidth, fill) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function label(text, x, y, size, color, font) {
    ctx.fillStyle = color || '#d7f4ff';
    ctx.font = (font === 'display' ? '700 ' : '400 ') + size + 'px ' + (font === 'display' ? '"Space Grotesk", sans-serif' : '"JetBrains Mono", monospace');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function arc(x, y, radius, progress, color, lineWidth) {
    circle(x, y, radius, '#1c293a', lineWidth || 5);
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, progress)));
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth || 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function glow(x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color + '28');
    gradient.addColorStop(1, color + '00');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function background() {
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    glow(600, 360, 540, '#22e6ff');
    ctx.strokeStyle = '#22e6ff0c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); }
    for (let y = 0; y <= HEIGHT; y += 40) { ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); }
    ctx.stroke();
    stars.forEach(function (star) {
      ctx.globalAlpha = 0.25 + (Math.sin(clock * 0.6 + star.phase) + 1) * 0.22;
      ctx.fillStyle = '#c9e8ff';
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#22e6ff24';
    ctx.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
    [[24, 24], [1176, 24], [24, 696], [1176, 696]].forEach(function (point) {
      ctx.strokeStyle = '#22e6ff70';
      ctx.beginPath();
      ctx.moveTo(point[0] - 5, point[1]); ctx.lineTo(point[0] + 5, point[1]);
      ctx.moveTo(point[0], point[1] - 5); ctx.lineTo(point[0], point[1] + 5);
      ctx.stroke();
    });
    label('COOPERATIVE SIGNAL EXPERIMENT / NO CURSOR LEFT BEHIND', 600, 680, 10, '#647587');
  }

  function gathering(stage) {
    const zone = stage.layout && stage.layout.gathering || { x: 600, y: 350, r: 125 };
    glow(zone.x, zone.y, 260, palette[0]);
    circle(zone.x, zone.y, zone.r, '#22e6ff0d', 1, true);
    circle(zone.x, zone.y, zone.r, '#22e6ff', 2);
    for (let i = 0; i < 3; i++) {
      const pulse = (clock * 0.3 + i / 3) % 1;
      ctx.globalAlpha = (1 - pulse) * 0.2;
      circle(zone.x, zone.y, zone.r + pulse * 95, palette[0]);
    }
    ctx.globalAlpha = 1;
    arc(zone.x, zone.y, zone.r + 12, stage.progress, palette[2], 5);
    label(Math.round((stage.inside || 0) / Math.max(1, stage.total) * 100) + '%', zone.x, zone.y - 6, 54, '#eafcff', 'display');
    label('CONCENTRATION', zone.x, zone.y + 38, 11, palette[0]);
    label('HOVER INSIDE · HOLD THE SIGNAL', zone.x, zone.y + zone.r + 56, 12, '#94aabd');
    label((stage.inside || 0) + ' / ' + stage.required + ' CURSORS REQUIRED', zone.x, zone.y + zone.r + 80, 11, palette[2]);
  }

  function constellation(stage) {
    const targets = stage.targets || [];
    ctx.setLineDash([4, 10]);
    ctx.strokeStyle = '#22e6ff38';
    ctx.beginPath();
    targets.forEach(function (target, i) {
      if (i === 0) ctx.moveTo(target.x, target.y);
      else ctx.lineTo(target.x, target.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    targets.forEach(function (target, i) {
      const color = palette[i];
      glow(target.x, target.y, target.lit ? 150 : 90, color);
      circle(target.x, target.y, target.r, color + (target.lit ? '38' : '0d'), 1, true);
      circle(target.x, target.y, target.r, color, 2);
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(reducedMotion ? 0 : clock * 0.15);
      ctx.beginPath();
      for (let point = 0; point < 8; point++) {
        const angle = point * Math.PI / 4;
        const radius = point % 2 ? 8 : 26;
        if (!point) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fillStyle = target.lit ? '#ffffff' : color;
      ctx.shadowColor = color;
      ctx.shadowBlur = target.lit ? 25 : 10;
      ctx.fill();
      ctx.restore();
      if (target.lit) arc(target.x, target.y, target.r + 12, target.remaining / 500, color, 4);
      else circle(target.x, target.y, target.r + 12, color + '30');
      label('0' + (i + 1) + ' / ' + (target.lit ? 'LINKED' : 'AWAITING CLICK'), target.x, target.y + 85, 11, color);
    });
    label('THREE CURSORS. ONE MOMENT.', 600, 505, 23, '#eafcff', 'display');
    label('SYNCHRONIZATION WINDOW / 500 MS', 600, 542, 12, '#94aabd');
  }

  function fog(stage) {
    const layout = stage.layout && stage.layout.fog || { cols: 40, rows: 24 };
    const cells = stage.fog || [];
    const cellW = WIDTH / layout.cols;
    const cellH = HEIGHT / layout.rows;
    glow(600, 330, 400, palette[2]);
    label(stage.code || '· · · ·', 600, 340, 158, palette[2], 'display');
    label(stage.code ? 'SIGNAL RECOVERED / ENTER CODE' : 'ENCRYPTED / CLEAR 80% TO DECODE', 600, 460, 15, palette[0]);
    for (let i = 0; i < layout.cols * layout.rows; i++) {
      if (cells[i]) continue;
      const x = (i % layout.cols) * cellW;
      const y = Math.floor(i / layout.cols) * cellH;
      const noise = (i * 17 + Math.floor(clock * 5) * 7) % 19;
      ctx.fillStyle = noise < 3 ? '#172132' : noise < 8 ? '#101725' : '#0b111d';
      ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
      ctx.fillStyle = '#22e6ff12';
      ctx.fillRect(x + 5, y + cellH / 2, noise + 2, 1);
    }
    label('MOVE TO ERASE THE STATIC', 600, 580, 13, '#eafcff');
    label(Math.floor((stage.cleared || 0) * 100) + '% REVEALED / 80% REQUIRED', 600, 610, 12, palette[2]);
  }

  function equilibrium(stage) {
    ctx.fillStyle = '#22e6ff09';
    ctx.fillRect(0, 0, 600, HEIGHT);
    ctx.fillStyle = '#ff3ec809';
    ctx.fillRect(600, 0, 600, HEIGHT);
    ctx.strokeStyle = palette[0];
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.lineDashOffset = -clock * 25;
    ctx.beginPath(); ctx.moveTo(600, 110); ctx.lineTo(600, 590); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    glow(310, 330, 230, palette[0]);
    glow(890, 330, 230, palette[1]);
    label('SECTOR / A', 310, 258, 13, palette[0]);
    label('SECTOR / B', 890, 258, 13, palette[1]);
    label(String(stage.left || 0).padStart(2, '0'), 310, 345, 104, palette[0], 'display');
    label(String(stage.right || 0).padStart(2, '0'), 890, 345, 104, palette[1], 'display');
    const ratio = stage.total ? stage.left / stage.total : 0.5;
    const balanced = ratio >= 0.4 && ratio <= 0.6;
    ctx.fillStyle = '#172132'; ctx.fillRect(390, 515, 420, 12);
    ctx.fillStyle = palette[0]; ctx.fillRect(390, 515, 420 * ratio, 12);
    ctx.fillStyle = palette[1]; ctx.fillRect(390 + 420 * ratio, 515, 420 * (1 - ratio), 12);
    ctx.strokeStyle = '#ffffff70'; ctx.strokeRect(558, 508, 84, 26);
    circle(390 + 420 * ratio, 521, 8, '#ffffff', 1, true);
    label(balanced ? 'BALANCED / KEEP STILL' : 'REDISTRIBUTE THE SWARM', 600, 563, 13, balanced ? palette[2] : palette[3]);
    arc(600, 350, 49, stage.progress, balanced ? palette[2] : palette[3], 4);
    label(Math.round(stage.progress * 100) + '%', 600, 350, 20, '#ffffff');
  }

  function overload(stage) {
    const core = stage.layout && stage.layout.core || { x: 600, y: 350, r: 110 };
    const progress = stage.progress || 0;
    ctx.save();
    if (!reducedMotion) ctx.translate(Math.sin(clock * 73) * progress * 4, Math.cos(clock * 67) * progress * 4);
    glow(core.x, core.y, 270 + progress * 60, palette[1]);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6 + clock * 0.1;
      const inner = core.r + 35;
      const outer = inner + 20 + Math.sin(clock * 3 + i) * 8;
      ctx.strokeStyle = i / 12 < progress ? palette[2] : '#ff3ec844';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(core.x + Math.cos(angle) * inner, core.y + Math.sin(angle) * inner);
      ctx.lineTo(core.x + Math.cos(angle) * outer, core.y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    circle(core.x, core.y, core.r, '#ff3ec816', 1, true);
    circle(core.x, core.y, core.r, palette[1], 3);
    arc(core.x, core.y, core.r + 15, progress, palette[2], 7);
    label(progress > 0 ? 'CHARGING' : 'HOLD', core.x, core.y - 14, 31, '#ffffff', 'display');
    label((stage.holders || 0) + ' / ' + stage.required + ' LINKED', core.x, core.y + 29, 13, palette[1]);
    ctx.restore();
    label('EVERY CURSOR. CLICK + HOLD THE CORE.', 600, 555, 13, palette[3]);
    label('DO NOT LET GO', 600, 585, 11, '#94aabd');
  }

  function drawCursors(players, dt) {
    const present = new Set();
    players.forEach(function (player) {
      present.add(player.id);
      let cursor = cursors.get(player.id);
      if (!cursor) {
        cursor = { x: player.x, y: player.y, trail: [] };
        cursors.set(player.id, cursor);
      }
      const blend = reducedMotion ? 1 : 1 - Math.exp(-18 * dt);
      cursor.x += (player.x - cursor.x) * blend;
      cursor.y += (player.y - cursor.y) * blend;
      const last = cursor.trail[cursor.trail.length - 1];
      if (!last || Math.hypot(cursor.x - last.x, cursor.y - last.y) > 2) cursor.trail.push({ x: cursor.x, y: cursor.y, life: 0.4 });
      cursor.trail.forEach(function (point) { point.life -= dt; });
      cursor.trail = cursor.trail.filter(function (point) { return point.life > 0; }).slice(-16);
      ctx.save();
      ctx.globalAlpha = player.active ? 1 : 0.3;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = player.down ? 3 : 2;
      if (!reducedMotion) {
        cursor.trail.forEach(function (point, i) {
          if (!i) return;
          ctx.globalAlpha = (player.active ? 0.6 : 0.1) * point.life / 0.4;
          ctx.beginPath(); ctx.moveTo(cursor.trail[i - 1].x, cursor.trail[i - 1].y); ctx.lineTo(point.x, point.y); ctx.stroke();
        });
      }
      ctx.globalAlpha = player.active ? 1 : 0.3;
      ctx.translate(cursor.x, cursor.y);
      if (player.down) circle(0, 0, 17 + Math.sin(clock * 8) * 2, player.color, 2);
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(4, 19); ctx.lineTo(9, 13); ctx.lineTo(17, 12); ctx.closePath();
      ctx.fillStyle = player.color; ctx.fill();
      ctx.strokeStyle = '#eafcff'; ctx.lineWidth = player.id === localId ? 1.5 : 0.5; ctx.stroke();
      ctx.shadowBlur = 0;
      const name = player.name + (player.id === localId ? ' / YOU' : player.bot ? ' / BOT' : '');
      ctx.font = '10px "JetBrains Mono", monospace';
      const chipWidth = ctx.measureText(name).width + 14;
      const chipX = cursor.x + chipWidth + 19 > WIDTH ? -chipWidth - 8 : 18;
      const chipY = cursor.y > HEIGHT - 45 ? -27 : 20;
      ctx.fillStyle = '#05070de6'; ctx.fillRect(chipX, chipY, chipWidth, 21);
      ctx.fillStyle = player.color; ctx.fillRect(chipX, chipY, 2, 21);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(name, chipX + 7, chipY + 11);
      ctx.restore();
    });
    cursors.forEach(function (_, id) { if (!present.has(id)) cursors.delete(id); });
  }

  function effect(data) {
    const x = Number.isFinite(data.x) ? data.x : 600;
    const y = Number.isFinite(data.y) ? data.y : 350;
    const color = data.color || palette[0];
    if (data.type === 'click' || data.type === 'complete') {
      ripples.push({ x: x, y: y, color: color, life: 1, large: data.type === 'complete' });
      if (ripples.length > 80) ripples.shift();
    }
    if (data.type === 'complete') shake = 0.3;
    if (data.type === 'victory') {
      shake = 0.65;
      for (let i = 0; i < (reducedMotion ? 40 : 220); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 550;
        particles.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 200, life: 4 + Math.random() * 4, color: palette[i % 4], rotation: Math.random() * Math.PI, size: 3 + Math.random() * 5 });
      }
      if (particles.length > 440) particles.splice(0, particles.length - 440);
    }
  }

  function drawEffects(dt) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      ripple.life -= dt * (ripple.large ? 0.7 : 1.8);
      if (ripple.life <= 0) { ripples.splice(i, 1); continue; }
      ctx.globalAlpha = ripple.life;
      circle(ripple.x, ripple.y, (1 - ripple.life) * (ripple.large ? 700 : 65) + 5, ripple.color, ripple.large ? 3 : 2);
    }
    ctx.globalAlpha = 1;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.life -= dt;
      if (particle.life <= 0) { particles.splice(i, 1); continue; }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 75 * dt;
      particle.vx *= Math.exp(-0.22 * dt);
      particle.rotation += dt * 3;
      ctx.save();
      ctx.globalAlpha = Math.min(1, particle.life);
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.5);
      ctx.restore();
    }
  }

  window.Renderer = {
    init: function (element) { canvas = element; ctx = canvas.getContext('2d'); resize(); },
    resize: resize,
    setLocalId: function (id) { localId = id; },
    toWorld: function (x, y, clamp) {
      const worldX = (x - offsetX) / scale;
      const worldY = (y - offsetY) / scale;
      if (!clamp && (worldX < 0 || worldX > WIDTH || worldY < 0 || worldY > HEIGHT)) return null;
      return { x: Math.max(0, Math.min(WIDTH, worldX)), y: Math.max(0, Math.min(HEIGHT, worldY)) };
    },
    effect: effect,
    render: function (state, dt) {
      resize();
      if (!reducedMotion) clock += dt;
      shake = Math.max(0, shake - dt);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, width, height);
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, WIDTH, HEIGHT); ctx.clip();
      if (!reducedMotion && shake) ctx.translate(Math.sin(clock * 90) * shake * 8, Math.cos(clock * 83) * shake * 8);
      background();
      if (state && state.stage) {
        [gathering, constellation, fog, equilibrium, overload][state.index](state.stage);
        drawCursors(state.players || [], dt);
      }
      drawEffects(dt);
      ctx.restore();
    }
  };
}());
