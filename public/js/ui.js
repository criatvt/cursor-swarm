(function () {
  'use strict';

  const nodes = {};
  const seen = new Set();
  const queue = [];
  let state;
  let actions;
  let digits = '';
  let typing;
  let typeBudget = 0;
  let bannerUntil = 0;
  let toastUntil = 0;
  let connected = false;
  let cycle;
  let phaseKey = '';

  function text(id, value) {
    const next = String(value);
    if (nodes[id].textContent !== next) nodes[id].textContent = next;
  }

  function time(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
  }

  function addMessages(messages) {
    (messages || []).forEach(function (message) {
      const key = message.at + ':' + message.kind + ':' + message.text;
      if (seen.has(key)) return;
      seen.add(key);
      queue.push(message);
    });
    while (seen.size > 100) seen.delete(seen.values().next().value);
    if (queue.length > 12) queue.splice(0, queue.length - 12);
  }

  function showBanner(value) {
    text('banner', value);
    nodes.banner.classList.remove('hidden', 'fade');
    bannerUntil = performance.now() + 2300;
  }

  function toast(message, error) {
    text('toast', message);
    nodes.toast.classList.toggle('error', Boolean(error));
    nodes.toast.classList.add('show');
    toastUntil = performance.now() + 4200;
  }

  function updateDigits() { text('keypad-display', digits.padEnd(4, '—')); }

  function key(value) {
    if (!connected || !state || state.phase !== 'playing' || state.index !== 2) return false;
    window.Audio.unlock();
    if (/^\d$/.test(value)) {
      if (digits.length < 4) { digits += value; window.Audio.blip(); }
    } else if (value === 'del') {
      digits = digits.slice(0, -1);
    } else if (value === 'clear') {
      digits = '';
    } else if (value === 'enter') {
      if (digits.length !== 4) {
        text('keypad-status', 'ENTER FOUR DIGITS');
        window.Audio.deny();
      } else if ((state.stage.cleared || 0) < 0.8) {
        text('keypad-status', 'CLEAR 80% FIRST');
        window.Audio.deny();
      } else {
        text('keypad-status', 'TRANSMITTING…');
        actions.code(digits);
      }
    } else return false;
    updateDigits();
    return true;
  }

  function update(next) {
    state = next;
    const stage = state.stage;
    const players = state.players || [];
    const active = players.filter(function (player) { return player.active; }).length;
    const bots = players.filter(function (player) { return player.bot; }).length;
    const key = state.cycle + ':' + state.index + ':' + state.phase;
    if (cycle !== state.cycle) {
      cycle = state.cycle;
      seen.clear(); queue.length = 0; typing = null;
      nodes['gm-log'].replaceChildren();
    }
    if (key !== phaseKey) {
      if (state.phase === 'playing') showBanner(stage.title);
      else if (state.phase === 'transition') showBanner('SIGNAL SYNCHRONIZED');
      else { nodes.banner.classList.add('hidden'); bannerUntil = 0; }
      digits = '';
      updateDigits();
      text('keypad-status', 'TYPE DIGITS + ENTER');
      phaseKey = key;
    }
    text('cycle-label', 'CYCLE ' + String(state.cycle).padStart(2, '0') + ' / ' + time(state.elapsed));
    text('player-count', active + ' ACTIVE · ' + bots + ' BOTS');
    text('obj-title', '0' + (state.index + 1) + ' / ' + stage.title.toUpperCase());
    text('obj-text', stage.objective);
    text('obj-hint', stage.hint);
    nodes['ticker-fill'].style.width = Math.round(Math.max(0, Math.min(1, stage.progress || 0)) * 100) + '%';
    nodes.ticker.setAttribute('aria-valuenow', String(Math.round((stage.progress || 0) * 100)));
    Array.from(nodes.pips.children).forEach(function (pip, i) {
      const done = i < state.index || (i === state.index && (state.phase === 'transition' || state.phase === 'victory'));
      pip.classList.toggle('done', done);
      pip.classList.toggle('current', i === state.index && !done);
      pip.setAttribute('aria-label', 'Stage ' + (i + 1) + (done ? ' complete' : i === state.index ? ' current' : ' locked'));
    });
    nodes.standby.classList.toggle('hidden', connected && state.phase !== 'waiting');
    nodes.victory.classList.toggle('hidden', !connected || state.phase !== 'victory');
    nodes.keypad.classList.toggle('hidden', !connected || state.index !== 2 || state.phase !== 'playing');
    text('standby-count', active + ' / 3');
    const readouts = [
      'BEACON  ' + stage.inside + ' / ' + stage.required + '\nCONCENTRATION  ' + Math.round((stage.inside || 0) / Math.max(1, stage.total) * 100) + '%',
      'STARS LINKED  ' + (stage.targets || []).filter(function (target) { return target.lit; }).length + ' / 3\nWINDOW  500 MS',
      'STATIC CLEARED  ' + Math.floor((stage.cleared || 0) * 100) + '%\nDECODE THRESHOLD  80%',
      'LEFT  ' + stage.left + '  /  RIGHT  ' + stage.right + '\nTOLERANCE  ±10%',
      'CORE HOLDERS  ' + stage.holders + ' / ' + stage.required + '\nCHARGE  ' + Math.round(stage.progress * 100) + '%'
    ];
    text('stage-readout', readouts[state.index]);
    if (state.phase === 'victory' && state.victory) {
      text('v-time', time(state.victory.duration));
      text('v-clicks', state.victory.clicks);
      text('v-peak', state.victory.peak);
    }
    addMessages(state.messages);
  }

  window.UI = {
    init: function (callbacks) {
      actions = callbacks;
      ['banner', 'pips', 'cycle-label', 'player-count', 'obj-title', 'obj-text', 'obj-hint', 'ticker', 'ticker-fill', 'gm-log', 'stage-readout', 'btn-sound', 'btn-reset', 'keypad', 'keypad-display', 'keypad-status', 'standby', 'standby-count', 'victory', 'v-time', 'v-clicks', 'v-peak', 'v-countdown', 'toast', 'connection-title', 'connection-copy'].forEach(function (id) { nodes[id] = document.getElementById(id); });
      for (let i = 0; i < 5; i++) {
        const pip = document.createElement('span');
        pip.className = 'pip';
        nodes.pips.appendChild(pip);
      }
      nodes['btn-sound'].addEventListener('click', function () {
        const enabled = window.Audio.setEnabled(!window.Audio.isEnabled());
        text('btn-sound', 'SOUND: ' + (enabled ? 'ON' : 'OFF'));
        nodes['btn-sound'].setAttribute('aria-pressed', String(enabled));
        if (enabled) window.Audio.blip();
      });
      nodes['btn-reset'].addEventListener('click', actions.reset);
      nodes.keypad.addEventListener('click', function (event) {
        const button = event.target.closest('button[data-digit]');
        if (button) key(button.dataset.digit);
      });
      updateDigits();
    },
    update: update,
    key: key,
    toast: toast,
    setConnection: function (value, message) {
      connected = value;
      text('connection-title', value ? 'STANDBY' : 'SIGNAL LOST');
      text('connection-copy', value ? 'The swarm needs 3 active cursors to begin.' : message || 'Reconnecting to the swarm…');
      if (state) update(state);
      else {
        nodes.standby.classList.remove('hidden');
        text('connection-title', value ? 'SYNCHRONIZING' : 'CONNECTING');
      }
      if (!value) {
        nodes.keypad.classList.add('hidden');
        nodes.victory.classList.add('hidden');
      }
    },
    codeResult: function (result) {
      text('keypad-status', result.message);
      toast(result.message, !result.ok);
      if (result.ok) digits = '';
      else window.Audio.deny();
      updateDigits();
    },
    tick: function (dt) {
      const now = performance.now();
      if (bannerUntil && now > bannerUntil - 600) nodes.banner.classList.add('fade');
      if (bannerUntil && now > bannerUntil) { nodes.banner.classList.add('hidden'); bannerUntil = 0; }
      if (toastUntil && now > toastUntil) { nodes.toast.classList.remove('show'); toastUntil = 0; }
      if (!typing && queue.length) {
        const message = queue.shift();
        Array.from(nodes['gm-log'].children).forEach(function (li) { li.classList.remove('fresh'); });
        const li = document.createElement('li');
        li.className = (['objective', 'success', 'victory'].includes(message.kind) ? message.kind + ' ' : '') + 'fresh';
        nodes['gm-log'].appendChild(li);
        while (nodes['gm-log'].children.length > 3) nodes['gm-log'].firstChild.remove();
        typing = { node: li, text: String(message.text), count: 0 };
        typeBudget = 0;
      }
      if (typing) {
        typeBudget += dt * (queue.length > 2 ? 220 : 55);
        const amount = Math.floor(typeBudget);
        typeBudget -= amount;
        typing.count += amount;
        typing.node.textContent = typing.text.slice(0, typing.count);
        if (typing.count >= typing.text.length) typing = null;
      }
      if (state && state.phase === 'victory') {
        const deadline = Number(state.transitionEndsAt);
        text('v-countdown', deadline > Date.now() ? 'NEXT CYCLE IN ' + Math.ceil((deadline - Date.now()) / 1000) + 's' : 'SIGNAL COMPLETE / R TO RECONNECT');
      }
    }
  };
}());
