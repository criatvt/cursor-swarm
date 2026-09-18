(function () {
  'use strict';

  let context;
  let master;
  let enabled = true;
  let ambientVoices = [];
  let ambientGain;
  let ambientIndex = -1;
  let lastBlip = 0;

  function unlock() {
    if (!enabled) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      if (!context) {
        context = new Context();
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 24;
        compressor.ratio.value = 8;
        master = context.createGain();
        master.gain.value = 0.3;
        master.connect(compressor);
        compressor.connect(context.destination);
      }
      if (context.state === 'suspended') context.resume().catch(function () {});
    } catch (_) {
      enabled = false;
    }
  }

  function tone(frequency, duration, type, volume, delay, endFrequency) {
    if (!enabled || !context || context.state !== 'running') return;
    const at = context.currentTime + (delay || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume || 0.12, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
    oscillator.onended = function () {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  function stopAmbient() {
    ambientVoices.forEach(function (voice) {
      voice.stop();
      voice.disconnect();
    });
    ambientVoices = [];
    if (ambientGain) ambientGain.disconnect();
    ambientGain = null;
    ambientIndex = -1;
  }

  function ambient(index) {
    if (!enabled || !context || context.state !== 'running') return;
    if (index === ambientIndex) return;
    stopAmbient();
    if (index < 0) return;
    ambientIndex = index;
    ambientGain = context.createGain();
    ambientGain.gain.setValueAtTime(0, context.currentTime);
    ambientGain.gain.linearRampToValueAtTime(0.045, context.currentTime + 1.5);
    ambientGain.connect(master);
    const root = [55, 65.41, 49, 58.27, 73.42][index] || 55;
    [root, root * 1.5].forEach(function (frequency, i) {
      const voice = context.createOscillator();
      voice.type = 'sine';
      voice.frequency.value = frequency;
      voice.detune.value = i ? 4 : -4;
      voice.connect(ambientGain);
      voice.start();
      ambientVoices.push(voice);
    });
  }

  window.Audio = {
    unlock: unlock,
    setEnabled: function (value) {
      enabled = Boolean(value);
      if (enabled) unlock();
      else stopAmbient();
      if (master) master.gain.setTargetAtTime(enabled ? 0.3 : 0, context.currentTime, 0.04);
      return enabled;
    },
    isEnabled: function () { return enabled; },
    blip: function () {
      if (performance.now() - lastBlip < 65) return;
      lastBlip = performance.now();
      tone(560, 0.09, 'sine', 0.12, 0, 240);
    },
    lit: function (index) { tone([523.25, 659.25, 783.99][index % 3], 0.24, 'triangle', 0.16); },
    deny: function () {
      tone(160, 0.2, 'sawtooth', 0.055, 0, 80);
      tone(120, 0.16, 'triangle', 0.08, 0.12, 60);
    },
    stage: function () {
      [261.63, 392, 523.25].forEach(function (note, i) { tone(note, 0.4, 'triangle', 0.13, i * 0.12); });
    },
    complete: function () {
      [392, 523.25, 659.25, 783.99].forEach(function (note, i) { tone(note, 0.55, 'sine', 0.18, i * 0.08); });
    },
    victory: function () {
      [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach(function (note, i) {
        tone(note, 1.1, 'triangle', 0.14, i * 0.14);
      });
    },
    ambient: ambient,
    silence: stopAmbient
  };
}());
