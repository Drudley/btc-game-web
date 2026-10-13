// Five v1 puzzles, styled after the "Breach Bench" reference bench. Each reports only {pass, time, wrong};
// sim.js decides sats. Original implementation.
import { CONFIG as C } from './config.js';
import { genBoard, flood as floodB, maskOf } from './circuitgen.js';
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) k === 'class' ? e.className = v : k.startsWith('on') ? e[k] = v : e.setAttribute(k, v); kids.flat().forEach(k => k != null && e.append(k)); return e; };
const svg = (w, inner) => { const d = document.createElement('div'); d.innerHTML = `<svg viewBox="0 0 100 100" class="${w}">${inner}</svg>`; return d.firstChild; };
// Tunables (mirror the reference "Live config" defaults)
export const TUNE = { packetIntervalMs: 700, packetWindowMs: 180, packetSpeed: 0.55, captureDropSpeed: 0.28, memoryFlashMs: 400, memoryGapMs: 200, circuitFailOnGround: false, sound: true };
let actx; function beep(kind) { if (!TUNE.sound) return; try { actx ??= new AudioContext(); const t = actx.currentTime;
  const seq = { tap: [[620, 0, .045]], ok: [[523, 0, .09], [659, .08, .09], [784, .16, .16]], bad: [[196, 0, .12], [98, .1, .22]] }[kind] || [];
  for (const [f, d, len] of seq) { const o = actx.createOscillator(), g = actx.createGain(); o.type = kind === 'bad' ? 'sawtooth' : 'square'; o.frequency.value = f; g.gain.setValueAtTime(.035, t + d); g.gain.exponentialRampToValueAtTime(.0001, t + d + len); o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + len + .02); } } catch {} }
export const GAMES = [
  { id: 'password', no: '01', tag: 'Code', name: 'Password crack', kicker: 'No repeats', title: 'Find the four-symbol code.', mount: password },
  { id: 'packet', no: '02', tag: 'Timing', name: 'Packet timing', kicker: 'Uneven intervals', title: 'Tap inside the gate.', mount: packet },
  { id: 'circuit', no: '03', tag: 'Power', name: 'Circuit trace', kicker: 'Source to output', title: 'Close a clean path.', mount: circuit },
  { id: 'firewall', no: '04', tag: 'Ports', name: 'Firewall capture', kicker: 'Open only for hostiles', title: 'Catch six. Leak none.', mount: capture },
  { id: 'memory', no: '05', tag: 'Dump', name: 'Memory dump', kicker: 'Grows by one', title: 'Repeat the flash, out to six.', mount: memory },
];
export const fmtClock = ms => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
// Runs one scene with an exposed countdown. Expire = fail.
export function runGame(root, game, seconds, done) {
  seconds = Math.max(C.timer.floor, seconds);
  root.innerHTML = ''; let wrong = 0, over = false, raf, last = performance.now(), elapsed = 0; const loops = [], timers = [], keys = [];
  const clock = h('div', { class: 'clock' }), wr = h('div', { class: 'num' }, '0'), body = h('div', { class: 'scene' }), note = h('p', { class: 'note' });
  root.append(h('div', { class: 'scene-head' },
    h('div', {}, h('p', { class: 'kicker' }, `${game.no} · ${game.tag} — ${game.kicker}`), h('h3', {}, game.title)),
    h('div', { class: 'stats' }, h('div', {}, wr, h('small', {}, 'Wrong')), h('div', {}, clock, h('small', {}, 'Running')))), body, note);
  const api = {
    get over() { return over; }, note: t => note.textContent = t,
    wrong(n = 1) { if (over) return; wrong += n; wr.textContent = wrong; root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); },
    pass() { finish(true); }, fail(reason) { finish(false, reason); },
    loop(fn) { loops.push(fn); }, after(fn, ms) { timers.push(setTimeout(() => !over && fn(), ms)); },
    key(fn) { const k = e => { if (!over && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) fn(e); }; keys.push(k); addEventListener('keydown', k); }, beep,
  };
  function finish(pass, reason) { if (over) return; over = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); keys.forEach(k => removeEventListener('keydown', k)); beep(pass ? 'ok' : 'bad');
    done({ pass, time: +(elapsed / 1000).toFixed(1), wrong, reason: reason || (pass ? 'pass' : 'fail') }); }
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; elapsed += dt * 1000; const left = seconds * 1000 - elapsed;
    clock.textContent = fmtClock(left); clock.classList.toggle('low', left < 5000); if (left <= 0) return finish(false, 'expired');
    loops.forEach(f => !over && f(dt)); if (!over) raf = requestAnimationFrame(frame); }
  game.mount(body, api); raf = requestAnimationFrame(frame);
  return { abort: () => finish(false, 'aborted') };
}

