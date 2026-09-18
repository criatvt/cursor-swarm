'use strict';

const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const { performance } = require('node:perf_hooks');
const { Game, MAX_HUMANS } = require('./game');

function sameHost(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== 'string' || typeof req.headers.host !== 'string') return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origin && url.host.toLowerCase() === req.headers.host.toLowerCase();
  } catch {
    return false;
  }
}

function createLimiter(now = () => Date.now()) {
  const limits = { move: [60, 90], click: [20, 30], code: [1, 3], demo: [0.2, 1], active: [4, 8] };
  const buckets = new Map();
  return event => {
    if (!limits[event]) return false;
    const [rate, capacity] = limits[event];
    const at = now();
    const bucket = buckets.get(event) || { at, tokens: capacity };
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, at - bucket.at) / 1000 * rate);
    bucket.at = at;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens--;
    buckets.set(event, bucket);
    return allowed;
  };
}

function createServer({ now, random } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const headers = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
  const io = new Server(server, {
    maxHttpBufferSize: 4096,
    allowRequest: (req, callback) => callback(null, sameHost(req))
  });
  io.engine.on('headers', responseHeaders => Object.assign(responseHeaders, headers));
  const game = new Game({ emit: (event, payload) => io.emit(event, payload), now, random });
  app.use((req, res, next) => {
    res.set(headers);
    next();
  });
  app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, phase: game.phase, players: game.players.size });
  });
  app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', maxAge: 0 }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  io.use((socket, next) => {
    if (game.humanCount() >= MAX_HUMANS) return next(new Error('The swarm is full. Try again later.'));
    next();
  });
  io.on('connection', socket => {
    if (!game.addPlayer(socket.id)) {
      socket.disconnect(true);
      return;
    }
    const allow = createLimiter(now);
    const positionPayload = data => data !== null && typeof data === 'object' && !Array.isArray(data);
    socket.emit('welcome', { id: socket.id });
    socket.emit('state', game.snapshot());
    socket.on('move', data => {
      if (allow('move') && positionPayload(data)) game.move(socket.id, data.x, data.y);
    });
    socket.on('press', data => {
      if (!positionPayload(data)) return;
      if (!allow('click')) {
        if (data.down === false) {
          const p = game.players.get(socket.id);
          if (p) game.press(socket.id, p.x, p.y, false);
        }
        return;
      }
      game.press(socket.id, data.x, data.y, data.down);
    });
    socket.on('active', active => {
      if (allow('active') || active === false) game.setActive(socket.id, active);
    });
    socket.on('code', code => {
      const result = allow('code') ? game.submitCode(socket.id, code) : { ok: false, message: 'Please wait before trying another code.' };
      socket.emit('code:result', result);
    });
    socket.on('demo', () => {
      if (allow('demo')) game.spawnBots();
    });
    socket.on('disconnect', () => game.removePlayer(socket.id));
  });
  let lastTick = performance.now();
  const interval = setInterval(() => {
    const at = performance.now();
    game.tick((at - lastTick) / 1000);
    lastTick = at;
    io.volatile.emit('state', game.snapshot());
  }, 50);
  interval.unref();
  let closing;
  function close() {
    if (closing) return closing;
    clearInterval(interval);
    closing = new Promise(resolve => {
      const force = setTimeout(() => {
        if (server.closeAllConnections) server.closeAllConnections();
      }, 5000);
      force.unref();
      io.close(() => {
        clearTimeout(force);
        resolve();
      });
    });
    return closing;
  }
  return { app, server, io, game, close };
}

if (require.main === module) {
  const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('PORT must be an integer between 0 and 65535.');
    process.exitCode = 1;
  } else {
    const runtime = createServer();
    runtime.server.on('error', () => {
      console.error('Unable to start the Cursor Swarm server.');
      runtime.close();
      process.exitCode = 1;
    });
    runtime.server.listen(port, () => console.log(`Cursor Swarm listening on port ${runtime.server.address().port}`));
    const shutdown = () => {
      const deadline = setTimeout(() => process.exit(1), 6000);
      deadline.unref();
      runtime.close().then(() => {
        clearTimeout(deadline);
        process.exitCode = 0;
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}

module.exports = { createServer, createLimiter, sameHost };
