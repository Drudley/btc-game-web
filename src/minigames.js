// Five v1 puzzles. Each reports only {pass, time, wrong}; the "server" (sim.js) decides sats.
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, attrs); kids.forEach(k => e.append(k)); return e; };
export const GAMES = [
  { id: 'password', name: 'Password crack', mount: password },
  { id: 'packet', name: 'Packet timing', mount: packet },
  { id: 'circuit', name: 'Circuit trace', mount: circuit },
  { id: 'firewall', name: 'Firewall capture', mount: firewallCap },
  { id: 'memory', name: 'Memory-dump sequence', mount: memory },
];
// Runs one puzzle with an exposed timer. Expire = fail.
export function runGame(root, game, seconds, done) {
  root.innerHTML = ''; const t0 = performance.now(); let wrong = 0, over = false, timers = [];
  const bar = h('div', { className: 'timer' }), body = h('div', { className: 'game' });
  root.append(h('h3', {}, game.name), bar, body);
  const finish = pass => { if (over) return; over = true; timers.forEach(clearInterval); timers.forEach(clearTimeout); cancelAnimationFrame(raf);
    done({ pass, time: +((performance.now() - t0) / 1000).toFixed(1), wrong }); };
  let raf; const tick = () => { const left = seconds - (performance.now() - t0) / 1000; bar.textContent = `⏱ ${Math.max(0, left).toFixed(1)}s`; bar.style.setProperty('--p', Math.max(0, left / seconds)); if (left <= 0) return finish(false); if (!over) raf = requestAnimationFrame(tick); }; tick();
  game.mount(body, { pass: () => finish(true), fail: () => finish(false), wrong: () => wrong++, every: (fn, ms) => timers.push(setInterval(fn, ms)), after: (fn, ms) => timers.push(setTimeout(fn, ms)), get over() { return over; } });
}
function password(el, g) {
  const cs = '0123456789ABCDEF'.split(''), code = []; while (code.length < 4) { const c = cs[Math.floor(Math.random() * 16)]; if (!code.includes(c)) code.push(c); }
  let left = 6; const log = h('div', { className: 'log' }), inp = h('input', { maxLength: 4, placeholder: '4 hex chars, no repeats' });
  const info = h('p', {}, 'Guess the 4-char code (0-9, A-F, no repeats). ● right place, ○ wrong place. 6 wrong guesses allowed.');
  const go = () => { const v = inp.value.toUpperCase(); inp.value = ''; if (!/^[0-9A-F]{4}$/.test(v) || new Set(v).size < 4) return;
    let hit = 0, near = 0; [...v].forEach((c, i) => c === code[i] ? hit++ : code.includes(c) && near++);
    log.prepend(h('div', {}, `${v}  ${'●'.repeat(hit)}${'○'.repeat(near)}`)); if (hit === 4) return g.pass(); g.wrong(); if (--left <= 0) g.fail(); };
  inp.onkeydown = e => e.key === 'Enter' && go(); el.append(info, inp, h('button', { onclick: go }, 'Try'), log); inp.focus();
}
function packet(el, g) {
  const interval = 700, win = 180; let hits = 0, start = performance.now();
  const dot = h('div', { className: 'pulse' }), st = h('p', {}, 'Hit SPACE / tap when the packet glows (5 clean hits).');
  g.every(() => { const ph = (performance.now() - start) % interval; dot.classList.toggle('on', ph < win); }, 16);
  const hit = () => { const ph = (performance.now() - start) % interval; if (ph < win) { hits++; if (hits >= 5) g.pass(); } else g.wrong(); st.textContent = `Hits ${hits}/5`; };
  const kd = e => { if (e.code === 'Space') { e.preventDefault(); if (!g.over) hit(); else removeEventListener('keydown', kd); } };
  addEventListener('keydown', kd); dot.onclick = hit; el.append(st, dot, h('button', { onclick: hit }, 'HIT'));
}
function circuit(el, g) {
  // 5x5 grid of rotatable tiles; a path from S (left of row 2) to OUT (right of row 2). Grounds = cells that fail if powered.
  const N = 5, D = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // dirs: up,right,down,left as [dx,dy]
  const path = [[0, 2]]; let x = 0, y = 2;
  for (; x < N; x++) { const ty = Math.floor(Math.random() * N); while (y !== ty) { y += Math.sign(ty - y); path.push([x, y]); } if (x < N - 1) path.push([x + 1, y]); }
  const outY = y; const tiles = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ c: [Math.random() < .5, Math.random() < .5, Math.random() < .5, Math.random() < .5], rot: 0 })));
  const dirOf = (a, b) => D.findIndex(([dx, dy]) => a[0] + dx === b[0] && a[1] + dy === b[1]);
  path.forEach((p, i) => { const c = [false, false, false, false]; c[i ? dirOf(p, path[i - 1]) : 3] = true; c[i < path.length - 1 ? dirOf(p, path[i + 1]) : 1] = true; tiles[p[1]][p[0]] = { c, rot: Math.floor(Math.random() * 4) || 1 }; });
  const grounds = []; while (grounds.length < 2) { const gx = 1 + Math.floor(Math.random() * 4), gy = Math.floor(Math.random() * N); if (!path.some(p => p[0] === gx && p[1] === gy) && !grounds.some(q => q[0] === gx && q[1] === gy)) grounds.push([gx, gy]); }
  grounds.forEach(([gx, gy]) => tiles[gy][gx].ground = true);
  const conn = (t, d) => t.c[(d - t.rot + 4) % 4];
  let undo = 3; const hist = []; const grid = h('div', { className: 'grid' }); const st = h('p');
  const glyph = t => { const [u, r, d, l] = [0, 1, 2, 3].map(k => conn(t, k)); return ({ '1010': '│', '0101': '─', '1100': '└', '0110': '┌', '0011': '┐', '1001': '┘', '1110': '├', '0111': '┬', '1011': '┤', '1101': '┴', '1111': '┼', '1000': '╵', '0100': '╶', '0010': '╷', '0001': '╴', '0000': '·' })[[u, r, d, l].map(Number).join('')]; };
  const powered = () => { const seen = new Set(), q = []; if (conn(tiles[2][0], 3)) { q.push([0, 2]); seen.add('0,2'); }
    while (q.length) { const [cx, cy] = q.shift(); for (let d = 0; d < 4; d++) { if (!conn(tiles[cy][cx], d)) continue; const nx = cx + D[d][0], ny = cy + D[d][1]; if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen.has(nx + ',' + ny)) continue; if (conn(tiles[ny][nx], (d + 2) % 4)) { seen.add(nx + ',' + ny); q.push([nx, ny]); } } } return seen; };
  const draw = () => { grid.innerHTML = ''; const p = powered();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = tiles[r][c]; const b = h('button', { className: 'tile' + (p.has(c + ',' + r) ? ' pw' : '') + (t.ground ? ' gnd' : ''), textContent: t.ground ? '⏚' + glyph(t) : glyph(t) });
      b.onclick = () => { hist.push([r, c]); t.rot = (t.rot + 1) % 4; check(); draw(); }; grid.append(b); }
    st.textContent = `Power S (left of row 3) to OUT (right of row ${outY + 1}). Avoid grounds ⏚. Undo left: ${undo}`; };
  const check = () => { const p = powered(); if (grounds.some(([gx, gy]) => p.has(gx + ',' + gy))) { g.wrong(); } if (p.has(`${N - 1},${outY}`) && conn(tiles[outY][N - 1], 1) && !grounds.some(([gx, gy]) => p.has(gx + ',' + gy))) g.pass(); };
  el.append(st, grid, h('button', { onclick: () => { if (undo && hist.length) { undo--; const [r, c] = hist.pop(); tiles[r][c].rot = (tiles[r][c].rot + 3) % 4; draw(); } } }, 'Undo')); draw();
}
function firewallCap(el, g) {
  const cv = h('canvas', { width: 320, height: 300, className: 'cv' }), ctx = cv.getContext('2d'); const st = h('p'), sp = h('input', { type: 'range', min: 1, max: 4, value: 2 });
  let lane = 1, caught = 0, items = [], last = 0;
  g.every(() => { if (performance.now() - last > 700) { last = performance.now(); items.push({ lane: Math.floor(Math.random() * 4), y: 0, hostile: Math.random() < .6 }); }
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, 320, 300);
    for (const it of items) { it.y += +sp.value * 1.2; ctx.fillStyle = it.hostile ? '#ef4444' : '#22c55e'; ctx.fillRect(it.lane * 80 + 25, it.y, 30, 20);
      if (it.y > 260 && !it.done) { it.done = true; if (it.lane === lane) { if (it.hostile) caught++; else { g.wrong(); return g.fail(); } } } }
    items = items.filter(i => i.y < 300); ctx.fillStyle = '#f7931a'; ctx.fillRect(lane * 80 + 10, 280, 60, 12);
    st.textContent = `Catch red packets in your lane, let green pass. Captured ${caught}/6. ←/→ or tap lanes.`; if (caught >= 6) g.pass(); }, 16);
  const kd = e => { if (g.over) return removeEventListener('keydown', kd); if (e.key === 'ArrowLeft') lane = Math.max(0, lane - 1); if (e.key === 'ArrowRight') lane = Math.min(3, lane + 1); };
  addEventListener('keydown', kd); cv.onclick = e => { lane = Math.min(3, Math.floor(e.offsetX / (cv.clientWidth / 4))); };
  el.append(st, cv, h('label', {}, 'Drop speed ', sp));
}
function memory(el, g) {
  const cells = [0, 1, 2, 3].map(i => h('button', { className: 'cell c' + i })); const st = h('p'); let seq = [], len = 3, idx = 0, input = false;
  const play = () => { input = false; seq = Array.from({ length: len }, () => Math.floor(Math.random() * 4)); idx = 0; st.textContent = `Watch… length ${len} (pass at 6)`;
    seq.forEach((c, i) => { g.after(() => cells[c].classList.add('lit'), i * 600); g.after(() => cells[c].classList.remove('lit'), i * 600 + 400); });
    g.after(() => { input = true; st.textContent = `Repeat length ${len}`; }, seq.length * 600); };
  cells.forEach((b, i) => b.onclick = () => { if (!input) return; b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 150);
    if (seq[idx] !== i) { g.wrong(); return play(); } if (++idx === len) { if (len >= 6) return g.pass(); len++; g.after(play, 500); input = false; } });
  el.append(st, h('div', { className: 'cells' }, ...cells)); play();
}
