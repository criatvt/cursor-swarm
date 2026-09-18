import { DurableObject } from 'cloudflare:workers';
import { Game, MAX_HUMANS } from '../game.js';
import { createLimiter } from '../net.js';

const READY_STATE_OPEN = typeof WebSocket !== 'undefined' && WebSocket.READY_STATE_OPEN !== undefined
  ? WebSocket.READY_STATE_OPEN
  : 1;

export class Swarm extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = new Game({ emit: (event, payload) => this.broadcast(event, payload) });
    this.limiters = new Map();
    this.interval = null;

    let rehydrated = false;
    for (const ws of ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment) continue;
      this.game.addPlayer(attachment.id);
      rehydrated = true;
    }
    if (rehydrated) this.ensureTick();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }
    if (this.game.humanCount() >= MAX_HUMANS) {
      return new Response('The swarm is full. Try again later.', { status: 503 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const id = crypto.randomUUID();
    pair[1].serializeAttachment({ id });
    if (!this.game.addPlayer(id)) {
      pair[1].close(1013, 'The swarm is full. Try again later.');
      return new Response('The swarm is full. Try again later.', { status: 503 });
    }
    this.send(pair[1], 'welcome', { id });
    this.send(pair[1], 'state', this.game.snapshot());
    this.ensureTick();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    const { e: event, d: data } = message;
    const { id } = ws.deserializeAttachment();
    let allow = this.limiters.get(id);
    if (!allow) {
      allow = createLimiter();
      this.limiters.set(id, allow);
    }
    const positionPayload = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (event === 'move') {
      if (allow('move') && positionPayload(data)) this.game.move(id, data.x, data.y);
    } else if (event === 'press') {
      if (!positionPayload(data)) return;
      if (!allow('click')) {
        if (data.down === false) {
          const p = this.game.players.get(id);
          if (p) this.game.press(id, p.x, p.y, false);
        }
        return;
      }
      this.game.press(id, data.x, data.y, data.down);
    } else if (event === 'active') {
      if (allow('active') || data === false) this.game.setActive(id, data);
    } else if (event === 'code') {
      const result = allow('code') ? this.game.submitCode(id, data) : { ok: false, message: 'Please wait before trying another code.' };
      this.send(ws, 'code:result', result);
    } else if (event === 'demo') {
      if (allow('demo')) this.game.spawnBots();
    }
  }

  webSocketClose(ws) {
    this.dropSocket(ws);
  }

  webSocketError(ws) {
    this.dropSocket(ws);
  }

  dropSocket(ws) {
    const attachment = ws.deserializeAttachment();
    if (attachment) {
      this.game.removePlayer(attachment.id);
      this.limiters.delete(attachment.id);
    }
    // getWebSockets() may still include the socket being closed, so exclude it
    // explicitly — otherwise the last player leaving never stops the tick.
    const remaining = this.ctx.getWebSockets().filter(other => other !== ws);
    if (remaining.length === 0) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  ensureTick() {
    if (this.interval) return;
    this.lastTick = Date.now();
    this.interval = setInterval(() => {
      const at = Date.now();
      this.game.tick((at - this.lastTick) / 1000);
      this.lastTick = at;
      this.broadcast('state', this.game.snapshot(), true);
    }, 50);
  }

  send(ws, event, payload) {
    try {
      ws.send(JSON.stringify({ e: event, d: payload }));
    } catch {
      // ignore
    }
  }

  broadcast(event, payload, volatile) {
    const message = JSON.stringify({ e: event, d: payload });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== READY_STATE_OPEN) continue;
      if (volatile && ws.bufferedAmount > 64 * 1024) continue;
      try {
        ws.send(message);
      } catch {
        // ignore
      }
    }
  }

  stats() {
    return { ok: true, phase: this.game.phase, players: this.game.players.size };
  }
}
