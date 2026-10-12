import { CONFIG as C } from './config.js';
import * as R from './rules.js';
import * as S from './sim.js';
import { GAMES, runGame as run0, TUNE } from './minigames.js';
let cur = null; const runGame = (...a) => (cur = run0(...a));
const card = (ok, head, lines) => `<div class="result ${ok ? 'pass' : 'fail'}"><p class=kicker>${ok ? 'Pass' : 'Fail'}</p><h3>${head}</h3>${lines.map(l => `<p>${l}</p>`).join('')}<button class=btn onclick="document.getElementById('closeM').click()">Close</button></div>`;
let s = S.load(); const $ = q => document.querySelector(q);
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3500); };
const act = (fn, ok) => { const e = fn(); e ? toast(e) : ok && toast(ok); S.save(s); render(); };
const fmt = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
function render() {
  const m = s.me, mining = m.th.length, adOn = m.adUntil > S.now(s);
  $('#clock').textContent = `Day ${s.day} · ${S.hhmm(s.minute)} · Week ${s.week}`;
  $('#tier').textContent = m.tier === 'free' ? 'FREE tier (msat)' : 'PAID tier (sats)';
  $('#hot').textContent = m.tier === 'free' ? `${fmt(m.msat / 1000)} sats (${fmt(m.msat)} msat)` : `${fmt(m.hot)} sats`;
  $('#cold').textContent = `${fmt(m.cold)} sats`; $('#pool').textContent = `${fmt(s.pool)} sats`;
  $('#band').textContent = m.tier === 'free' ? 'Free-for-all' : `Band ${R.band(m.hot)} (${m.hot <= 0 ? '0' : `${10 ** (R.band(m.hot) - 1)}–${10 ** R.band(m.hot) - 1}`} hot sats)`;
  $('#th').textContent = `${mining} TH${adOn ? ' + ad miner (0 TH)' : ''}`;
  $('#rate').textContent = `≈ ${fmt(Math.floor(C.mockDailyNetPayoutPerThSats * 0.8 * mining))} sats/day (mock)`;
  $('#ad').textContent = adOn ? `Ad miner active, ${Math.ceil((m.adUntil - S.now(s)) / 60)}h left · ${m.pendingAdSats} sats pending settlement` : 'No ad miner active';
  $('#fw').textContent = `Firewall L${m.firewall} · Anti L${m.anti}`;
  const t = m.thaw; $('#thaw').innerHTML = t ? `Thawing <b>${fmt(t.amount)}</b> sats (L${t.level}), ${t.left.toFixed(1)}h left, <span class=warn>visible & stealable</span>. Early-spend allowance: ${R.thawSpendable(t.amount, t.left)} sats` : 'No thaw running';
  $('#targets').innerHTML = ''; S.targets(s).forEach(b => { const tr = document.createElement('tr');
    tr.innerHTML = `<td>${b.name}</td><td>${b.tier}</td><td>${fmt(b.hot)}</td><td>L${b.firewall}</td><td>${R.robAllowed(s.robLog, 'me', b.id, s.day) ? '' : 'robbed today'}</td>`;
    const td = document.createElement('td'), bt = document.createElement('button'); bt.textContent = 'Hack'; bt.onclick = () => hack(b); td.append(bt); tr.append(td); $('#targets').append(tr); });
  if (!S.targets(s).length) $('#targets').innerHTML = '<tr><td colspan=6>No targets in your band.</td></tr>';
  $('#ledger').innerHTML = s.ledger.slice(0, 40).map(e => `<tr><td>${e.t}</td><td>${e.type}</td><td class=${e.amount < 0 ? 'neg' : 'pos'}>${e.amount}</td><td>${e.note}</td></tr>`).join('');
  $('#reports').innerHTML = s.reports.slice(0, 14).map(r => `<tr><td>${r.date}</td><td>${r.thSold}</td><td>${r.net}</td><td>${r.player}/${r.project}/${r.owner}</td><td>${r.pool}</td><td>${r.mine}</td><td>${r.adRev}→${r.adPlayers}/${r.adPool}</td></tr>`).join('');
  const lr = s.lastRace; $('#race').innerHTML = lr ? `<b>Week ${lr.week}</b> pool ${lr.pool}: ` + Object.entries(lr.payouts).map(([id, v]) => `${id === 'me' ? 'YOU' : s.bots.find(b => b.id === id)?.name} +${v}`).join(', ') : 'No week closed yet.';
  $('#entered').textContent = s.weekRuns.length ? `Your run this week: ${s.weekRuns[0].stages}/5 stages, ${s.weekRuns[0].time}s, ${s.weekRuns[0].wrong} wrong` : 'Not entered this week (one attempt).';
}
function modal(show) { document.activeElement?.blur(); $('#modal').classList.toggle('on', show); }
function hack(bot) {
  const g = GAMES[Math.floor(Math.random() * GAMES.length)], secs = R.hackTimer(bot.firewall, s.me.anti); modal(true);
  runGame($('#stage'), g, secs, r => { const res = S.resolveHack(s, bot, r.pass); S.save(s); render();
    cur = null; $('#stage').innerHTML = card(r.pass, res.msg, [`Time used ${r.time}s · Wrong inputs ${r.wrong}`, r.reason === 'expired' ? 'Clock expired.' : '']); });
}
function race() {
  if (s.weekRuns.length) return toast('One weekly attempt only');
  let i = 0, total = 0, wrong = 0; modal(true);
  const next = () => runGame($('#stage'), GAMES[i], C.timer.seconds, r => { total += r.time; wrong += r.wrong; if (r.pass && ++i < 5) return next();
    s.weekRuns = [{ id: 'me', name: 'you', stages: i, time: +total.toFixed(1), wrong }]; S.save(s); render();
    cur = null; $('#stage').innerHTML = card(i === 5, `Run over · ${i}/5 stages`, [`${total.toFixed(1)}s total, ${wrong} wrong. Ranked when the week closes.`]); });
  next();
}
const num = id => Math.floor(+$(id).value || 0);
const bind = (id, fn) => $(id).onclick = fn;
bind('#buy', () => act(() => S.buyTh(s, num('#qty') || 1, $('#chan').value), 'Purchase recorded (mock)'));
$('#qty').oninput = $('#chan').onchange = () => { const q = R.purchaseQuote(num('#qty') || 1, $('#chan').value); $('#quote').textContent = q.sats ? `${fmt(q.sats)} sats` : `$${q.usd} (base ${q.base.toFixed(2)} + card ${q.card}${q.store ? ` + store ${q.store}` : ''})`; };
bind('#watch', () => { $('#adbox').classList.add('on'); setTimeout(() => { $('#adbox').classList.remove('on'); act(() => S.watchAd(s), 'Ad miner granted for 24h'); }, 2500); });
bind('#adv1', () => act(() => { S.advance(s, 60, ev); maybeBot(); }));
bind('#adv8', () => act(() => { S.advance(s, 480, ev); maybeBot(); }));
bind('#adv24', () => act(() => { S.advance(s, 1440, ev); maybeBot(); maybeBot(); }));
bind('#rand', () => { const t = S.targets(s).filter(b => R.robAllowed(s.robLog, 'me', b.id, s.day)); t.length ? hack(t[Math.floor(Math.random() * t.length)]) : toast('No target available'); });
bind('#cold-in', () => act(() => S.toCold(s, num('#camt')), 'Moved to cold'));
bind('#thaw-go', () => act(() => S.startThaw(s, num('#camt'), +$('#tlvl').value), 'Thaw started'));
bind('#thaw-x', () => act(() => S.cancelThaw(s)));
bind('#thaw-spend', () => act(() => S.spendThaw(s)));
bind('#wd', () => act(() => S.withdraw(s, num('#wamt')), 'Mock withdrawal recorded'));
$('#wamt').oninput = () => { const a = num('#wamt'); $('#wq').textContent = a ? `fee ${R.withdrawQuote(a, Infinity).fee} sats via ${a > C.withdrawCutoffSats ? 'on-chain/large LN (mock 300 sat mining fee)' : 'Lightning (0.4% + 4)'}` : ''; };
bind('#fwup', () => act(() => S.upgrade(s, 'firewall'))); bind('#antiup', () => act(() => S.upgrade(s, 'anti')));
bind('#race-go', race);
bind('#reset', () => { if (confirm('Reset the whole simulation?')) { s = S.newState(); S.save(s); render(); } });
bind('#csv', () => { const rows = [['date', 'th_sold', 'net_payout', 'player', 'project', 'owner', 'pool', 'my_credit', 'ad_rev', 'ad_players', 'ad_pool'], ...s.reports.map(r => [r.date, r.thSold, r.net, r.player, r.project, r.owner, r.pool, r.mine, r.adRev, r.adPlayers, r.adPool])];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })); a.download = 'daily-report.csv'; a.click(); });
const practice = i => { modal(true); runGame($('#stage'), GAMES[i], C.timer.seconds, r => { cur = null; $('#stage').innerHTML = card(r.pass, GAMES[i].name, [`Time used ${r.time}s · Wrong inputs ${r.wrong}`, 'Practice: no sats move.']); }); };
$('#pg').innerHTML = ''; GAMES.forEach((g, i) => { const b = document.createElement('button'); b.className = 'tab'; b.innerHTML = `<span>${g.no}</span>${g.name}`; b.onclick = () => practice(i); $('#pg').append(b); });
$('#snd').checked = TUNE.sound; $('#snd').onchange = e => TUNE.sound = e.target.checked;
$('#closeM').onclick = () => { if (cur) { const c = cur; cur = null; c.abort(); } $('#stage').innerHTML = ''; modal(false); };
function ev(type, data) { if (type === 'week') toast(`Week ${data.week} closed: prize pool ${data.pool} sats paid out`); }
function maybeBot() { if (Math.random() < 0.5) { const m = S.botAttack(s); m && toast(m); } }
$('#qty').oninput(); render();
