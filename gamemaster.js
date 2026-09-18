'use strict';

const STAGES = [
  { title: 'The Gathering', objective: 'Bring 75% of the swarm into the beacon. Stay together for 3 seconds.', hint: 'Proximity is a language. Speak together.' },
  { title: 'Constellation', objective: 'Three stars. Three different cursors. Click within 500 milliseconds.', hint: 'One cursor per star. Strike on the same beat.' },
  { title: 'Unveil the Truth', objective: 'Scrub away 80% of the static, then enter the revealed code.', hint: 'Move through the darkness. Your cursor is an eraser.' },
  { title: 'Equilibrium', objective: 'Split evenly across the two sectors, within ±10%. Hold for 4 seconds.', hint: 'Check the counts. Move only if your side has too many.' },
  { title: 'The Overload', objective: 'Every active cursor must press and hold the core for 2 seconds.', hint: 'No one ascends alone. Keep holding until the core opens.' }
];

class GameMaster {
  constructor(emit) {
    this.emit = emit;
    this.messages = [];
  }

  say(text, kind = 'system') {
    const message = { text, kind, at: Date.now() };
    this.messages.push(message);
    this.messages = this.messages.slice(-12);
    this.emit('gm', message);
  }

  introduce(index) {
    this.say(STAGES[index].objective, 'objective');
  }
}

module.exports = { GameMaster, STAGES };
