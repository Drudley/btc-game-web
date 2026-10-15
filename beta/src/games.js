// Server-driven puzzle UIs. The server holds the secret and decides pass/fail; the client only renders and sends inputs.
// engine: { input(body), submit(body), abort() } -> server-style responses ({done,pass,...} | {stagePassed,...} | puzzle feedback)
import { flood as floodB, maskOf } from './circuitgen.js';
const T = (k, v) => window.I18N ? window.I18N.t(k, v) : k; // 0.4.9 i18n
export const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) k === 'class' ? e.className = v : k.startsWith('on') ? e[k] = v : e.setAttribute(k, v); kids.flat().forEach(k => k != null && e.append(k)); return e; };
const svg = (w, inner) => { const d = document.createElement('div'); d.innerHTML = `<svg viewBox="0 0 100 100" class="${w}">${inner}</svg>`; return d.firstChild; };
export const SOUND = { on: true };
let actx; export function beep(kind) { if (!SOUND.on) return; try { actx ??= new AudioContext(); const t = actx.currentTime;
  const seq = { tap: [[620, 0, .045]], ok: [[523, 0, .09], [659, .08, .09], [784, .16, .16]], bad: [[196, 0, .12], [98, .1, .22]] }[kind] || [];
  for (const [f, d, len] of seq) { const o = actx.createOscillator(), g = actx.createGain(); o.type = kind === 'bad' ? 'sawtooth' : 'square'; o.frequency.value = f; g.gain.setValueAtTime(.035, t + d); g.gain.exponentialRampToValueAtTime(.0001, t + d + len); o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + len + .02); } } catch {} }
export const META = {
  password: { no: '01', tag: 'Code', name: 'Password crack', kicker: 'No repeats', title: 'Find the four-digit code.', mount: password },
  packet: { no: '02', tag: 'Timing', name: 'Packet timing', kicker: 'Uneven intervals', title: 'Tap inside the gate.', mount: packet },
  circuit: { no: '03', tag: 'Power', name: 'Circuit trace', kicker: 'Source to output', title: 'Close a clean path.', mount: circuit },
  capture: { no: '04', tag: 'Ports', name: 'Firewall capture', kicker: 'Open only for hostiles', title: 'Catch six. Leak none.', mount: capture },
  memory: { no: '05', tag: 'Dump', name: 'Memory dump', kicker: 'Grows by one', title: 'Repeat the flash, out to six.', mount: memory },
};
export const fmtClock = ms => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

// Runs a server attempt (one or more stages). onDone(finalServerResponse)
export function runAttempt(root, start, engine, onDone, label = '') {
  let over = false, cleanup = () => {}, queue = Promise.resolve();
  const finish = res => { if (over) return; over = true; cleanup(); beep(res.pass ? 'ok' : 'bad'); onDone(res); };
  const stage = (puzzle, pub, seconds, idx) => {
    cleanup(); root.innerHTML = ''; const G = META[puzzle]; let wrong = 0, raf, t0 = performance.now(), dead = false; const timers = [], keys = [], loops = [];
    const clock = h('div', { class: 'clock' }), wr = h('div', { class: 'num' }, '0'), body = h('div', { class: 'scene' }), note = h('p', { class: 'note' });
    const stageTxt = start.stages > 1 ? T('g.stage', { i: idx + 1, n: start.stages }) : '';
    root.append(h('p', { class: 'kicker' }, label + stageTxt), h('div', { class: 'scene-head' }, h('div', {}, h('p', { class: 'kicker' }, `${G.no} · ${T(`g.${puzzle}.tag`)} — ${T(`g.${puzzle}.kicker`)}`), h('h3', {}, T(`g.${puzzle}.title`))),
      h('div', { class: 'stats' }, h('div', {}, wr, h('small', {}, T('g.wrong'))), h('div', {}, clock, h('small', {}, T('g.running'))))), body, note);
    const handle = res => { if (over || dead) return res; if (res.done) { finish(res); return res; }
      if (res.stagePassed) { dead = true; beep('ok'); setTimeout(() => stage(res.puzzle, res.public, start.seconds, res.stage), 350); return res; } return res; };
    // Inputs are serialized (never dropped, never sent in parallel); once the hack is over nothing more is sent.
    const call = (fn, body) => (queue = queue.then(async () => { if (over || dead) return null; const vt = setTimeout(() => { if (!over && !dead) note.textContent = T('g.verifying'); }, 250); try { const r = await fn(body); clearTimeout(vt); if (note.textContent === T('g.verifying')) note.textContent = ''; return handle(r); } catch (e) { clearTimeout(vt); note.textContent = e.status ? e.message : T('g.net', { msg: e.message }); return null; } }));
    const api = { pub, now: () => performance.now() - t0, note: t => note.textContent = t, beep, get over() { return over || dead; },
      wrong(n = 1) { wrong += n; wr.textContent = wrong; root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); },
      input: b => call(engine.input, b), submit: b => call(engine.submit, b), loop: f => loops.push(f), after: (f, ms) => timers.push(setTimeout(() => !api.over && f(), ms)),
      key(fn) { const k = e => { if (!api.over && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) fn(e); }; keys.push(k); addEventListener('keydown', k); } };
    cleanup = () => { dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); keys.forEach(k => removeEventListener('keydown', k)); };
    let last = performance.now();
    const frame = t => { if (api.over) return; const dt = Math.min(0.05, (t - last) / 1000); last = t; const left = seconds * 1000 - (t - t0);
      clock.textContent = fmtClock(left); clock.classList.toggle('low', left < 5000);
      if (left <= 0) { if (G.onExpire) G.onExpire(api); const q = queue; dead = true; q.then(() => !over && engine.abort().then(finish, () => finish({ done: true, pass: false, reason: 'expired' }))); return; } // let an in-flight submit land first
      loops.forEach(f => !api.over && f(dt)); raf = requestAnimationFrame(frame); };
    G.mount(body, api); raf = requestAnimationFrame(frame);
  };
  stage(start.puzzle, start.public, start.left ?? start.seconds, start.stage || 0); // resumed hacks show the time actually left
  return { abort: () => { if (over) return; cleanup(); queue.then(() => over ? null : engine.abort()).then(r => r && finish(r), () => finish({ done: true, pass: false, reason: 'aborted' })); } };
}

