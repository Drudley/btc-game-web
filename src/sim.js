// Local mock "server": state, ledger, bots, simulated day/week clock. Replace with HTTP API later.
import { CONFIG as C } from './config.js';
import * as R from './rules.js';
const KEY = 'btcgame.v1';
const names = ['satoshi_fan','h0dlr','nodeRunner','lnLarry','coldWallet','hashHannah','mempoolMax','blockBob','stackerSue','pleb21'];
export function newState() {
  const bots = names.map((n, i) => ({ id: 'bot' + i, name: n, tier: i % 3 === 0 ? 'free' : 'paid',
    hot: [8, 45, 120, 300, 900, 2500, 60, 15, 5000, 700][i], firewall: i % 4, th: i % 3 === 0 ? 0 : 1 + (i % 4) }));
  return { day: 1, minute: 0, week: 1, pool: 0,
    me: { id: 'me', name: 'you', tier: 'free', hot: 0, msat: 0, cold: 0, th: [], adUntil: 0, pendingAdSats: 0,
          firewall: 0, anti: 0, thaw: null },
    bots, ledger: [], robLog: [], reports: [], weekRuns: [], lastRace: null };
}
export function load() { try { return JSON.parse(localStorage.getItem(KEY)) || newState(); } catch { return newState(); } }
export function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
export const now = s => (s.day - 1) * 1440 + s.minute;
export function entry(s, type, amount, note) { s.ledger.unshift({ t: `D${s.day} ${hhmm(s.minute)}`, type, amount, note }); s.ledger.length = Math.min(s.ledger.length, 200); }
export const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} UTC`;
export const totalTh = s => s.me.th.length;

export function buyTh(s, qty, channel) {
  const chk = R.purchaseCheck(totalTh(s), qty); if (!chk.ok) return chk.reason;
  const q = R.purchaseQuote(qty, channel);
  if (channel === 'sats') { if (s.me.hot < q.sats) return 'Not enough hot sats'; s.me.hot -= q.sats; entry(s, 'buy', -q.sats, `${qty} TH paid in sats`); }
  else entry(s, 'buy', 0, `${qty} TH, mock ${channel} payment $${q.usd}`);
  for (let i = 0; i < qty; i++) s.me.th.push({ since: now(s) });
  if (s.me.tier === 'free') { s.me.tier = 'paid'; const c = R.msatToPaid(s.me.msat); s.me.hot += c; s.me.msat = 0; entry(s, 'convert', c, 'free msat moved to paid'); }
  return null;
}
export function watchAd(s) {
  s.me.adUntil = now(s) + C.adGrantHours * 60; s.me.pendingAdSats += C.mockAdRevenueSats;
  entry(s, 'ad', 0, `Ad miner granted 24h (revenue credited at settlement)`);
}
// Advance clock; settle at 00:00 UTC each day; close week every 7 days.
export function advance(s, minutes, onEvent) {
  while (minutes > 0) {
    const step = Math.min(minutes, 1440 - s.minute); s.minute += step; minutes -= step;
    if (s.minute >= 1440) { s.minute = 0; settleDay(s); s.day++; if ((s.day - 1) % 7 === 0) onEvent?.('week', closeWeek(s)); }
    if (s.me.thaw) { s.me.thaw.left -= step / 60; if (s.me.thaw.left <= 0) finishThaw(s); }
  }
}
function settleDay(s) {
  const dayStart = (s.day - 1) * 1440;
  const totalBotTh = s.bots.reduce((a, b) => a + b.th, 0);
  const myTh = s.me.th.map(t => ({ minutesActive: Math.max(0, dayStart + 1440 - Math.max(t.since, dayStart)) }));
  const N = C.mockDailyNetPayoutPerThSats * (totalBotTh + s.me.th.length);
  const sp = R.miningSplit(N);
  const accounts = [{ id: 'me', th: myTh }, ...s.bots.map(b => ({ id: b.id, th: Array.from({ length: b.th }, () => ({ minutesActive: 1440 })) }))];
  const d = R.distributePlayerShare(sp.player, accounts);
  s.pool += sp.pool + d.pool;
  const mine = d.credits.me || 0; if (mine) { s.me.hot += mine; entry(s, 'mining', mine, `Day ${s.day} mining credit`); }
  s.bots.forEach(b => b.hot += d.credits[b.id] || 0);
  let adRev = s.me.pendingAdSats, ad = R.adCredit(adRev); s.pool += ad.pool;
  if (ad.credit) { if (s.me.tier === 'free') s.me.msat += ad.credit * 1000; else s.me.hot += ad.credit; entry(s, 'ad', ad.credit, 'Ad settlement 90%'); }
  s.me.pendingAdSats = 0;
  s.bots.forEach(b => { if (b.tier === 'free') b.hot += 2; });
  s.reports.unshift({ date: `Day ${s.day}`, thSold: s.me.th.filter(t => t.since >= dayStart).length, net: N, ...sp, mine, adRev, adPlayers: ad.credit, adPool: ad.pool });
}
function closeWeek(s) {
  const runs = [...s.weekRuns, ...s.bots.slice(0, 6).map(b => ({ id: b.id, name: b.name, stages: Math.floor(Math.random() * 6), time: +(60 + Math.random() * 90).toFixed(1), wrong: Math.floor(Math.random() * 6) }))];
  const res = R.weeklyPayout(s.pool, runs);
  const mine = res.payouts.me || 0; if (mine) { s.me.hot += mine; entry(s, 'prize', mine, `Week ${s.week} prize`); }
  s.bots.forEach(b => b.hot += res.payouts[b.id] || 0);
  const summary = { week: s.week, pool: s.pool, runs, payouts: res.payouts };
  s.pool = res.remainder; s.week++; s.weekRuns = []; s.lastRace = summary; return summary;
}
export function hotBalance(s) { return s.me.tier === 'free' ? s.me.msat / 1000 : s.me.hot; }
export function targets(s) { const me = { tier: s.me.tier, hot: hotBalance(s) }; return s.bots.filter(b => R.canTarget(me, { tier: b.tier, hot: b.hot + thawVisible(b) })); }
const thawVisible = b => 0;
export function resolveHack(s, bot, pass) {
  const day = s.day, att = Math.floor(hotBalance(s)), defHot = bot.hot + (bot.thaw || 0);
  if (pass) {
    if (!R.robAllowed(s.robLog, 'me', bot.id, day)) return { msg: `${bot.name} was already robbed today. No sats moved.` };
    const amt = R.steal(defHot, att); bot.hot -= amt; addHot(s, amt); s.robLog.push({ def: bot.id, day, success: true });
    entry(s, 'steal', amt, `Hacked ${bot.name}`); return { msg: `Success! Stole ${amt} sats from ${bot.name}.` };
  }
  const fc = R.failCost(defHot, att); addHot(s, -fc.cost); bot.hot += fc.defender; s.pool += fc.pool;
  entry(s, 'hackfail', -fc.cost, `Failed vs ${bot.name} (${fc.defender} to defender, ${fc.pool} to pool)`);
  return { msg: `Hack failed. Lost ${fc.cost} sats (${fc.defender} to ${bot.name}, ${fc.pool} to weekly pool).` };
}
function addHot(s, n) { if (s.me.tier === 'free') s.me.msat = Math.max(0, s.me.msat + n * 1000); else s.me.hot = Math.max(0, s.me.hot + n); }
// Bots attack you occasionally (stealable hot + thawing slice; never cold).
export function botAttack(s) {
  const me = { tier: s.me.tier, hot: hotBalance(s) + (s.me.thaw?.amount || 0) };
  const cands = s.bots.filter(b => R.canTarget({ tier: b.tier, hot: b.hot }, me) || s.me.tier === 'free' && b.tier === 'free'); if (!cands.length) return null;
  const b = cands[Math.floor(Math.random() * cands.length)];
  const winP = 0.5 - 0.1 * (s.me.firewall);
  if (Math.random() < winP && R.robAllowed(s.robLog, b.id, 'me', s.day)) {
    let pot = Math.floor(hotBalance(s)) + (s.me.thaw?.amount || 0), amt = R.steal(pot, b.hot);
    const fromThaw = Math.min(amt, s.me.thaw?.amount || 0); if (fromThaw) s.me.thaw.amount -= fromThaw; addHot(s, -(amt - fromThaw));
    b.hot += amt; s.robLog.push({ def: 'me', day: s.day, success: true }); entry(s, 'robbed', -amt, `${b.name} hacked you${fromThaw ? ` (${fromThaw} from thawing slice)` : ''}`);
    return `${b.name} hacked you for ${amt} sats!`;
  }
  const fc = R.failCost(Math.floor(hotBalance(s)), b.hot); b.hot -= fc.cost; addHot(s, fc.defender); s.pool += fc.pool;
  if (fc.defender) entry(s, 'defended', fc.defender, `${b.name} failed to hack you`);
  return `${b.name} tried to hack you and failed (+${fc.defender} sats).`;
}
export function toCold(s, amt) { if (s.me.tier !== 'paid' || amt > s.me.hot || amt <= 0) return 'Invalid amount'; s.me.hot -= amt; s.me.cold += amt; entry(s, 'cold', -amt, 'Moved to cold storage'); }
export function startThaw(s, amt, level) {
  if (s.me.thaw) return 'A thaw is already running'; if (amt <= 0 || amt > s.me.cold) return 'Invalid amount';
  s.me.cold -= amt; s.me.thaw = { amount: amt, level, left: R.thawHours(level) }; entry(s, 'thaw', 0, `Thaw ${amt} sats, L${level} (${R.thawHours(level)}h)`);
}
export function cancelThaw(s) { if (!s.me.thaw) return; s.me.cold += s.me.thaw.amount; entry(s, 'thaw', 0, 'Thaw cancelled (timer reset)'); s.me.thaw = null; }
export function spendThaw(s) {
  const t = s.me.thaw; if (!t) return; const amt = R.thawSpendable(t.amount, t.left); if (amt <= 0) return 'Nothing spendable';
  t.amount -= amt; s.me.hot += amt; entry(s, 'thaw', amt, `Early spend from thaw (${t.left.toFixed(1)}h left)`);
}
function finishThaw(s) { const t = s.me.thaw; s.me.hot += t.amount; entry(s, 'thaw', t.amount, 'Thaw complete -> hot (ready to withdraw)'); s.me.thaw = null; }
export function withdraw(s, amt) {
  if (s.me.tier === 'free') return 'Free msat not withdrawable until moved to paid whole sats';
  const q = R.withdrawQuote(amt, s.me.hot); if (!q.ok) return q.reason;
  s.me.hot -= amt + q.fee; entry(s, 'withdraw', -(amt + q.fee), `MOCK ${q.route} withdrawal ${amt} + fee ${q.fee}`); return null;
}
export function upgrade(s, kind) { const cost = 200 * (s.me[kind] + 1); if (s.me.hot < cost || s.me[kind] >= 5) return `Need ${cost} hot sats (mock shop price, OPEN)`; s.me.hot -= cost; s.me[kind]++; entry(s, 'shop', -cost, `${kind} -> L${s.me[kind]}`); }