// 01 Password crack: on-screen keypad, exact vs misplaced marked separately, 6 wrong submits.
function password(el, g) {
  const CS = '0123456789'.split(''), pool = [...CS], code = []; for (let i = 0; i < 4; i++) code.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  let cur = []; const slots = h('div', { class: 'slots' }), hist = h('div', { class: 'hist' }), left = h('span', { class: 'pill' });
  const keypad = h('div', { class: 'keypad' }, CS.map(c => h('button', { class: 'key', onclick: () => add(c) }, c)));
  const draw = () => { slots.innerHTML = ''; for (let i = 0; i < 4; i++) slots.append(h('div', { class: 'slot' + (cur[i] ? ' on' : '') }, cur[i] || '·'));
    left.textContent = `${6 - wrongs} wrong left`; [...keypad.children].forEach(b => b.disabled = cur.includes(b.textContent)); };
  let wrongs = 0;
  const add = c => { if (cur.length < 4 && !cur.includes(c)) { cur.push(c); g.beep('tap'); draw(); } };
  const del = () => { cur.pop(); draw(); };
  const submit = () => { if (cur.length !== 4) return; const marks = cur.map((c, i) => c === code[i] ? 'exact' : code.includes(c) ? 'near' : 'miss');
    hist.prepend(h('div', { class: 'row' }, cur.map((c, i) => h('span', { class: 'mark ' + marks[i] }, c)))); cur = [];
    if (marks.every(m => m === 'exact')) return g.pass(); wrongs++; g.wrong(); g.beep('bad'); draw(); if (wrongs >= 6) g.fail('guesses'); };
  g.key(e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Backspace') del(); else { CS.includes(e.key) && add(e.key); } });
  el.append(h('p', { class: 'help' }, 'Digits 0–9, four of them, no repeats. ', h('span', { class: 'mark exact' }, '7'), ' right symbol, right slot. ', h('span', { class: 'mark near' }, '3'), ' right symbol, wrong slot. Six wrong submits ends it. ', left),
    slots, keypad, h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: del }, 'Delete'), h('button', { class: 'btn', onclick: submit }, 'Submit')), hist); draw();
}

// 02 Packet timing: packets slide along a track at uneven intervals; tap while one is inside the gate. 5 hits; misses never clear hits.
function packet(el, g) {
  const GATE = 0.72, NEED = 5; let packets = [], spawnIn = 0.25, hits = 0, id = 0;
  const half = () => Math.max(0.03, TUNE.packetSpeed * TUNE.packetWindowMs / 2000); // gate half-width (base speed): window ≈ 155–212 ms per packet
  const track = h('div', { class: 'track' }), gate = h('div', { class: 'gate' }), bank = h('div', { class: 'bank' });
  track.append(gate); const drawBank = () => { bank.innerHTML = ''; for (let i = 0; i < NEED; i++) bank.append(h('i', { class: i < hits ? 'on' : '' })); };
  g.loop(dt => { spawnIn -= dt; if (spawnIn <= 0) { let v = TUNE.packetSpeed * (0.85 + Math.random() * 0.3); const prev = packets.at(-1);
      if (prev && v > prev.v) { const catchT = (prev.x + 0.06) / (v - prev.v), exitT = (1.08 - prev.x) / prev.v; if (catchT < exitT) v = prev.v; } // never overtake
      packets.push({ id: id++, x: -0.06, v, el: h('div', { class: 'pkt' }) }); track.append(packets.at(-1).el); spawnIn = TUNE.packetIntervalMs / 1000 * (0.8 + Math.random() * 0.5); }
    const w = half(); gate.style.left = `${(GATE - w) * 100}%`; gate.style.width = `${w * 200}%`;
    for (const p of packets) { p.x += p.v * dt; p.el.style.left = `${p.x * 100}%`; p.el.classList.toggle('in', Math.abs(p.x - GATE) <= w); if (p.x > 1.08) p.el.remove(); }
    packets = packets.filter(p => p.x <= 1.08); });
  const tap = () => { const w = half(); let best = null; for (const p of packets) if (Math.abs(p.x - GATE) <= w && (!best || Math.abs(p.x - GATE) < Math.abs(best.x - GATE))) best = p;
    if (!best) { g.wrong(); g.beep('bad'); gate.classList.add('miss'); setTimeout(() => gate.classList.remove('miss'), 160); return; }
    best.el.remove(); packets = packets.filter(p => p !== best); hits++; g.beep('tap'); gate.classList.add('hit'); setTimeout(() => gate.classList.remove('hit'), 140); drawBank(); if (hits >= NEED) g.pass(); };
  g.key(e => { if (e.code === 'Space') { e.preventDefault(); tap(); } });
  el.append(h('p', { class: 'help' }, `Tap while a packet is inside the gate. Packets vary in speed. Bank ${NEED} hits. Space also taps. A miss never clears hits already banked.`), track, bank, h('button', { class: 'btn big', onclick: tap }, 'Tap')); drawBank();
}