// 01 Password: one guess per server call
function password(el, g) {
  const CS = '0123456789'.split(''); let cur = [], wrongs = 0; const slots = h('div', { class: 'slots' }), hist = h('div', { class: 'hist' }), left = h('span', { class: 'pill' });
  const keypad = h('div', { class: 'keypad' }, CS.map(c => h('button', { class: 'key', onclick: () => add(c) }, c)));
  const draw = () => { slots.innerHTML = ''; for (let i = 0; i < 4; i++) slots.append(h('div', { class: 'slot' + (cur[i] ? ' on' : '') }, cur[i] || '·'));
    left.textContent = T('g.pw.left', { n: g.pub.maxWrong - wrongs }); [...keypad.children].forEach(b => b.disabled = cur.includes(b.textContent)); };
  const add = c => { if (cur.length < 4 && !cur.includes(c)) { cur.push(c); g.beep('tap'); draw(); } };
  const del = () => { cur.pop(); draw(); };
  const submit = async () => { if (cur.length !== 4) return; const guess = cur.join(''); cur = []; draw(); const r = await g.input({ guess }); if (!r || !r.marks) return;
    hist.prepend(h('div', { class: 'row' }, [...guess].map((c, i) => h('span', { class: 'mark ' + r.marks[i] }, c))));
    if (!r.marks.every(m => m === 'exact')) { wrongs++; g.wrong(); g.beep('bad'); draw(); } };
  g.key(e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Backspace') del(); else CS.includes(e.key) && add(e.key); });
  el.append(h('p', { class: 'help' }, T('g.pw.h1'), h('span', { class: 'mark exact' }, '7'), T('g.pw.h2'), h('span', { class: 'mark near' }, '3'), T('g.pw.h3'), left),
    slots, keypad, h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: del }, T('g.delete')), h('button', { class: 'btn', onclick: submit }, T('g.submit'))), hist); draw();
}
// 02 Packet: server schedule; taps sent with ms offsets; server replays
function packet(el, g) {
  const { schedule, gate: GATE, half, need } = g.pub; const taps = [], used = new Set(); let hits = 0, sent = false;
  const track = h('div', { class: 'track' }), gate = h('div', { class: 'gate' }), bank = h('div', { class: 'bank' }); track.append(gate);
  gate.style.left = `${(GATE - half) * 100}%`; gate.style.width = `${half * 200}%`; const els = new Map();
  const drawBank = () => { bank.innerHTML = ''; for (let i = 0; i < need; i++) bank.append(h('i', { class: i < hits ? 'on' : '' })); };
  const xOf = (p, t) => -0.06 + p.v * (t - p.t) / 1000;
  g.loop(() => { const t = g.now();
    schedule.forEach((p, i) => { const x = xOf(p, t), vis = t >= p.t && x <= 1.08 && !used.has(i); let e = els.get(i);
      if (vis && !e) { e = h('div', { class: 'pkt' }); track.append(e); els.set(i, e); } if (!vis && e) { e.remove(); els.delete(i); }
      if (e) { e.style.left = `${x * 100}%`; e.classList.toggle('in', Math.abs(x - GATE) <= half); } }); });
  const send = () => { if (sent) return; sent = true; g.submit({ taps }); };
  const tap = () => { if (g.over) return; const t = g.now(); taps.push(t); let best = -1, bd = 1;
    schedule.forEach((p, i) => { if (used.has(i) || p.t > t) return; const d = Math.abs(xOf(p, t) - GATE); if (d <= half && d < bd) { bd = d; best = i; } });
    if (best < 0) { g.wrong(); g.beep('bad'); gate.classList.add('miss'); setTimeout(() => gate.classList.remove('miss'), 160); return; }
    used.add(best); hits++; g.beep('tap'); gate.classList.add('hit'); setTimeout(() => gate.classList.remove('hit'), 140); drawBank(); if (hits >= need) send(); };
  g.key(e => { if (e.code === 'Space') { e.preventDefault(); tap(); } });
  el.append(h('p', { class: 'help' }, T('g.pk.help', { n: need })), track, bank, h('button', { class: 'btn big', onclick: tap }, T('g.tap'))); drawBank();
}
// 03 Circuit: rotate locally; when the local board is solved, send final rotations
function circuit(el, g) {
  const grid = g.pub.grid.map(r => r.map(c => ({ ...c }))), src = g.pub.source, maxU = g.pub.maxUndo; const flood = () => floodB(grid, src);
  let undos = [], used = 0, sent = false; const board = h('div', { class: 'board b7' }), uinfo = h('span', { class: 'pill' });
  const lines = m => [[1, 50, 4], [2, 96, 50], [4, 50, 96], [8, 4, 50]].map(([b, x, y]) => m & b ? `<line x1="50" y1="50" x2="${x}" y2="${y}" stroke="currentColor" stroke-width="12" stroke-linecap="round"/>` : '').join('');
  const draw = () => { const f = flood(); board.innerHTML = '';
    grid.forEach((row, y) => row.forEach((c, x) => { const hot = f.on.has(x + ',' + y), m = maskOf(c);
      const inner = c.kind === 'empty' ? '' : lines(m) + (c.kind === 'ground' ? '<g stroke="currentColor" stroke-width="6"><line x1="30" y1="58" x2="70" y2="58"/><line x1="38" y1="70" x2="62" y2="70"/><line x1="46" y1="80" x2="54" y2="80"/></g>'
        : c.kind === 'source' ? '<circle cx="50" cy="50" r="18" fill="currentColor"/>' : c.kind === 'output' ? '<rect x="24" y="24" width="52" height="52" rx="6" fill="#06110c" stroke="currentColor" stroke-width="8"/><text x="50" y="58" font-size="22" text-anchor="middle" fill="currentColor">OUT</text>' : '');
      const cls = c.kind === 'ground' ? (hot ? 'short' : 'dim') : hot ? 'hot' : 'dim';
      const b = h('button', { class: `cell-t ${c.kind}`, 'aria-label': c.kind }); b.append(svg(cls, inner)); if (c.kind === 'wire') b.onclick = () => rotate(x, y); board.append(b); }));
    uinfo.textContent = T('g.ci.undos', { n: maxU - used }); return f; };
  const rotations = () => { const o = {}; grid.forEach((row, y) => row.forEach((c, x) => { if (c.kind === 'wire') o[x + ',' + y] = c.rot; })); return o; };
  const check = prev => { const f = draw(); if (f.gnd && !prev.gnd) { g.wrong(); g.beep('bad'); } if (f.out && !f.gnd && !sent) { sent = true; g.submit({ rotations: rotations() }); } };
  const rotate = (x, y) => { if (g.over) return; const prev = flood(); undos.push([x, y]); grid[y][x].rot = (grid[y][x].rot + 1) % 4; g.beep('tap'); check(prev); };
  const undo = () => { if (!undos.length || used >= maxU) return; const prev = flood(); const [x, y] = undos.pop(); used++; grid[y][x].rot = (grid[y][x].rot + 3) % 4; check(prev); };
  el.append(h('p', { class: 'help' }, T('g.ci.help'), uinfo), board, h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: undo }, T('g.undo')))); draw();
}
// 04 Capture: server schedule; gate toggles sent with ms offsets
function capture(el, g) {
  const { schedule, lanes: L, line: LINE, need } = g.pub; const toggles = [], gates = Array(L).fill(false); let caps = 0, leaks = 0, sent = false;
  const field = h('div', { class: 'field' }), cnt = h('span', { class: 'pill' }), els = new Map(), seen = new Set();
  const lanes = [...Array(L).keys()].map(i => { const lane = h('div', { class: 'lane', onclick: () => toggle(i) }), gate = h('div', { class: 'lgate btn' }, `${i + 1}`); lane.append(gate); field.append(lane); return { lane, gate }; });
  const toggle = i => { if (g.over) return; gates[i] = !gates[i]; toggles.push({ t: g.now(), lane: i }); lanes[i].gate.classList.toggle('open', gates[i]); g.beep('tap'); };
  const draw = () => cnt.textContent = T('g.ca.cnt', { c: caps, n: need, l: leaks });
  const send = () => { if (sent) return; sent = true; g.submit({ toggles }); };
  g.loop(() => { const t = g.now();
    schedule.forEach((p, i) => { if (p.t > t) return; const y = -0.08 + p.v * (t - p.t) / 1000; let e = els.get(i);
      if (y > 1.12) { if (e) { e.remove(); els.delete(i); } return; }
      if (!e && !seen.has(i)) { e = h('div', { class: 'drop ' + (p.hostile ? 'hostile' : 'friendly') }); lanes[p.lane].lane.append(e); els.set(i, e); }
      if (!e) return; e.style.top = `${y * 100}%`;
      if (!seen.has(i) && y >= LINE) { seen.add(i); if (gates[p.lane]) { if (p.hostile) { caps++; g.beep('tap'); e.classList.add('caught'); } else { leaks++; g.wrong(); g.beep('bad'); g.note(T('g.ca.leak')); send(); } } e.classList.add('gone'); draw(); if (caps >= need && !leaks) send(); } }); });
  g.key(e => { const i = +e.key - 1; if (i >= 0 && i < L) toggle(i); });
  el.append(h('p', { class: 'help' }, T('g.ca.help'), cnt), field); draw();
}
// 05 Memory: server sequences (rounds 4,5,6), one round per call. Flash timing (client only): perfect play ≈ 12 s
const MEM = { pause: 250, flash: 300, gap: 150 };
function memory(el, g) {
  const cells = [0, 1, 2, 3].map(i => h('button', { class: `mcell m${i}`, onclick: () => press(i) }, h('span', {}, String(i + 1))));
  const prog = h('span', { class: 'pill' }); let seq = g.pub.sequence, taps = [], phase = 'pause', ms = 0, cursor = 0, lit = null;
  const reset = (s, reject) => { seq = s; taps = []; cursor = 0; phase = 'pause'; ms = reject ? -200 : 0; lit = null; };
  const draw = () => { cells.forEach((c, i) => c.classList.toggle('lit', lit === i)); prog.textContent = phase === 'input' ? T('g.me.repeat', { a: taps.length, b: seq.length }) : phase === 'wait' ? T('g.me.check') : T('g.me.watch', { n: seq.length }); };
  g.loop(dt => { ms += dt * 1000;
    if (phase === 'pause' && ms >= MEM.pause) { phase = 'flash'; ms = 0; cursor = 0; lit = seq[0]; }
    else if (phase === 'flash' && ms >= MEM.flash) { lit = null; ms = 0; phase = cursor >= seq.length - 1 ? 'input' : 'gap'; }
    else if (phase === 'gap' && ms >= MEM.gap) { cursor++; phase = 'flash'; ms = 0; lit = seq[cursor]; } draw(); });
  const send = async bad => { phase = 'wait'; const r = await g.input({ taps }); if (!r || r.done) return; if (r.ok === false) { g.wrong(); g.beep('bad'); } else g.beep('tap'); reset(r.sequence, bad); };
  const press = i => { if (phase !== 'input') return; cells[i].classList.add('tap'); setTimeout(() => cells[i].classList.remove('tap'), 120); taps.push(i);
    if (seq[taps.length - 1] !== i) return send(true); g.beep('tap'); if (taps.length >= seq.length) send(false); };
  g.key(e => { const i = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key]; i != null && press(i); });
  el.append(h('p', { class: 'help' }, T('g.me.help'), prog), h('div', { class: 'mgrid' }, cells));
}
