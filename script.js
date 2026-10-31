'use strict';

const $ = id => document.getElementById(id);
const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const missionPrograms = [
  ['FFRFF', 'FFLFF', 'FRFFF', 'FFFRF', 'FFFLF', 'FLFFF'],
  ['FFRFLF', 'FFLFRF', 'FRFFLF', 'FLFFRF', 'FFRFFF', 'FFLFFF', 'FRFFRF', 'FLFFLF'],
  ['FFRFFLF', 'FFLFFRF', 'FRFFRFF', 'FLFFLFF', 'FFFRFLF', 'FFFLFRF', 'FRFFF LF'.replace(/ /g, ''), 'FLFFF RF'.replace(/ /g, '')]
];

const configs = [
  { n: 7, slots: 5 },
  { n: 9, slots: 6 },
  { n: 11, slots: 7 }
];

function pathFromProgram(commands) {
  let x = 0, y = 0, dir = 1;
  const points = [[x, y]];
  const seen = new Set(['0,0']);

  for (const c of commands) {
    if (c === 'R') {
      dir = (dir + 1) % 4;
    } else if (c === 'L') {
      dir = (dir + 3) % 4;
    } else if (c === 'F') {
      x += dirs[dir][0];
      y += dirs[dir][1];

      if (seen.has(`${x},${y}`)) return null;

      seen.add(`${x},${y}`);
      points.push([x, y]);
    }
  }

  return points.length >= 4 ? points : null;
}

let level = 0;
let score = 0;
let elapsed = 0;
let started = 0;
let player = '';
let program = [];
let color = 'any';
let map;
let rocket;
let initial;
let playing = false;
let halt = false;
let clock = null;
let used = new Set();
let attempts = 0;
let selectedSlot = 0;

const wait = ms => new Promise(r => setTimeout(r, ms));

function solutionFor(p) {
  const instructions = [];

  let heading = dirs.findIndex(
    ([dx, dy]) => p[0][0] + dx === p[1][0] && p[0][1] + dy === p[1][1]
  );

  for (let i = 1; i < p.length; i++) {
    const next = dirs.findIndex(
      ([dx, dy]) =>
        p[i - 1][0] + dx === p[i][0] &&
        p[i - 1][1] + dy === p[i][1]
    );

    if (next < 0) throw Error('Non-adjacent path');

    const delta = (next - heading + 4) % 4;

    if (delta === 1) instructions.push('R');
    if (delta === 3) instructions.push('L');
    if (delta === 2) instructions.push('R', 'R');

    instructions.push('F');
    heading = next;
  }

  return instructions;
}

function generate() {
  const cfg = configs[level];

  const options = missionPrograms[level]
    .map((commands, i) => ({
      commands,
      i,
      p: pathFromProgram(commands)
    }))
    .filter(o => o.p && o.commands.length <= cfg.slots);

  if (!options.length) {
    throw Error('No valid missions for level ' + level);
  }

  let pool = options.filter(o => !used.has(`${level}-${o.i}`));
  if (!pool.length) pool = options;

  const pick = pool[Math.floor(Math.random() * pool.length)];
  used.add(`${level}-${pick.i}`);

  let p = pick.p.map(v => [...v]);

  const flip = Math.random() < .5;
  const turn = Math.floor(Math.random() * 4);

  p = p.map(([x, y]) => {
    if (flip) x = -x;

    for (let t = 0; t < turn; t++) {
      [x, y] = [-y, x];
    }

    return [x, y];
  });

  const minx = Math.min(...p.map(v => v[0]));
  const miny = Math.min(...p.map(v => v[1]));

  p = p.map(([x, y]) => [x - minx, y - miny]);

  const width = Math.max(...p.map(v => v[0])) + 1;
  const height = Math.max(...p.map(v => v[1])) + 1;

  if (width > cfg.n || height > cfg.n) {
    throw Error('Board too small');
  }

  const ox = Math.floor((cfg.n - width) / 2);
  const oy = Math.floor((cfg.n - height) / 2);

  p = p.map(([x, y]) => [x + ox, y + oy]);

  const tiles = new Map();

  p.forEach(([x, y], i) => {
    tiles.set(`${x},${y}`, ['g', 'b', 'r'][(i + pick.i) % 3]);
  });

  const a = p[0];
  const b = p[1];

  const dir = dirs.findIndex(
    ([dx, dy]) => a[0] + dx === b[0] && a[1] + dy === b[1]
  );

  map = {
    n: cfg.n,
    p,
    tiles,
    goal: p.at(-1)
  };

  initial = { x: a[0], y: a[1], dir };
  rocket = { ...initial };

  const verified = solutionFor(p);

  if (verified.length > cfg.slots) {
    throw Error('Mission exceeded slot budget');
  }

  program = Array(cfg.slots).fill(null);
  selectedSlot = 0;
  attempts = 0;

  render();

  $('trace').textContent =
    'Select a slot, choose a command, and press RUN.';
}