// 03 Circuit trace: generated 7×7 board (always solvable), source on the left edge, OUT on the right, 3 grounds; tap wires to rotate. 12 undos.
const CN = 7, UNDOS = 12;
function circuit(el, g) {
  const B = genBoard(CN, { grounds: 3 }), grid = B.grid, flood = () => floodB(grid, B.source);
  let undos = [], used = 0; const board = h('div', { class: 'board b7' }), uinfo = h('span', { class: 'pill' });
  const lines = m => [[1, 50, 4], [2, 96, 50], [4, 50, 96], [8, 4, 50]].map(([b, x, y]) => m & b ? `<line x1="50" y1="50" x2="${x}" y2="${y}" stroke="currentColor" stroke-width="12" stroke-linecap="round"/>` : '').join('');
  const draw = () => { const f = flood(); board.innerHTML = '';
    grid.forEach((row, y) => row.forEach((c, x) => { const hot = f.on.has(x + ',' + y), m = maskOf(c);
      const inner = c.kind === 'empty' ? '' : lines(m) + (c.kind === 'ground' ? '<g stroke="currentColor" stroke-width="6"><line x1="30" y1="58" x2="70" y2="58"/><line x1="38" y1="70" x2="62" y2="70"/><line x1="46" y1="80" x2="54" y2="80"/></g>'
        : c.kind === 'source' ? '<circle cx="50" cy="50" r="18" fill="currentColor"/>' : c.kind === 'output' ? '<rect x="24" y="24" width="52" height="52" rx="6" fill="#06110c" stroke="currentColor" stroke-width="8"/><text x="50" y="58" font-size="22" text-anchor="middle" fill="currentColor">OUT</text>' : '');
      const cls = c.kind === 'ground' ? (hot ? 'short' : 'dim') : hot ? 'hot' : 'dim';
      const b = h('button', { class: `cell-t ${c.kind}`, 'aria-label': c.kind }); b.append(svg(cls, inner)); if (c.kind === 'wire') b.onclick = () => rotate(x, y); board.append(b); }));
    uinfo.textContent = `${UNDOS - used} undos left`; return f; };
  const check = prev => { const f = draw(); if (f.gnd && !prev.gnd) { g.wrong(); g.beep('bad'); if (TUNE.circuitFailOnGround) return g.fail('short'); } if (f.out && !f.gnd) g.pass(); };
  const rotate = (x, y) => { const prev = flood(); undos.push([x, y]); grid[y][x].rot = (grid[y][x].rot + 1) % 4; g.beep('tap'); check(prev); };
  const undo = () => { if (!undos.length || used >= UNDOS) return; const prev = flood(); const [x, y] = undos.pop(); used++; grid[y][x].rot = (grid[y][x].rot + 3) % 4; check(prev); };
  el.append(h('p', { class: 'help' }, 'Tap a wire to rotate it. Power the OUT block from the source (left edge) without powering an amber ground. A short counts as a wrong input. ', uinfo), board,
    h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: undo }, 'Undo'))); draw();
}

