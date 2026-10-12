// Pure rule functions from RULES.md. Integer floor math; leftovers -> weekly pool.
import { CONFIG as C } from './config.js';
const f = Math.floor;

export function miningSplit(N, s = C.split) {
  const player = f(N * s.player / 100), project = f(N * s.project / 100), owner = f(N * s.owner / 100);
  return { player, project, owner, pool: N - player - project - owner };
}
// accounts: [{id, th:[{minutesActive}]}] ; weight per TH = floor(min*1000/1440)
export function distributePlayerShare(player, accounts) {
  const w = a => a.th.reduce((s, t) => s + f(Math.min(t.minutesActive, 1440) * 1000 / 1440), 0);
  const weight = accounts.reduce((s, a) => s + w(a), 0);
  if (!weight) return { credits: {}, pool: player };
  const perTh = f(player * 1000 / weight); // per full TH (weight 1000)
  const credits = {}; let paid = 0;
  for (const a of accounts) { const c = f(perTh * w(a) / 1000); credits[a.id] = c; paid += c; }
  return { credits, pool: player - paid, perTh };
}
export function purchaseCheck(currentTh, qty, cap = C.thCap) {
  return currentTh + qty > cap ? { ok: false, reason: `Cap ${cap} TH per account` } : { ok: true };
}
export function purchaseQuote(qty, channel) {
  const base = C.pricePerThUsd * qty;
  if (channel === 'sats') return { sats: C.pricePerThSats * qty, usd: 0 };
  const card = +(base * 0.03).toFixed(2);
  const store = channel === 'mobile' ? +(base * 0.15).toFixed(2) : 0; // store fee % is a placeholder
  return { usd: +(base + card + store).toFixed(2), base, card, store };
}
export function band(hot) { return hot <= 0 ? 0 : String(f(hot)).length; } // 1-9 ->1, 10-99 ->2 (edge goes up)
export function canTarget(att, def) {
  if (att.tier !== def.tier) return false;
  if (att.tier === 'free') return true;
  return band(att.hot) === band(def.hot);
}
export function failCost(target, attacker) {
  const cost = Math.min(f(target * C.failTargetPct / 100), f(attacker * C.failAttackerCapPct / 100));
  const defender = f(cost / C.failDefenderDiv);
  return { cost, defender, pool: cost - defender };
}
export function steal(defender, attacker) { return Math.min(f(defender * C.stealPct / 100), attacker); }
export function robAllowed(log, attackerId, defenderId, day) {
  return !log.some(r => r.def === defenderId && r.day === day && r.success);
}
export function adCredit(revenueSats) { const c = f(revenueSats * C.adShare / 100); return { credit: c, pool: revenueSats - c }; }
export function msatToPaid(msat) { const s = f(msat / 1000); return msat % 1000 >= 500 ? s + 1 : s; }
export function lnFee(amount) { return f(amount * C.lnFeePermille / 1000) + C.lnFeeBase; }
export function withdrawQuote(amount, balance, onchainFeeSats = 300) {
  const large = amount > C.withdrawCutoffSats;
  const fee = large ? onchainFeeSats : lnFee(amount);
  if (amount + fee > balance) return { ok: false, fee, reason: 'Balance cannot cover amount + fee' };
  return { ok: true, fee, route: large ? 'on-chain / large Lightning' : 'Lightning' };
}
export function thawHours(level) { return C.thawHours[Math.max(1, Math.min(5, level)) - 1]; }
export function thawSpendable(amount, hoursLeft, paid = true) {
  const v = amount * hoursLeft / 1000; return paid ? f(v) : f(v * 1000) / 1000;
}
export function hackTimer(firewall, anti) {
  // timer = 20s + max(-15, -3*firewall) - 3 per firewall level not matched by anti; floor 5s
  const t = C.timer;
  const s = t.seconds + Math.max(t.firewallMax, t.firewallDelta * firewall) - t.missingAnti * Math.max(0, firewall - anti);
  return Math.max(t.floor, s);
}
export function weeklyPayout(pool, ranked) {
  // ranked: [{id, stages, time, wrong}] ; ties split place share, next place not skipped
  const key = r => `${r.stages}|${r.time.toFixed(1)}|${r.wrong}`;
  const sorted = [...ranked].sort((a, b) => b.stages - a.stages || a.time - b.time || a.wrong - b.wrong);
  const groups = []; for (const r of sorted) { const g = groups.at(-1); g && key(g[0]) === key(r) ? g.push(r) : groups.push([r]); }
  const out = {}; let paid = 0;
  groups.slice(0, 5).forEach((g, i) => { const share = f(pool * C.weeklySplit[i] / 100); const each = f(share / g.length); g.forEach(r => { out[r.id] = each; paid += each; }); });
  return { payouts: out, remainder: pool - paid };
}