function render() {
  const b = $('board');
  b.style.setProperty('--n', map.n);
  b.innerHTML = '';

  for (let y = 0; y < map.n; y++) {
    for (let x = 0; x < map.n; x++) {
      const d = document.createElement('div');
      const c = map.tiles.get(`${x},${y}`);

      d.className = `tile ${c || ''}`;

      if (x === map.goal[0] && y === map.goal[1]) {
        d.classList.add('goal');
      }

      if (x === rocket.x && y === rocket.y) {
        d.classList.add('rocket');
        d.style.setProperty('--rot', `${rocket.dir * 90 - 90}deg`);
      }

      b.append(d);
    }
  }

  $('level').textContent = `${level + 1} / 3`;
  $('score').textContent = String(score).padStart(4, '0');
  $('mission').textContent = `MISSION 0${level + 1}`;

  $('hint').textContent =
    level === 0
      ? 'Reach the star by programming F0.'
      : level === 1
        ? 'Use a short function to navigate the turns.'
        : 'Use color conditions and function calls to reach the goal.';

  renderSlots();
}

function renderSlots() {
  const slots = $('slots');
  slots.innerHTML = '';

  const cap = configs[level].slots;

  $('capacity').textContent =
    `${program.filter(Boolean).length} / ${cap}`;

  for (let i = 0; i < cap; i++) {
    const el = document.createElement('button');
    const cmd = program[i];

    el.className =
      'slot' +
      (cmd ? ' filled' : '') +
      (i === selectedSlot ? ' selected' : '');

    el.setAttribute('aria-label', `Command slot ${i + 1}`);

    if (cmd) {
      el.dataset.color = cmd.color;
      el.innerHTML =
        `${{ F: '↑', L: '↶', R: '↷', 0: 'f0' }[cmd.cmd]}` +
        `<small>${cmd.color === 'any' ? 'ANY' : cmd.color.toUpperCase()}</small>`;
    } else {
      el.textContent = '+';
    }

    el.onclick = () => {
      if (playing) return;
      selectedSlot = i;
      renderSlots();
    };

    slots.append(el);
  }
}

function setBusy(v) {
  playing = v;
  $('run').disabled = v;

  document.querySelectorAll('[data-cmd]').forEach(b => {
    b.disabled = v;
  });

  $('clear').disabled = v;
}

function stop() {
  halt = true;
  setBusy(false);
}

function message(title, desc, eyebrow, button, callback) {
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = desc;
  $('overlayEyebrow').textContent = eyebrow;
  $('continue').textContent = button;

  $('continue').onclick = () => {
    $('overlay').hidden = true;
    callback();
  };

  $('overlay').hidden = false;
}

