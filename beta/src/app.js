import { call, remoteEngine, device, API } from './api.js';
import { META, runAttempt, h, SOUND } from './games.js';
import { practice } from './practice.js';
const $ = id => document.getElementById(id), BASE = 40, PER = 5;
const hackSec = (fw, kit) => BASE - PER * fw + PER * kit; // raw, no clamp; under me.minSeconds (15) = locked
const MIN = () => me?.minSeconds ?? 15, kitNeed = fw => Math.max(0, Math.ceil((MIN() - BASE + PER * fw) / PER));
const topKit = () => { for (let l = 5; l >= 1; l--) if ((me?.kits?.[l] || 0) > 0) return l; return 0; };
let kitSel = null; // null = auto (highest owned)
const curKit = () => kitSel != null && (kitSel === 0 || (me?.kits?.[kitSel] || 0) > 0) ? kitSel : topKit();
const lockTxt = fw => `locked · needs L${kitNeed(fw)}+ kit`;
const FP = localStorage.getItem('forcePuzzle') || undefined; // QA only
let me = null, lvl = Number(localStorage.getItem('lvl') || 1), running = null;
const toast = t => { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2600); };
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60); return hh ? `${hh}h ${mm}m` : `${mm}m ${s % 60}s`; };
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

async function refresh() {
  me = await call('/v1/me');
  $('uname').textContent = me.name; $('ptsTop').textContent = me.pts + ' pts'; $('hot').textContent = me.hot + ' sats'; $('freezing').textContent = me.freezing + ' sats'; $('frozen').textContent = me.frozen + ' sats';
  $('band').textContent = me.band; $('pts').textContent = me.pts; $('fwInfo').textContent = me.firewall ? `L${me.firewall} · ${fmtDur(me.firewallUntil - Date.now())} left` : 'L0 (none)';
  $('kitInfo').textContent = [1, 2, 3, 4, 5].filter(l => me.kits[l]).map(l => `L${l}×${me.kits[l]}`).join(' · ') || 'none';
  $('coldLv').textContent = 'L' + me.cold; $('coldH').textContent = me.freezeHours + ' h'; $('shLeft').textContent = me.satHacksLeft + '/20'; $('adsLeft').textContent = me.adsLeft; $('adPts').textContent = me.adPoints;
  $('adGo').disabled = me.adsLeft <= 0; $('fzGo').disabled = $('fzAll').disabled = me.hot <= 0;
  $('shGo').disabled = me.satHacksLeft <= 0; drawFreezes(); drawKits(); drawLevels(); $('dev').textContent = device(); $('apiUrl').textContent = API;
}
function drawFreezes() { const el = $('freezes'); el.innerHTML = ''; for (const f of me.freezes) el.append(h('div', { class: 'fz' }, h('span', {}, `${f.amount} sats · L${f.level} (${f.hours} h)`), h('b', {}, 'frozen in ' + fmtDur(f.until - Date.now())))); }
setInterval(() => me && drawFreezes(), 1000);
function drawLevels() { const el = $('levels'); el.innerHTML = '';
  for (let l = 1; l <= 5; l++) { const sec = hackSec(l, curKit()), lk = sec < MIN();
    el.append(h('button', { class: (l === lvl ? 'on' : '') + (lk ? ' locked' : ''), onclick: () => { lvl = l; localStorage.setItem('lvl', l); drawLevels(); } }, `L${l}`, h('small', {}, lk ? lockTxt(l) : `${l} sat${l > 1 ? 's' : ''} · ${sec}s`))); }
  const lk = hackSec(lvl, curKit()) < MIN(); $('shGo').disabled = me.satHacksLeft <= 0 || lk; $('shGo').textContent = lk ? `L${lvl} locked: needs L${kitNeed(lvl)}+ kit` : 'Start sat hack'; }
function drawKits() { for (const id of ['kitsSh', 'kitsPvp']) { const el = $(id); el.innerHTML = ''; const k = curKit();
  for (let l = 0; l <= 5; l++) { const n = l ? me.kits[l] || 0 : null; el.append(Object.assign(h('button', { class: l === k ? 'on' : '', onclick: () => { kitSel = l; drawKits(); drawLevels(); loadTargets().catch(() => {}); } }, l ? `L${l}` : 'None', h('small', {}, l ? `×${n} · +${5 * l}s` : 'no kit')), { disabled: l > 0 && !n })); } } }

function openModal() { $('modal').classList.add('on'); }
function closeModal() { $('modal').classList.remove('on'); $('stage').innerHTML = ''; }
$('closeM').onclick = () => { if (running) { if (running.paid && !confirm('Quit? A PvP hack you quit counts as a failed hack.')) return; running.ctl.abort(); } else closeModal(); };

