(function () {
  'use strict';

  const canvas = document.getElementById('arena');
  const sound = window.Audio;
  const renderer = window.Renderer;
  const ui = window.UI;
  let state = null;
  let socket;
  let pressing = false;
  let position = { x: 600, y: 350 };
  let pendingMove = null;
  let lastMoveAt = -Infinity;
  let lastFrame = performance.now();
  let demoTimer;
  let demoRequested = false;
  let started = false;
  const params = new URLSearchParams(window.location.search);
  let demo = params.get('demo') === 'true' || (params.has('bots') && Number(params.get('bots')) > 0);

  renderer.init(canvas);
  ui.init({
    demo: function () { if (socket && socket.connected) socket.emit('demo'); },
    code: function (code) { if (socket && socket.connected) socket.emit('code', code); },
    reset: function () { window.location.reload(); }
  });
  ui.setConnection(false, 'Establishing a shared signal…');

  function release() {
    if (!pressing) return;
    pressing = false;
    if (socket && socket.connected) socket.emit('press', { x: position.x, y: position.y, down: false });
  }

  function move(event) {
    const next = renderer.toWorld(event.clientX, event.clientY, pressing);
    if (!next) return;
    position = next;
    pendingMove = next;
  }

  function press(event) {
    if (event.button !== 0 || !socket || !socket.connected) return;
    const next = renderer.toWorld(event.clientX, event.clientY, false);
    if (!next) return;
    event.preventDefault();
    sound.unlock();
    position = next;
    pressing = true;
    socket.emit('move', next);
    lastMoveAt = performance.now();
    pendingMove = null;
    socket.emit('press', { x: next.x, y: next.y, down: true });
  }

  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mousedown', press);
  canvas.addEventListener('mouseup', function (event) {
    if (event.button !== 0) return;
    move(event);
    release();
  });
  canvas.addEventListener('mouseleave', release);
  canvas.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    canvas.setPointerCapture(event.pointerId);
    press(event);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerType !== 'mouse' && event.isPrimary) move(event);
  });
  canvas.addEventListener('pointerup', function (event) {
    if (event.pointerType !== 'mouse' && event.isPrimary) release();
  });
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', release);
  window.addEventListener('resize', renderer.resize);
  document.addEventListener('pointerdown', function () { sound.unlock(); }, { passive: true });
  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
    sound.unlock();
    if (event.key.toLowerCase() === 'r' && !event.repeat) { window.location.reload(); return; }
    if (event.target instanceof HTMLElement && event.target.closest('button') && (event.key === 'Enter' || event.key === ' ')) return;
    const key = event.key === 'Backspace' || event.key === 'Delete' ? 'del' : event.key === 'Enter' ? 'enter' : event.key === 'Escape' ? 'clear' : event.key;
    if (ui.key(key)) event.preventDefault();
  });
  document.addEventListener('visibilitychange', function () {
    release();
    pendingMove = null;
    if (socket && socket.connected) socket.emit('active', !document.hidden);
    if (document.hidden) sound.silence();
    lastFrame = performance.now();
  });

  function startGame(withBots) {
    if (started) return;
    started = true;
    demo = withBots;
    document.getElementById('launch').classList.add('hidden');
    document.getElementById('launch').inert = true;
    connectGame();
  }

  document.getElementById('launch-friends').addEventListener('click', function () { startGame(false); });

  function connectGame() {
    if (typeof window.io !== 'function') {
      ui.setConnection(false, 'Socket client unavailable. Reload to retry.');
      ui.toast('Socket client unavailable. Reload to retry.', true);
      return;
    }
    socket = window.io();
    socket.on('connect', function () {
      ui.setConnection(true);
      socket.emit('active', !document.hidden);
      if (demo && !demoRequested) {
        clearTimeout(demoTimer);
        demoTimer = setTimeout(function () {
          if (!socket.connected) return;
          socket.emit('demo');
          demoRequested = true;
        }, 500);
      }
    });
    socket.on('welcome', function (message) { renderer.setLocalId(message.id); });
    socket.on('state', function (next) {
      const changed = !state || state.index !== next.index || state.cycle !== next.cycle || state.phase !== next.phase;
      if (changed) {
        if (next.phase === 'playing') sound.stage();
        if (next.phase !== 'playing' || !state || next.index !== state.index) release();
      }
      if (next.index === 1 && state && state.index === 1 && next.phase === 'playing') {
        (next.stage.targets || []).forEach(function (target, i) {
          if (target.lit && !(state.stage.targets[i] && state.stage.targets[i].lit)) sound.lit(i);
        });
      }
      state = next;
      ui.update(state);
    });
    socket.on('code:result', ui.codeResult);
    socket.on('effect', function (effect) {
      renderer.effect(effect);
      if (effect.type === 'click') sound.blip();
      else if (effect.type === 'complete') sound.complete();
      else if (effect.type === 'victory') sound.victory();
    });
    socket.on('disconnect', function () {
      pressing = false;
      pendingMove = null;
      clearTimeout(demoTimer);
      sound.silence();
      ui.setConnection(false);
    });
    socket.on('connect_error', function (error) {
      ui.setConnection(false, error.message || 'Unable to connect. Retrying…');
      ui.toast(error.message || 'Connection unavailable', true);
    });
  }

  if (demo) startGame(true);

  function frame(now) {
    const dt = Math.min(Math.max(0, (now - lastFrame) / 1000), 0.05);
    lastFrame = now;
    if (pendingMove && socket && socket.connected && !document.hidden && now - lastMoveAt >= 33) {
      socket.emit('move', pendingMove);
      pendingMove = null;
      lastMoveAt = now;
    }
    if (!document.hidden && socket && socket.connected && state) sound.ambient(state.phase === 'playing' ? state.index : -1);
    renderer.render(state, dt);
    ui.tick(dt);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}());