async function execute() {
  if (playing || !program.some(Boolean)) return;

  halt = false;
  setBusy(true);

  rocket = { ...initial };
  render();

  let pc = 0;
  let stack = [];
  let steps = 0;

  const maxSteps = 150;

  while (!halt && steps < maxSteps) {
    if (pc >= program.length) {
      if (stack.length) {
        pc = stack.pop();
        continue;
      }

      break;
    }

    const ins = program[pc++];
    if (!ins) continue;

    steps++;

    const tileColor = map.tiles.get(`${rocket.x},${rocket.y}`);

    if (ins.color !== 'any' && ins.color !== tileColor) {
      continue;
    }

    if (ins.cmd === '0') {
      if (stack.length >= 12) {
        $('trace').textContent = 'Recursion limit reached';
        break;
      }

      stack.push(pc);
      pc = 0;
      continue;
    }

    if (ins.cmd === 'L') {
      rocket.dir = (rocket.dir + 3) % 4;
    }

    if (ins.cmd === 'R') {
      rocket.dir = (rocket.dir + 1) % 4;
    }

    if (ins.cmd === 'F') {
      rocket.x += dirs[rocket.dir][0];
      rocket.y += dirs[rocket.dir][1];

      if (!map.tiles.has(`${rocket.x},${rocket.y}`)) {
        render();
        $('trace').textContent = 'CRASH — rocket left the path';
        break;
      }
    }

    render();

    $('trace').textContent =
      `STEP ${steps}  •  ${
        ins.cmd === 'F'
          ? 'FORWARD'
          : ins.cmd === 'L'
            ? 'TURN LEFT'
            : 'TURN RIGHT'
      }  •  ${ins.color.toUpperCase()}`;

    await wait(240);

    if (rocket.x === map.goal[0] && rocket.y === map.goal[1]) {
      setBusy(false);

      score += Math.max(
        150,
        800 - level * 50 - attempts * 70 - Math.floor(elapsed / 4)
      );

      render();

      if (level === 2) {
        save();

        message(
          'MISSION COMPLETE!',
          'All three missions cleared. Final score: ' +
            score +
            ' • Time: ' +
            fmt(elapsed),
          'IEEE CHAMPION',
          'NEW PLAYER',
          resetAll
        );
      } else {
        message(
          'LEVEL COMPLETE!',
          'Great logic. Ready for the next challenge?',
          'MISSION SUCCESS',
          'NEXT LEVEL',
          () => {
            level++;
            generate();
          }
        );
      }

      return;
    }
  }

  if (halt) return;

  setBusy(false);
  attempts++;

  if (steps >= maxSteps) {
    $('trace').textContent = 'Execution limit reached';
  } else if (
    rocket.x === map.goal[0] &&
    rocket.y === map.goal[1]
  ) {
    return;
  } else if (!$('trace').textContent.startsWith('CRASH')) {
    $('trace').textContent =
      'Program ended before reaching the star. Edit and retry.';
  }

  // Return to the starting position after a failed attempt.
  rocket = { ...initial };
  render();
}

function fmt(s) {
  return (
    `${String(Math.floor(s / 60)).padStart(2, '0')}:` +
    `${String(s % 60).padStart(2, '0')}`
  );
}

function leaders() {
  let data = [];

  try {
    data = JSON.parse(
      localStorage.getItem('ieee-code-challenge-v1') || '[]'
    );
  } catch {}

  return data;
}

function save() {
  const list = leaders();

  list.push({
    name: player,
    score,
    time: elapsed
  });

  list.sort((a, b) => b.score - a.score || a.time - b.time);

  try {
    localStorage.setItem(
      'ieee-code-challenge-v1',
      JSON.stringify(list.slice(0, 10))
    );
  } catch {}
}

function showLeaders() {
  const rows = leaders();

  $('leadersWelcome').innerHTML = rows.length
    ? rows.map((v, i) =>
        `<div class="leader"><span>${i + 1}. ${escapeHtml(v.name)}</span>` +
        `<span>${v.score} · ${fmt(v.time)}</span></div>`
      ).join('')
    : '<p>No scores yet. Be the first champion!</p>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function resetAll() {
  stop();
  clearInterval(clock);
  $('app').hidden = true;
  $('welcome').hidden = false;
  showLeaders();
}

$('start').onclick = () => {
  player = $('player').value.trim().slice(0, 24);

  if (!player) {
    $('player').focus();
    return;
  }

  level = 0;
  score = 0;
  elapsed = 0;
  used.clear();

  $('who').textContent = player;
  $('welcome').hidden = true;
  $('app').hidden = false;

  generate();

  $('trace').textContent = 'Ready to run';

  clearInterval(clock);

  clock = setInterval(() => {
    $('time').textContent = fmt(++elapsed);
  }, 1000);
};

document.querySelectorAll('[data-cmd]').forEach(b => {
  b.onclick = () => {
    if (playing) return;

    program[selectedSlot] = {
      cmd: b.dataset.cmd,
      color
    };

    selectedSlot = Math.min(selectedSlot + 1, program.length - 1);
    renderSlots();
  };
});