function showResult(res, ctx) { running = null; const st = $('stage'); st.innerHTML = '';
  const lines = []; const s = res.settlement, r = res.reward;
  if (s) { if (res.pass) lines.push(s.stolen ? `Stole ${s.stolen} sats${s.fromFreezing ? ` (${s.fromFreezing} from freezing)` : ''}.` : s.note || 'Nothing to steal.');
    else lines.push(s.lost ? `Lost ${s.lost} hot sats: ${s.toDefender} to the defender, ${s.toBudget ?? s.burned ?? 0} back to the budget.` : 'No sats lost.'); }
  if (r) lines.push(r.sats ? `+${r.sats} test sats (hot).` : r.note || 'No reward.');
  if (ctx.mode === 'race') lines.push(`Race run: ${res.stagesCleared ?? 0}/5 stages, ${((res.timeMs || 0) / 1000).toFixed(1)} s, ${res.wrong ?? 0} wrong.`);
  if (ctx.mode === 'practice') lines.push('Practice only: nothing paid.');
  st.append(h('div', { class: 'result' + (res.pass ? '' : ' fail') }, h('p', { class: 'kicker' }, res.pass ? 'Access granted' : 'Access denied · ' + (res.reason || 'fail')), h('h3', {}, ctx.title),
    ...lines.map(t => h('p', { class: 'res-line' }, t)), h('button', { class: 'btn', onclick: closeModal }, 'Done')));
  refresh().catch(() => {}); if (ctx.mode === 'race') loadRace().catch(() => {}); if (ctx.mode === 'hack') loadTargets().catch(() => {});
}
function play(start, engine, ctx) { openModal(); running = { paid: ctx.mode === 'hack', ctl: runAttempt($('stage'), start, engine, res => showResult(res, ctx), ctx.title) }; }

$('shGo').onclick = safe(async () => { const s = await call('/v1/attempts', { mode: 'sathack', level: lvl, kit: curKit(), puzzle: FP }); play(s, remoteEngine(s.attemptId), { mode: 'sathack', title: `Sat hack · L${lvl} · ${s.sats} sats` }); refresh(); });
async function loadTargets() { const t = await call('/v1/targets'), tb = $('targets'); tb.innerHTML = '';
  $('tgNote').textContent = me && me.hot <= 0 ? 'You have no hot sats yet. Win some free sat hacks first: you can only steal up to your own hot sats.' : t.length ? '' : 'No targets in your band right now.';
  for (const x of t) tb.append(h('tr', {}, h('td', {}, x.name, x.bot ? h('span', { class: 'tbot' }, 'bot') : null), h('td', {}, x.stealable + ' sats'), h('td', {}, 'L' + x.firewall), h('td', {}, hackSec(x.firewall, curKit()) < MIN() ? lockTxt(x.firewall) : hackSec(x.firewall, curKit()) + 's'),
    h('td', {}, Object.assign(h('button', { class: 'btn', onclick: safe(async () => { const s = await call('/v1/attempts', { mode: 'hack', target: x.id, kit: curKit(), puzzle: FP }); play(s, remoteEngine(s.attemptId), { mode: 'hack', title: 'Hack ' + x.name + (s.kit ? ` · L${s.kit} kit` : '') }); }) }, hackSec(x.firewall, curKit()) < MIN() ? 'Locked' : 'Hack'), { disabled: hackSec(x.firewall, curKit()) < MIN() })))); }
$('tgRefresh').onclick = safe(loadTargets);

$('adGo').onclick = safe(async () => { const box = $('adbox'), bar = $('adBar'); box.classList.add('on'); bar.style.width = '0';
  for (let i = 1; i <= 30; i++) { await new Promise(r => setTimeout(r, 100)); bar.style.width = (i / 30 * 100) + '%'; }
  try { const r = await call('/v1/ads/complete', { token: 'mock-ssv-' + crypto.randomUUID() }); toast(`+${r.granted} points`); } finally { box.classList.remove('on'); } await refresh(); loadStore(); });

