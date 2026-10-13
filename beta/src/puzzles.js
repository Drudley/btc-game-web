// Server-authoritative puzzles. start() returns {public, secret}; input()/submit() validate client inputs.
// The client never reports pass/fail; the server decides from inputs + server time.
import { rng } from './rng.js';
import { genBoard, flood } from './circuitgen.js';
export const TUNE = { packetIntervalMs: 700, packetWindowMs: 180, packetSpeed: 0.55, captureDropSpeed: 0.45, captureSpawnMs: 250, captureSpawnSpreadMs: 250 }; // capture: ±15% speed; spawn every 250-500 ms (perfect play <= 13.4 s over 20k seeds)
const GATE = 0.72, NEED_HITS = 5, CAP_NEED = 6, LINE = 0.86, LANES = 5;

export const PUZZLES = {
  password: {
    start(r) { const pool = [...'0123456789'], code = []; for (let i = 0; i < 4; i++) code.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
      return { public: { length: 4, charset: '0123456789', maxWrong: 6 }, secret: { code: code.join(''), wrong: 0, guesses: [] } }; },
    // one guess per call; server returns marks
    input(s, { guess }) {
      if (typeof guess !== 'string' || !/^[0-9]{4}$/.test(guess) || new Set(guess).size !== 4) return { error: 'invalid guess' };
      const marks = [...guess].map((c, i) => c === s.code[i] ? 'exact' : s.code.includes(c) ? 'near' : 'miss'); s.guesses.push(guess);
      if (guess === s.code) return { marks, done: true, pass: true, wrong: s.wrong };
      s.wrong++; return { marks, done: s.wrong >= 6, pass: false, wrong: s.wrong };
    },
  },
  memory: {
    start(r) { const seqs = [4, 5, 6].map(n => Array.from({ length: n }, () => Math.floor(r() * 4))); return { public: { round: 0, sequence: seqs[0], cells: 4, passAt: 6 }, secret: { seqs, round: 0, wrong: 0, r: null } }; },
    // submit taps for the current round; wrong -> new sequence same length (server generates)
    input(s, { taps }, r) {
      if (!Array.isArray(taps)) return { error: 'taps required' }; const want = s.seqs[s.round];
      if (taps.length === want.length && taps.every((t, i) => t === want[i])) { s.round++; if (s.round >= s.seqs.length) return { done: true, pass: true, wrong: s.wrong }; return { ok: true, round: s.round, sequence: s.seqs[s.round], wrong: s.wrong }; }
      s.wrong++; s.seqs[s.round] = Array.from({ length: want.length }, () => Math.floor(r() * 4)); return { ok: false, round: s.round, sequence: s.seqs[s.round], wrong: s.wrong };
    },
  },
  circuit: {
    start(r) { const b = genBoard(7, { grounds: 3, rnd: r }); const grid = b.grid.map(row => row.map(c => ({ kind: c.kind, base: c.base, rot: c.rot })));
      return { public: { N: 7, grid, source: b.source, maxUndo: 12 }, secret: { grid, source: b.source } }; },
    // submit final rotations {"x,y": rot} + shorts counted client side are not trusted: server counts none (only final state matters)
    submit(s, { rotations, shorts = 0 }) {
      const g = s.grid.map(row => row.map(c => ({ ...c })));
      for (const [k, rot] of Object.entries(rotations || {})) { const [x, y] = k.split(',').map(Number); const c = g[y]?.[x]; if (!c || c.kind !== 'wire' || !Number.isInteger(rot)) return { error: 'bad rotation ' + k }; c.rot = ((rot % 4) + 4) % 4; }
      const f = flood(g, s.source); return { done: true, pass: f.out && !f.gnd, wrong: Math.max(0, shorts | 0) };
    },
  },
  packet: {
    start(r) { const sched = []; let t = 250, prev = null;
      while (t < 120000) { let v = TUNE.packetSpeed * (0.85 + r() * 0.3); const x0 = -0.06;
        if (prev && v > prev.v) { const px = x0 + prev.v * (t - prev.t) / 1000, catchT = (px + 0.06) / (v - prev.v), exitT = (1.08 - px) / prev.v; if (catchT < exitT) v = prev.v; }
        prev = { t, v }; sched.push(prev); t += TUNE.packetIntervalMs * (0.8 + r() * 0.5); }
      const half = Math.max(0.03, TUNE.packetSpeed * TUNE.packetWindowMs / 2000);
      return { public: { schedule: sched, gate: GATE, half, need: NEED_HITS }, secret: { sched, half } }; },
    // taps: ms offsets since attempt start (client clock). Server replays.
    submit(s, { taps }) { if (!Array.isArray(taps) || taps.length > 400) return { error: 'taps required' };
      const used = new Set(); let hits = 0, wrong = 0, last = -1;
      for (const t of taps) { if (typeof t !== 'number' || t < last) return { error: 'taps must be ascending numbers' }; last = t; let best = -1, bd = 1;
        s.sched.forEach((p, i) => { if (used.has(i) || p.t > t) return; const x = -0.06 + p.v * (t - p.t) / 1000, d = Math.abs(x - GATE); if (d <= s.half && d < bd) { bd = d; best = i; } });
        if (best < 0) wrong++; else { used.add(best); hits++; if (hits >= NEED_HITS) return { done: true, pass: true, wrong, endMs: t }; } }
      return { done: true, pass: false, wrong };
    },
  },
  capture: {
    start(r) { const sched = []; let t = 300; const busyUntil = Array(LANES).fill(-1);
      while (t < 120000) { const free = [...Array(LANES).keys()].filter(l => busyUntil[l] <= t);
        if (free.length) { const lane = free[Math.floor(r() * free.length)], v = TUNE.captureDropSpeed * (0.85 + r() * 0.3); busyUntil[lane] = t + (0.28 + 0.08) / v * 1000;
          sched.push({ t: Math.round(t), lane, v, hostile: r() < 0.55 }); t += TUNE.captureSpawnMs + r() * TUNE.captureSpawnSpreadMs; } else t += 80; }
      return { public: { schedule: sched, lanes: LANES, line: LINE, need: CAP_NEED }, secret: { sched } }; },
    // toggles: [{t, lane}] ascending. Gate state at the moment each packet crosses LINE decides capture/leak.
    submit(s, { toggles }) { if (!Array.isArray(toggles) || toggles.length > 1000) return { error: 'toggles required' };
      const open = (lane, t) => toggles.filter(x => x.lane === lane && x.t <= t).length % 2 === 1;
      let caps = 0, leaks = 0; const events = s.sched.map(p => ({ ...p, cross: p.t + (LINE + 0.08) / p.v * 1000 })).sort((a, b) => a.cross - b.cross);
      for (const p of events) { if (!open(p.lane, p.cross)) continue; if (p.hostile) caps++; else leaks++; if (leaks) return { done: true, pass: false, wrong: leaks, endMs: p.cross }; if (caps >= CAP_NEED) return { done: true, pass: true, wrong: 0, endMs: p.cross }; }
      return { done: true, pass: false, wrong: leaks };
    },
  },
};
export const PUZZLE_IDS = Object.keys(PUZZLES);
export function startPuzzle(id, seed) { const P = PUZZLES[id]; if (!P) throw new Error('unknown puzzle'); return P.start(rng(seed)); }
export { rng };