// 04 Firewall capture: packets drop down 5 lanes at ±15% speed each; toggle each lane's gate. Hostile through an open gate = capture; friendly = leak (attempt can't pass).
function capture(el, g) {
  const NEED = 6, LINE = 0.86; let packets = [], spawnIn = 0.3, caps = 0, leaks = 0; const L = 5, gates = Array(L).fill(false);
  const field = h('div', { class: 'field' }), cnt = h('span', { class: 'pill' });
  const lanes = [...Array(L).keys()].map(i => { const lane = h('div', { class: 'lane', onclick: () => toggle(i) }), gate = h('div', { class: 'lgate btn' }, `${i + 1}`); lane.append(gate); field.append(lane); return { lane, gate }; });
  const toggle = i => { gates[i] = !gates[i]; lanes[i].gate.classList.toggle('open', gates[i]); g.beep('tap'); };
  const draw = () => cnt.textContent = `Captured ${caps}/${NEED} · Leaks ${leaks}`;
  g.loop(dt => { spawnIn -= dt; if (spawnIn <= 0) { const busy = new Set(packets.filter(p => p.y < 0.28).map(p => p.lane)); const free = [...Array(L).keys()].filter(l => !busy.has(l));
      if (free.length) { const lane = free[Math.floor(Math.random() * free.length)], p = { lane, y: -0.08, v: TUNE.captureDropSpeed * (0.85 + Math.random() * 0.3), hostile: Math.random() < 0.55, el: h('div', { class: 'drop' }) };
        p.el.classList.add(p.hostile ? 'hostile' : 'friendly'); lanes[lane].lane.append(p.el); packets.push(p); spawnIn = 0.5 + Math.random() * 0.6; } else spawnIn = 0.08; }
    for (const p of packets) { p.y += p.v * dt; p.el.style.top = `${p.y * 100}%`;
      if (!p.done && p.y >= LINE) { p.done = true; if (gates[p.lane]) { if (p.hostile) { caps++; g.beep('tap'); p.el.classList.add('caught'); }
          else { leaks++; g.wrong(); g.beep('bad'); g.note('A friendly packet got through. This attempt can no longer pass.'); } } p.el.classList.add('gone'); draw(); } }
    packets = packets.filter(p => { if (p.y > 1.12) { p.el.remove(); return false; } return true; });
    if (caps >= NEED && leaks === 0) g.pass(); });
  g.key(e => { const i = +e.key - 1; if (i >= 0 && i < L) toggle(i); });
  el.append(h('p', { class: 'help' }, 'Open a lane gate (tap or keys 1–5) only for red hostiles. Catch six. Let any green friendly through and the attempt can’t pass. ', cnt), field); draw();
}

// 05 Memory dump: 4 cells flash a sequence; repeat it. Length 3 → 6. Wrong tap = wrong input, new sequence of the same length. Taps during flash ignored.
function memory(el, g) {
  const cells = [0, 1, 2, 3].map(i => h('button', { class: `mcell m${i}`, onclick: () => press(i) }, h('span', {}, String(i + 1))));
  const prog = h('span', { class: 'pill' }); let len = 3, seq = [], inputAt = 0, phase = 'pause', ms = 0, cursor = 0, lit = null;
  const newSeq = n => Array.from({ length: n }, () => Math.floor(Math.random() * 4));
  const reset = (n, reject) => { len = n; seq = newSeq(n); inputAt = 0; cursor = 0; phase = 'pause'; ms = reject ? -200 : 0; lit = null; };
  const draw = () => { cells.forEach((c, i) => c.classList.toggle('lit', lit === i)); prog.textContent = phase === 'input' ? `Repeat ${inputAt}/${len}` : `Watch · length ${len} of 6`; };
  g.loop(dt => { ms += dt * 1000;
    if (phase === 'pause' && ms >= 320) { phase = 'flash'; ms = 0; cursor = 0; lit = seq[0]; }
    else if (phase === 'flash' && ms >= TUNE.memoryFlashMs) { lit = null; ms = 0; phase = cursor >= seq.length - 1 ? 'input' : 'gap'; }
    else if (phase === 'gap' && ms >= TUNE.memoryGapMs) { cursor++; phase = 'flash'; ms = 0; lit = seq[cursor]; } draw(); });
  const press = i => { if (phase !== 'input') return; cells[i].classList.add('tap'); setTimeout(() => cells[i].classList.remove('tap'), 120);
    if (seq[inputAt] !== i) { g.wrong(); g.beep('bad'); return reset(len, true); }
    g.beep('tap'); if (++inputAt >= len) { if (len >= 6) return g.pass(); reset(len + 1); } };
  g.key(e => { const i = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key]; i != null && press(i); });
  reset(3); el.append(h('p', { class: 'help' }, 'Repeat the flash. Grows by one each round, pass at six. Keys 1–4 match the cells. Taps during the flash are ignored. ', prog), h('div', { class: 'mgrid' }, cells));
}