async function loadStore() { const c = await call('/v1/store'), el = $('store'); el.innerHTML = '';
  const buy = (body, label) => safe(async () => { const r = await call('/v1/store/buy', body); toast(`Bought ${label} · −${r.price} pts`); await refresh(); await loadStore(); loadTargets().catch(() => {}); });
  const btn = (label, price, body, what) => Object.assign(h('button', { class: 'btn', onclick: buy(body, what) }, `${label} · ${price} pts`), { disabled: c.pts < price });
  const F = c.firewall, fwRow = h('div', { class: 'row' });
  for (let l = 1; l <= 5; l++) fwRow.append(F.prices[l] == null ? h('span', { class: 'pill' }, `L${l} below active`) : btn(l === F.level ? `Renew L${l}` : `L${l}`, F.prices[l], { item: 'firewall', level: l }, `firewall L${l}`));
  el.append(h('div', { class: 'item' }, h('b', {}, `Firewall · now L${F.level}`), h('p', { class: 'muted' }, `Attackers get 5 s less per level. Lasts ${F.days} days, then drops to L0. Upgrading resets the timer to ${F.days} days.` + (F.level ? ` Expires in ${fmtDur(F.until - Date.now())}.` : '')), fwRow));
  const C = c.cold; el.append(h('div', { class: 'item' }, h('b', {}, `Cold storage · now L${C.level}`), h('p', { class: 'muted' }, 'Shorter freeze timer. Permanent.'),
    C.price == null ? h('span', { class: 'pill' }, 'max level') : btn(`Upgrade to L${C.nextLevel}`, C.price, { item: 'cold' }, `cold storage L${C.nextLevel}`)));
  const K = c.kits, kRow = h('div', { class: 'row' }); for (let l = 1; l <= 5; l++) kRow.append(btn(`L${l} ×${K.uses}`, K.prices[l], { item: 'kit', level: l }, `L${l} exploit kit`));
  el.append(h('div', { class: 'item' }, h('b', {}, 'Exploit Kit'), h('p', { class: 'muted' }, `Bundle of ${K.uses} charges. +${K.secondsPerLevel} s × level on PvP and sat hacks; one charge per attempt (pass or fail). Owned: ` + ([1, 2, 3, 4, 5].filter(l => K.owned[l]).map(l => `L${l}×${K.owned[l]}`).join(' · ') || 'none')), kRow));
}

$('fzAll').onclick = () => { $('fzAmt').value = me.hot; };
$('fzGo').onclick = safe(async () => { const n = parseInt($('fzAmt').value, 10); if (!(n > 0)) return toast('Enter an amount');
  if (!confirm(`Freeze ${n} sats for ${me.freezeHours} h? They can still be stolen until the timer ends, then they are frozen for good (withdraw-only).`)) return;
  await call('/v1/freeze', { amount: n }); $('fzAmt').value = ''; toast(`Freezing ${n} sats`); await refresh(); });

async function loadRace() { const r = await call('/v1/race'); $('pool').textContent = r.pool; $('week').textContent = r.week; $('raceGo').disabled = r.entered;
  $('raceMine').textContent = r.mine ? `Your run: ${r.mine.stagesCleared}/5 stages · ${(r.mine.timeMs / 1000).toFixed(1)} s · ${r.mine.wrong} wrong` : r.entered ? 'Run in progress.' : '';
  const tb = $('standings'); tb.innerHTML = ''; r.standings.forEach((x, i) => tb.append(h('tr', {}, h('td', {}, '#' + (i + 1)), h('td', {}, x.name), h('td', {}, `${x.stages}/5`), h('td', {}, x.time + ' s'), h('td', {}, x.wrong + ' wrong'))));
  if (!r.standings.length) tb.append(h('tr', {}, h('td', {}, 'No runs yet this week.'))); }
$('raceGo').onclick = safe(async () => { if (!confirm('One attempt per week: 5 puzzles, 40 s each. Start now?')) return; const s = await call('/v1/attempts', { mode: 'race' }); play(s, remoteEngine(s.attemptId), { mode: 'race', title: 'Weekly race' }); });

const pg = $('pg'); for (const [id, G] of Object.entries(META)) pg.append(h('button', { class: 'tab', onclick: () => { const p = practice(id, BASE); play(p.start, p.engine, { mode: 'practice', title: 'Practice · ' + G.name }); } }, h('span', {}, G.no), G.name));
$('snd').onchange = e => SOUND.on = e.target.checked;
$('rename').onclick = e => { e.preventDefault(); const n = prompt('New name', me?.name || ''); if (n) call('/v1/profile', { name: n }).then(refresh, err => toast(err.message)); };

async function boot() {
  if (!localStorage.getItem('named')) { $('signin').classList.remove('hidden');
    $('nameGo').onclick = safe(async () => { await call('/v1/profile', { name: $('nameIn').value }); localStorage.setItem('named', '1'); $('signin').classList.add('hidden'); boot(); }); return; }
  $('app').classList.remove('hidden'); await refresh(); await Promise.all([loadTargets(), loadStore(), loadRace()]);
}
boot().catch(e => toast('Server unreachable: ' + e.message));
