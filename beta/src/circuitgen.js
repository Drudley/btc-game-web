// Solvable circuit board generator. Bitmask: 1 up, 2 right, 4 down, 8 left.
export const rotM = (m, r) => { for (let i = 0; i < r; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
export const DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]]; // dx, dy, bit, opposite bit
const bitTo = (a, b) => DIRS.find(([dx, dy]) => a[0] + dx === b[0] && a[1] + dy === b[1])[2];
// Builds a board with a guaranteed solution: a self-avoiding path from source (left edge) to output (right edge).
export function genBoard(N = 7, { grounds = 3, decoyRate = 0.35, minLen = N + 2, maxLen = 2 * N + 4, rnd = Math.random } = {}) {
  for (let tries = 0; tries < 500; tries++) {
    const sy = Math.floor(rnd() * N), path = [[0, sy]], seen = new Set([`0,${sy}`]);
    const dfs = () => { const [x, y] = path.at(-1); if (x === N - 1 && path.length >= minLen) return true; if (path.length >= maxLen) return false;
      const opts = DIRS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen.has(`${a},${b}`) && !(a === N - 1 && path.length + 1 < minLen))
        .sort(() => rnd() - 0.5).sort((p, q) => (q[0] > x) - (p[0] > x) + (rnd() < 0.4 ? 0 : 0)); // prefer moving right
      for (const n of opts) { path.push(n); seen.add(n.join()); if (dfs()) return true; path.pop(); seen.delete(n.join()); } return false; };
    if (!dfs()) continue;
    const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ kind: 'empty', base: 0, rot: 0 })));
    path.forEach((p, i) => { let m = 0; if (i > 0) m |= bitTo(p, path[i - 1]); if (i < path.length - 1) m |= bitTo(p, path[i + 1]);
      const kind = i === 0 ? 'source' : i === path.length - 1 ? 'output' : 'wire'; grid[p[1]][p[0]] = { kind, base: m, rot: 0, sol: 0 }; });
    const free = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!seen.has(`${x},${y}`)) free.push([x, y]); free.sort(() => rnd() - 0.5);
    // grounds: prefer cells next to the path so they matter
    const nearPath = ([x, y]) => DIRS.some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));
    const gs = [...free.filter(nearPath), ...free.filter(c => !nearPath(c))].slice(0, grounds);
    gs.forEach(([x, y]) => grid[y][x] = { kind: 'ground', base: 15, rot: 0 });
    const SHAPES = [5, 10, 3, 6, 12, 9, 7, 14];
    free.filter(c => !gs.includes(c)).forEach(([x, y]) => { if (rnd() < decoyRate) grid[y][x] = { kind: 'wire', base: SHAPES[Math.floor(rnd() * SHAPES.length)], rot: 0, decoy: true }; });
    // scramble rotations of all wires (path wires never left in their solved rotation-equivalent)
    for (const row of grid) for (const c of row) if (c.kind === 'wire') { do c.rot = Math.floor(rnd() * 4); while (!c.decoy && rotM(c.base, c.rot) === c.base); }
    const source = path[0];
    if (flood(grid, source).out) continue; // never start solved
    return { N, grid, source, path, grounds: gs };
  }
  throw new Error('board generation failed');
}
export const maskOf = c => c.kind === 'wire' ? rotM(c.base, c.rot) : c.base;
export function flood(grid, source) { const N = grid.length, on = new Set([source.join()]), q = [source]; let out = false, gnd = false;
  while (q.length) { const [x, y] = q.shift(), m = maskOf(grid[y][x]); for (const [dx, dy, b, ob] of DIRS) { const nx = x + dx, ny = y + dy; if (!(m & b) || nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
    const n = grid[ny][nx]; if (n.kind === 'empty' || !(maskOf(n) & ob) || on.has(nx + ',' + ny)) continue; on.add(nx + ',' + ny); if (n.kind === 'output') out = true; if (n.kind === 'ground') gnd = true; else q.push([nx, ny]); } }
  return { on, out, gnd }; }
// Solution check: path wires at rot 0, decoys rotated so they don't touch any powered tile (any rotation fine since path never points at them).
export function solvedCopy(b) { const g = b.grid.map(r => r.map(c => ({ ...c, rot: c.kind === 'wire' && !c.decoy ? 0 : c.rot }))); return flood(g, b.source); }
