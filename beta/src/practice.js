// Practice: same puzzle code as the server, run locally. No vsats, nothing sent.
import { PUZZLES, startPuzzle, rng } from './puzzles.js';
export function practice(id, seconds = 30) {
  const seed = 'practice:' + Math.random(), st = startPuzzle(id, seed), P = PUZZLES[id]; let n = 0, t0 = Date.now(), done = false;
  const fin = r => { done = true; return { done: true, pass: r.pass, reason: r.pass ? 'pass' : 'fail', wrong: r.wrong || 0, timeMs: Date.now() - t0, practice: true }; };
  const run = (fn, b) => { if (done) return { done: true }; const r = fn(st.secret, b || {}, rng(seed + ':' + n++)); if (r.error) throw new Error(r.error);
    if (r.endMs != null && r.endMs > seconds * 1000) r.pass = false; return r.done ? fin(r) : r; };
  return { start: { puzzle: id, public: st.public, seconds, stage: 0, stages: 1, mode: 'practice' },
    engine: { input: async b => run(P.input || P.submit, b), submit: async b => run(P.submit || P.input, b), abort: async () => fin({ pass: false }) } };
}
