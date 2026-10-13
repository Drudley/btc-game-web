import assert from 'node:assert/strict';
import { genBoard, solvedCopy, flood } from '../src/circuitgen.js';
let wires = 0;
for (let i = 0; i < 2000; i++) { const b = genBoard(7, { grounds: 3 }); const s = solvedCopy(b);
  assert.ok(s.out && !s.gnd, 'board solvable'); assert.ok(!flood(b.grid, b.source).out, 'not pre-solved');
  assert.equal(b.grounds.length, 3); wires += b.grid.flat().filter(c => c.kind === 'wire').length; }
console.log('2000 circuit boards solvable; avg wires', (wires / 2000).toFixed(1));
// Password fairness: 4 distinct digits, consistent-guess player, 7 submits (6 wrong allowed)
const perms = []; const r = (p) => { if (p.length === 4) return perms.push(p); for (let d = 0; d < 10; d++) if (!p.includes(d)) r([...p, d]); }; r([]);
const fb = (g, c) => { let e = 0, n = 0; g.forEach((d, i) => d === c[i] ? e++ : c.includes(d) && n++); return e * 10 + n; };
let win = 0, T = 3000;
for (let t = 0; t < T; t++) { const code = perms[Math.floor(Math.random() * perms.length)]; let cand = perms;
  for (let k = 0; k < 7; k++) { const g = cand[Math.floor(Math.random() * cand.length)], f = fb(g, code); if (f === 40) { win++; break; } cand = cand.filter(c => fb(g, c) === f); } }
console.log(`password (10 digits, ${perms.length} codes): random consistent guesser wins within 7 submits ${(100 * win / T).toFixed(1)}%`);