document.querySelectorAll('[data-color]').forEach(b => {
  b.onclick = () => {
    color = b.dataset.color;

    document.querySelectorAll('[data-color]').forEach(x => {
      x.classList.toggle('active', x === b);
    });
  };
});

document.addEventListener('keydown', e => {
  if (
    playing ||
    $('app').hidden ||
    $('overlay').hidden === false
  ) {
    return;
  }

  if (
    (e.key === 'Delete' || e.key === 'Backspace') &&
    document.activeElement.tagName !== 'INPUT'
  ) {
    program[selectedSlot] = null;
    renderSlots();
  }
});

$('clear').onclick = () => {
  if (!playing) {
    program.fill(null);
    selectedSlot = 0;
    renderSlots();
  }
};

$('run').onclick = execute;
$('stop').onclick = stop;

$('restart').onclick = () => {
  message(
    'END SESSION?',
    'Return to the player registration screen.',
    'CONFIRM',
    'YES, END SESSION',
    resetAll
  );
};

showLeaders();'use strict';
const $ = id => document.getElementById(id), dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// Curated, independently validated missions: short, playable, and non-repeating per session.
// Every template is an explicit solution; its transformed board preserves solvability.
const missionPrograms = [
  ['FFRFF', 'FFLFF', 'FRFFF', 'FFFRF', 'FFFLF', 'FLFFF'],
  ['FFRFLF', 'FFLFRF', 'FRFFLF', 'FLFFRF', 'FFRFFF', 'FFLFFF', 'FRFFRF', 'FLFFLF'],
  ['FFRFFLF', 'FFLFFRF', 'FRFFRFF', 'FLFFLFF', 'FFFRFLF', 'FFFLFRF', 'FRFFF LF'.replace(/ /g, ''), 'FLFFF RF'.replace(/ /g, '')]
];
const configs = [{ n: 7, slots: 5 }, { n: 9, slots: 6 }, { n: 11, slots: 7 }];
function pathFromProgram(commands) {
  let x = 0, y = 0, dir = 1; const points = [[x, y]], seen = new Set(['0,0']);
  for (const c of commands) {
    if (c === 'R') dir = (dir + 1) % 4;
    else if (c === 'L') dir = (dir + 3) % 4;
    else if (c === 'F') {
      x += dirs[dir][0]; y += dirs[dir][1];
      if (seen.has(`${x},${y}`)) return null;
      seen.add(`${x},${y}`); points.push([x, y]);
    }
  }
  return points.length >= 4 ? points : null;
}
let level = 0, score = 0, elapsed = 0, started = 0, player = '', program = [], color = 'any', map, rocket, initial, playing = false, halt = false, clock = null, used = new Set(), attempts = 0, selectedSlot = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
function solutionFor(p) {
  const instructions = [];
  let heading = dirs.findIndex(([dx, dy]) => p[0][0] + dx === p[1][0] && p[0][1] + dy === p[1][1]);
  for (let i = 1; i < p.length; i++) {
    const next = dirs.findIndex(([dx, dy]) => p[i - 1][0] + dx === p[i][0] && p[i - 1][1] + dy === p[i][1]);
    if (next < 0) throw Error('Non-adjacent path');
    const delta = (next - heading + 4) % 4;
    if (delta === 1) instructions.push('R');
    if (delta === 3) instructions.push('L');
    if (delta === 2) instructions.push('R', 'R');
    instructions.push('F'); heading = next;
  }
  return instructions;
}
function generate() {
  const cfg = configs[level];
  const options = missionPrograms[level].map((commands, i) => ({ commands, i, p: pathFromProgram(commands) }))
    .filter(o => o.p && o.commands.length <= cfg.slots);
  if (!options.length) throw Error('No valid missions for level ' + level);
  let pool = options.filter(o => !used.has(`${level}-${o.i}`));
  if (!pool.length) pool = options;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  used.add(`${level}-${pick.i}`);
  let p = pick.p.map(v => [...v]);
  const flip = Math.random() < .5, turn = Math.floor(Math.random() * 4);
  p = p.map(([x, y]) => { if (flip) x = -x; for (let t = 0; t < turn; t++) [x, y] = [-y, x]; return [x, y] });
  const minx = Math.min(...p.map(v => v[0])), miny = Math.min(...p.map(v => v[1]));
  p = p.map(([x, y]) => [x - minx, y - miny]);
  const width = Math.max(...p.map(v => v[0])) + 1, height = Math.max(...p.map(v => v[1])) + 1;
  if (width > cfg.n || height > cfg.n) throw Error('Board too small');
  const ox = Math.floor((cfg.n - width) / 2), oy = Math.floor((cfg.n - height) / 2);
  p = p.map(([x, y]) => [x + ox, y + oy]);
  const tiles = new Map(); p.forEach(([x, y], i) => tiles.set(`${x},${y}`, ['g', 'b', 'r'][(i + pick.i) % 3]));
  const a = p[0], b = p[1], dir = dirs.findIndex(([dx, dy]) => a[0] + dx === b[0] && a[1] + dy === b[1]);
  map = { n: cfg.n, p, tiles, goal: p.at(-1) };
  initial = { x: a[0], y: a[1], dir }; rocket = { ...initial };
  const verified = solutionFor(p);
  if (verified.length > cfg.slots) throw Error('Mission exceeded slot budget');
  program = Array(cfg.slots).fill(null); selectedSlot = 0; attempts = 0; render();
  $('trace').textContent = 'Select a slot, choose a command, and press RUN.';
}
function render() { const b = $('board'); b.style.setProperty('--n', map.n); b.innerHTML = ''; for (let y = 0; y < map.n; y++)for (let x = 0; x < map.n; x++) { const d = document.createElement('div'); const c = map.tiles.get(`${x},${y}`); d.className = `tile ${c || ''}`; if (x === map.goal[0] && y === map.goal[1]) d.classList.add('goal'); if (x === rocket.x && y === rocket.y) { d.classList.add('rocket'); d.style.setProperty('--rot', `${rocket.dir * 90 - 90}deg`) } b.append(d) } $('level').textContent = `${level + 1} / 3`; $('score').textContent = String(score).padStart(4, '0'); $('mission').textContent = `MISSION 0${level + 1}`; $('hint').textContent = level === 0 ? 'Reach the star by programming F0.' : level === 1 ? 'Use a short function to navigate the turns.' : 'Use color conditions and function calls to reach the goal.'; renderSlots(); }
function renderSlots() {
  const slots = $('slots'); slots.innerHTML = '';
  const cap = configs[level].slots;
  $('capacity').textContent = `${program.filter(Boolean).length} / ${cap}`;
  for (let i = 0; i < cap; i++) {
    const el = document.createElement('button'); const cmd = program[i];
    el.className = 'slot' + (cmd ? ' filled' : '') + (i === selectedSlot ? ' selected' : '');
    el.setAttribute('aria-label', `Command slot ${i + 1}`);
    if (cmd) { el.dataset.color = cmd.color; el.innerHTML = `${{ F: '↑', L: '↶', R: '↷', 0: 'f0' }[cmd.cmd]}<small>${cmd.color === 'any' ? 'ANY' : cmd.color.toUpperCase()}</small>` }
    else el.textContent = '+';
    el.onclick = () => { if (playing) return; selectedSlot = i; renderSlots() };
    slots.append(el);
  }
}
function setBusy(v) { playing = v; $('run').disabled = v; document.querySelectorAll('[data-cmd]').forEach(b => b.disabled = v); $('clear').disabled = v; }
function stop() { halt = true; setBusy(false) }
function message(title, desc, eyebrow, button, callback) { $('overlayTitle').textContent = title; $('overlayText').textContent = desc; $('overlayEyebrow').textContent = eyebrow; $('continue').textContent = button; $('continue').onclick = () => { $('overlay').hidden = true; callback() }; $('overlay').hidden = false; }
async function execute() { if (playing || !program.some(Boolean)) return; halt = false; setBusy(true); rocket = { ...initial }; render(); let pc = 0, stack = [], steps = 0; const maxSteps = 150; while (!halt && steps < maxSteps) { if (pc >= program.length) { if (stack.length) { pc = stack.pop(); continue } break } const ins = program[pc++]; if (!ins) continue; steps++; const tileColor = map.tiles.get(`${rocket.x},${rocket.y}`); if (ins.color !== 'any' && ins.color !== tileColor) continue; if (ins.cmd === '0') { if (stack.length >= 12) { $('trace').textContent = 'Recursion limit reached'; break } stack.push(pc); pc = 0; continue } if (ins.cmd === 'L') rocket.dir = (rocket.dir + 3) % 4; if (ins.cmd === 'R') rocket.dir = (rocket.dir + 1) % 4; if (ins.cmd === 'F') { rocket.x += dirs[rocket.dir][0]; rocket.y += dirs[rocket.dir][1]; if (!map.tiles.has(`${rocket.x},${rocket.y}`)) { render(); $('trace').textContent = 'CRASH — rocket left the path'; break } } render(); $('trace').textContent = `STEP ${steps}  •  ${ins.cmd === 'F' ? 'FORWARD' : ins.cmd === 'L' ? 'TURN LEFT' : 'TURN RIGHT'}  •  ${ins.color.toUpperCase()}`; await wait(240); if (rocket.x === map.goal[0] && rocket.y === map.goal[1]) { setBusy(false); score += Math.max(150, 800 - level * 50 - attempts * 70 - Math.floor(elapsed / 4)); render(); if (level === 2) { save(); message('MISSION COMPLETE!', 'All three missions cleared. Final score: ' + score + ' • Time: ' + fmt(elapsed), 'IEEE CHAMPION', 'NEW PLAYER', resetAll) } else message('LEVEL COMPLETE!', 'Great logic. Ready for the next challenge?', 'MISSION SUCCESS', 'NEXT LEVEL', () => { level++; generate() }); return } } if (halt) return; setBusy(false); attempts++; if (steps >= maxSteps) $('trace').textContent = 'Execution limit reached'; else if (rocket.x === map.goal[0] && rocket.y === map.goal[1]) return; else if (!$('trace').textContent.startsWith('CRASH')) $('trace').textContent = 'Program ended before reaching the star. Edit and retry.' }
function fmt(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
function leaders() { let data = []; try { data = JSON.parse(localStorage.getItem('ieee-code-challenge-v1') || '[]') } catch { } return data }
function save() { const list = leaders(); list.push({ name: player, score, time: elapsed }); list.sort((a, b) => b.score - a.score || a.time - b.time); try { localStorage.setItem('ieee-code-challenge-v1', JSON.stringify(list.slice(0, 10))) } catch { } }
function showLeaders() { const rows = leaders(); $('leadersWelcome').innerHTML = rows.length ? rows.map((v, i) => `<div class="leader"><span>${i + 1}. ${escapeHtml(v.name)}</span><span>${v.score} · ${fmt(v.time)}</span></div>`).join('') : '<p>No scores yet. Be the first champion!</p>' }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
function resetAll() { stop(); clearInterval(clock); $('app').hidden = true; $('welcome').hidden = false; showLeaders() }
$('start').onclick = () => { player = $('player').value.trim().slice(0, 24); if (!player) { $('player').focus(); return } level = 0; score = 0; elapsed = 0; used.clear(); $('who').textContent = player; $('welcome').hidden = true; $('app').hidden = false; generate(); $('trace').textContent = 'Ready to run'; clearInterval(clock); clock = setInterval(() => { $('time').textContent = fmt(++elapsed) }, 1000) };
document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => { if (playing) return; program[selectedSlot] = { cmd: b.dataset.cmd, color }; selectedSlot = Math.min(selectedSlot + 1, program.length - 1); renderSlots() });
document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; document.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('active', x === b)) });
document.addEventListener('keydown', e => { if (playing || $('app').hidden || $('overlay').hidden === false) return; if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'INPUT') { program[selectedSlot] = null; renderSlots() } }); $('clear').onclick = () => { if (!playing) { program.fill(null); selectedSlot = 0; renderSlots() } }; $('run').onclick = execute; $('stop').onclick = stop; $('restart').onclick = () => message('END SESSION?', 'Return to the player registration screen.', 'CONFIRM', 'YES, END SESSION', resetAll); showLeaders();
