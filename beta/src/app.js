import { call, remoteEngine, device, API, onMe } from './api.js';
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
// One hack at a time: every hack-starting button (PvP, free hack, race, practice, ad, resume) goes through this guard. While a start is in
// flight or a hack/ad is open, further taps are ignored and the buttons are shown disabled (body.hacking).
let starting = false; const busyUI = () => document.body.classList.toggle('hacking', starting || !!running || $('modal').classList.contains('on') || $('adbox').classList.contains('on'));
const hackLock = fn => async (...a) => { if (starting || running || $('modal').classList.contains('on') || $('adbox').classList.contains('on')) return; starting = true; busyUI();
  try { await fn(...a); } catch (e) { toast(e.message); } finally { starting = false; busyUI(); } };
const MODE_T = { hack: 'PvP hack', sathack: 'Free hack', race: 'Daily race' };
// 3-2-1 before every hack. It starts on tap, so the start request runs underneath it; the puzzle is mounted only after it ends
// (nothing of the puzzle is on screen during the countdown). The server starts the clock when its countdown ends, so no time is lost.
const CD = 3000;
function countdown(title) { const st = $('stage'), t0 = performance.now(); openModal(); st.innerHTML = ''; const n = h('div', { class: 'cd-num' }, '3');
  st.append(h('div', { class: 'cd' }, h('p', { class: 'kicker' }, title || 'Hack'), n, h('p', { class: 'muted' }, 'Get ready…')));
  const iv = setInterval(() => { const left = Math.ceil((CD - (performance.now() - t0)) / 1000); if (left >= 1) n.textContent = left; }, 100);
  return { wait: () => new Promise(r => setTimeout(r, Math.max(0, CD - (performance.now() - t0)))).finally(() => clearInterval(iv)), stop: () => clearInterval(iv) }; }
async function startServer(body, ctx) { const cd = countdown(ctx.title || MODE_T[body.mode]);
  let s; try { s = await call('/v1/attempts', body); } catch (e) { cd.stop(); closeModal(); throw new Error(e.status ? `Hack not started: ${e.message}` : 'Hack not started: network problem, nothing was used. Tap again.'); } // never fail silently after the countdown
  if (s.resumed) { cd.stop(); toast('You already have an open hack: resuming it'); ctx = { mode: s.mode, title: MODE_T[s.mode] + ' (resumed)' }; } else await cd.wait();
  play(s, remoteEngine(s.attemptId), ctx); return s; }

async function refresh() { render(await call('/v1/me')); }
function render(m) { if (!m || m.vsats == null) return; me = m;
  $('uname').textContent = me.name; $('scoreTop').textContent = me.score + ' vsats'; $('crTop').textContent = me.credits + ' credits'; $('vsats').textContent = me.vsats;
  $('band').textContent = me.band; $('credits').textContent = me.credits; $('fwInfo').textContent = me.firewall ? `L${me.firewall} · ${me.firewallCharges}/3 charges · ${fmtDur(me.firewallUntil - Date.now())} left` : 'L0 (none)';
  $('vpnInfo').textContent = me.vpn ? `L${me.vpn} · ${fmtDur(me.vpnUntil - Date.now())} left` : 'none'; $('spyInfo').textContent = [1, 2, 3, 4, 5].filter(l => me.spyware?.[l]).map(l => `L${l}×${me.spyware[l]}`).join(' · ') || 'none';
  const pv = me.pvp || {}; $('pvpInfo').textContent = (pv.freeLeft ? `${pv.freeLeft} attacks before cooldown` : pv.cooldownUntil ? `cooldown ${fmtDur(pv.cooldownUntil - Date.now())}` : '30 min cooldown between attacks') + (me.recentlyHackedUntil ? ` · you were recently hacked (${fmtDur(me.recentlyHackedUntil - Date.now())})` : '');
  drawCord();
  $('kitInfo').textContent = [1, 2, 3, 4, 5].filter(l => me.kits[l]).map(l => `L${l}×${me.kits[l]}`).join(' · ') || 'none';
  $('shLeft').textContent = me.satHacksLeft + '/' + (me.satHacksPerDay ?? 10); $('adsLeft').textContent = me.adsLeft; $('adCr').textContent = me.adCredits;
  $('adGo').disabled = me.adsLeft <= 0;
  $('shGo').disabled = me.satHacksLeft <= 0 || me.offline; $('adGo').disabled ||= !!me.offline; $('raceGo').disabled = !!me.offline || $('raceGo').disabled; for (const b of ['shGo', 'adGo', 'raceGo']) $(b).classList.add('hk'); drawKits(); drawLevels(); drawOpen(); if (me.offline) for (const b of ['shGo', 'adGo', 'raceGo']) $(b).disabled = true; $('dev').textContent = device(); $('apiUrl').textContent = API;
}
function drawOpen() { const el = $('openHack'); el.innerHTML = ''; if (!me.open || running) return;
  el.append(h('p', {}, `You have an open ${MODE_T[me.open.mode] || 'hack'} (${me.open.left}s left). `, h('button', { class: 'btn hk', onclick: hackLock(() => startServer({ mode: me.open.mode }, {})) }, 'Resume it'))); }
// Defender side (being robbed), race payouts, daily resets: poll while open, and refresh on focus / app resume.
const quiet = () => !me || running || starting || document.hidden;
setInterval(() => { if (!quiet()) refreshAll(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && me && !running && !starting) refreshAll(); });
window.addEventListener('focus', () => { if (me && !running && !starting) refreshAll(); });
window.addEventListener('pageshow', () => { if (me && !running && !starting) refreshAll(); });
function drawLevels() { const el = $('levels'); el.innerHTML = '';
  for (let l = 1; l <= 5; l++) { const sec = hackSec(l, curKit()), lk = sec < MIN();
    el.append(h('button', { class: (l === lvl ? 'on' : '') + (lk ? ' locked' : ''), onclick: () => { lvl = l; localStorage.setItem('lvl', l); drawLevels(); } }, `L${l}`, h('small', {}, lk ? lockTxt(l) : `${me.hackVsats?.[l - 1] ?? l * 10} vsats · ${sec}s`))); }
  const lk = hackSec(lvl, curKit()) < MIN(); $('shGo').disabled = me.satHacksLeft <= 0 || lk; $('shGo').textContent = lk ? `L${lvl} locked: needs L${kitNeed(lvl)}+ kit` : 'Start free hack'; }
function drawKits() { for (const id of ['kitsSh', 'kitsPvp']) { const el = $(id); el.innerHTML = ''; const k = curKit();
  for (let l = 0; l <= 5; l++) { const n = l ? me.kits[l] || 0 : null; el.append(Object.assign(h('button', { class: l === k ? 'on' : '', onclick: () => { kitSel = l; drawKits(); drawLevels(); loadTargets().catch(() => {}); } }, l ? `L${l}` : 'None', h('small', {}, l ? `×${n} · +${5 * l}s` : 'no kit')), { disabled: l > 0 && !n })); } } }

function openModal() { $('modal').classList.add('on'); busyUI(); }
function closeModal() { $('modal').classList.remove('on'); $('stage').innerHTML = ''; busyUI(); } // lists were already refreshed when the result showed
const refreshLists = () => Promise.all([loadTargets(), loadStore(), loadRace(), loadWeek()]).catch(() => {}); // wallet itself arrives with the finish response
const refreshAll = () => Promise.all([refresh(), loadTargets(), loadStore(), loadRace(), loadWeek()]).catch(() => {}); // no stale wallet/kits/targets/race after a hack
$('closeM').onclick = () => { if (starting) return; if (running) { if (running.paid && !confirm('Quit? A PvP hack you quit counts as a failed hack.')) return; running.ctl.abort(); } else closeModal(); };

function showResult(res, ctx) { running = null; busyUI(); const st = $('stage'); st.innerHTML = '';
  const lines = []; const s = res.settlement, r = res.reward;
  if (s) { if (res.pass) lines.push(s.stolen ? `Stole ${s.stolen} vsats.` : s.note || 'Nothing to steal.');
    else lines.push(s.lost ? `Lost ${s.lost} vsats: ${s.toDefender} to the defender, ${s.toBudget ?? s.burned ?? 0} back to the budget.` : 'No vsats lost.'); }
  if (r) lines.push(r.vsats ? `+${r.vsats} vsats.` : r.note || 'No reward.');
  if (ctx.mode === 'race') lines.push(`Race run: ${res.stagesCleared ?? 0}/5 stages, ${((res.timeMs || 0) / 1000).toFixed(1)} s, ${res.wrong ?? 0} wrong.`);
  if (ctx.mode === 'practice') lines.push('Practice only: nothing paid.');
  st.append(h('div', { class: 'result' + (res.pass ? '' : ' fail') }, h('p', { class: 'kicker' }, res.pass ? 'Access granted' : 'Access denied · ' + (res.reason || 'fail')), h('h3', {}, ctx.title),
    ...lines.map(t => h('p', { class: 'res-line' }, t)), h('button', { class: 'btn', onclick: closeModal }, 'Done')));
  setTimeout(refreshLists, 0);
}
function play(start, engine, ctx) { $('stage').innerHTML = ''; $('openHack').innerHTML = ''; openModal(); running = { paid: ctx.mode === 'hack', ctl: runAttempt($('stage'), start, engine, res => showResult(res, ctx), ctx.title) }; }

$('shGo').onclick = hackLock(async () => { const L = lvl; await startServer({ mode: 'sathack', level: L, kit: curKit(), puzzle: FP }, { mode: 'sathack', title: `Free hack · L${L}` }); }); // wallet arrives with the start response (no extra /v1/me)
async function loadTargets() { const t = await call('/v1/targets'), tb = $('targets'); tb.innerHTML = ''; // server order is a per-player daily shuffle: don't sort
  const minHot = me?.minAttackVsats ?? 10, pvpLocked = !me || me.vsats < minHot || me.offline, cd = me?.pvp?.cooldownUntil, Q = '???';
  $('tgNote').textContent = me?.offline ? 'You cut the cord: reconnect in Account to play.' : pvpLocked ? `PvP locked: you need at least ${minHot} vsats to attack (you have ${me?.vsats ?? 0}), so a loss always costs something. Win free hacks first.` : cd ? `PvP cooldown: next attack in ${fmtDur(cd - Date.now())}.` : t.length ? '' : 'No targets in your band right now.';
  for (const x of t) { const fwKnown = x.firewall != null, sec = fwKnown ? hackSec(x.firewall, curKit()) : null, tooShort = fwKnown && sec < MIN(), blocked = x.blockedUntil && x.blockedUntil > Date.now();
    const badges = [x.bot ? h('span', { class: 'tbot' }, 'bot') : null, x.vpn ? h('span', { class: 'tbot' }, x.revealed ? 'VPN · scanned' : 'VPN') : null, x.recentlyHackedUntil ? h('span', { class: 'tbot hot' }, 'recently hacked') : null];
    const act = h('td', {}, Object.assign(h('button', { class: 'btn hk', onclick: hackLock(async () => { const k = curKit(); await startServer({ mode: 'hack', target: x.id, kit: k, puzzle: FP }, { mode: 'hack', title: 'Hack ' + (x.name ?? 'hidden target') + (k ? ` · L${k} kit` : '') }); }) },
      pvpLocked || tooShort ? 'Locked' : blocked ? 'Blocked ' + fmtDur(x.blockedUntil - Date.now()) : cd ? 'Cooldown' : 'Hack'), { disabled: pvpLocked || tooShort || blocked || !!cd }));
    if (x.scannable) act.append(h('button', { class: 'btn ghost', onclick: safe(async () => { const r = await call('/v1/scan', { target: x.id }); toast(`Scanned · used an L${r.used} spyware charge`); if (r.vsats != null) render(r); await loadTargets(); }) }, 'Scan'));
    tb.append(h('tr', {}, h('td', {}, x.name ?? Q, ...badges), h('td', {}, x.stealable == null ? Q : x.stealable + ' vsats'), h('td', {}, fwKnown ? 'L' + x.firewall + (x.firewall ? ` (${x.firewallCharges}/3)` : '') : Q), h('td', {}, !fwKnown ? Q : tooShort ? lockTxt(x.firewall) : sec + 's'), act)); } }
function drawCord() { const el = $('cord'); if (!el || !me) return; el.innerHTML = ''; const cost = me.reconnectCredits ?? 1000;
  if (!me.offline) { el.append(h('b', {}, 'Cut the cord'), h('p', { class: 'muted' }, `Taking a longer break? Go offline: you're hidden from PvP and can't be attacked. While offline you can't do free hacks, PvP, the race or ads; your vsats stay. Reconnecting costs ${cost.toLocaleString()} store credits.`),
      h('button', { class: 'btn ghost', onclick: safe(async () => { if (!confirm(`Cut the cord?\n\nYou'll be hidden from PvP and can't be attacked. You can't play free hacks, PvP, the race or ads until you reconnect. Your vsats stay.\n\nReconnecting costs ${cost.toLocaleString()} store credits (you have ${me.credits.toLocaleString()}).` + (me.credits < cost ? `\n\nWarning: you don't have enough credits to reconnect, and ads are off while offline, so you couldn't come back.` : ''))) return;
        const r = await call('/v1/cord/cut', {}); render(r.me || r); toast('Offline. Enjoy the break.'); refreshLists(); }) }, 'Cut the cord')); return; }
  const need = Math.max(0, cost - me.credits);
  el.append(h('b', {}, 'Offline (cord cut)'), h('p', { class: 'muted' }, `Since ${new Date(me.offlineSince).toLocaleString()}. You're hidden from PvP. Reconnecting costs ${cost.toLocaleString()} store credits.` + (need ? ` You need ${need.toLocaleString()} more (ads are off while offline).` : '')),
    Object.assign(h('button', { class: 'btn', onclick: safe(async () => { const r = await call('/v1/cord/reconnect', {}); render(r.me || r); toast(`Back online · −${cost.toLocaleString()} credits`); refreshLists(); }) }, `Reconnect · ${cost.toLocaleString()} credits`), { disabled: need > 0 })); }
$('tgRefresh').onclick = safe(loadTargets);

$('adGo').onclick = hackLock(async () => { const box = $('adbox'), bar = $('adBar'); box.classList.add('on'); bar.style.width = '0';
  for (let i = 1; i <= 30; i++) { await new Promise(r => setTimeout(r, 100)); bar.style.width = (i / 30 * 100) + '%'; }
  try { const r = await call('/v1/ads/complete', { token: 'mock-ssv-' + crypto.randomUUID() }); toast(`+${r.granted} credits`); } finally { box.classList.remove('on'); } await refresh(); loadStore(); });

async function loadStore() { const c = await call('/v1/store'), el = $('store'); el.innerHTML = '';
  const buy = (body, label) => safe(async () => { const r = await call('/v1/store/buy', body); toast(`Bought ${label} · −${r.price} credits`); await refresh(); await loadStore(); loadTargets().catch(() => {}); });
  const btn = (label, price, body, what) => Object.assign(h('button', { class: 'btn', onclick: buy(body, what) }, `${label} · ${price} credits`), { disabled: c.credits < price });
  const F = c.firewall, fwRow = h('div', { class: 'row' });
  for (let l = 1; l <= 5; l++) fwRow.append(F.prices[l] == null ? h('span', { class: 'pill' }, `L${l} below active`) : btn(l === F.level ? `Renew L${l}` : `L${l}`, F.prices[l], { item: 'firewall', level: l }, `firewall L${l}`));
  el.append(h('div', { class: 'item' }, h('b', {}, `Firewall · now L${F.level}`), h('p', { class: 'muted' }, `Attackers get 5 s less per level. ${c.firewallChargesMax} charges: a successful hack with an exploit kit of your firewall's level or higher uses one; after ${c.firewallChargesMax} it drops a level (same expiry, fresh charges). Lasts ${F.days} days, then drops to L0. Buying resets timer and charges.` + (F.level ? ` Charges ${c.firewallCharges}/${c.firewallChargesMax}.` : '') + (F.level ? ` Expires in ${fmtDur(F.until - Date.now())}.` : '')), fwRow));
  const V = c.vpn, vRow = h('div', { class: 'row' });
  for (let l = 1; l <= 3; l++) vRow.append(V.prices[l] == null ? h('span', { class: 'pill' }, `L${l} below active`) : btn(l === V.level ? `Renew L${l}` : `L${l}`, V.prices[l], { item: 'vpn', level: l }, `VPN L${l}`));
  el.append(h('div', { class: 'item' }, h('b', {}, `VPN · now L${V.level}`), h('p', { class: 'muted' }, `Hides you in attackers' target lists: L1 your name, L2 also your firewall, L3 also your vsats (shown as ???). Lasts ${V.days} days; upgrading resets the timer.` + (V.level ? ` Expires in ${fmtDur(V.until - Date.now())}.` : '')), vRow));
  const SP = c.spyware, sRow = h('div', { class: 'row' }); for (let l = 1; l <= 3; l++) sRow.append(btn(`L${l} ×${SP.uses}`, SP.prices[l], { item: 'spyware', level: l }, `L${l} spyware`));
  el.append(h('div', { class: 'item' }, h('b', {}, 'Spyware'), h('p', { class: 'muted' }, `Bundle of ${SP.uses} scan charges. Tap Scan on a VPN target: one charge of level ≥ their VPN reveals everything until the end of the day (or until they change their VPN). Owned: ` + ([1, 2, 3, 4, 5].filter(l => SP.owned[l]).map(l => `L${l}×${SP.owned[l]}`).join(' · ') || 'none')), sRow));
    const K = c.kits, kRow = h('div', { class: 'row' }); for (let l = 1; l <= 5; l++) kRow.append(btn(`L${l} ×${K.uses}`, K.prices[l], { item: 'kit', level: l }, `L${l} exploit kit`));
  el.append(h('div', { class: 'item' }, h('b', {}, 'Exploit Kit'), h('p', { class: 'muted' }, `Bundle of ${K.uses} charges. +${K.secondsPerLevel} s × level on PvP and free hacks; one charge per attempt (pass or fail). Owned: ` + ([1, 2, 3, 4, 5].filter(l => K.owned[l]).map(l => `L${l}×${K.owned[l]}`).join(' · ') || 'none')), kRow));
}


const fmtEnd = t => new Date(t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
async function loadWeek() { const w = await call('/v1/week'); $('prize').textContent = `$${w.prizeUsd}` + (w.prizeSats ? ` ≈ ${w.prizeSats.toLocaleString()} sats` : '') + (w.activePlayers != null ? ` (${w.activePlayers} active players: +$1 per 10)` : ''); $('week').textContent = w.week; $('wkEnd').textContent = fmtEnd(w.endsAt);
  $('payNote').textContent = w.payoutsEnabled ? '' : 'Prize payouts are off in the beta.'; $('rank').textContent = w.myRank ? '#' + w.myRank : '–';
  const tb = $('wkStand'); tb.innerHTML = ''; w.standings.slice(0, 10).forEach((x, i) => tb.append(h('tr', {}, h('td', {}, '#' + (i + 1)), h('td', {}, x.name), h('td', {}, x.score + ' vsats'))));
  if (!w.standings.length) tb.append(h('tr', {}, h('td', {}, 'No scores yet this week.')));
  $('wkLast').textContent = w.last?.winners?.length ? 'Last week: ' + w.last.winners.map(x => `${x.name} ${x.score} vsats → $${x.usd ?? '?'}${x.sats ? ' ≈ ' + x.sats + ' sats' : ''}`).join(' · ') : ''; }
async function loadRace() { const r = await call('/v1/race'); $('raceDay').textContent = r.day; $('raceEnd').textContent = fmtEnd(r.endsAt); $('racePool').textContent = r.prizeVsats.toLocaleString(); $('raceLast').textContent = r.last?.winners?.length ? 'Yesterday: ' + r.last.winners.map(x => `${x.name} ${x.stages}/5 → ${x.vsats} vsats`).join(' · ') : ''; $('raceFw').textContent = r.firewall; $('raceSec').textContent = r.seconds; $('raceGo').disabled = r.entered;
  $('raceMine').textContent = r.mine ? `Your run: ${r.mine.stagesCleared}/5 stages · ${(r.mine.timeMs / 1000).toFixed(1)} s · ${r.mine.wrong} wrong` : r.entered ? 'Run in progress.' : '';
  const tb = $('standings'); tb.innerHTML = ''; r.standings.forEach((x, i) => tb.append(h('tr', {}, h('td', {}, '#' + (i + 1)), h('td', {}, x.name), h('td', {}, `${x.stages}/5`), h('td', {}, x.time + ' s'), h('td', {}, x.wrong + ' wrong'))));
  if (!r.standings.length) tb.append(h('tr', {}, h('td', {}, 'No runs yet today.'))); }
$('raceGo').onclick = hackLock(async () => { if (!confirm('One run per day: 5 puzzles against L3 firewalls, 25 s each. Start now?')) return; await startServer({ mode: 'race' }, { mode: 'race', title: 'Daily race' }); });

const pg = $('pg'); for (const [id, G] of Object.entries(META)) pg.append(h('button', { class: 'tab hk', onclick: hackLock(async () => { const p = practice(id, BASE); await countdown('Practice · ' + G.name).wait(); play(p.start, p.engine, { mode: 'practice', title: 'Practice · ' + G.name }); }) }, h('span', {}, G.no), G.name));
$('snd').onchange = e => SOUND.on = e.target.checked;
$('rename').onclick = e => { e.preventDefault(); const n = prompt('New name', me?.name || ''); if (n) call('/v1/profile', { name: n }).then(refresh, err => toast(err.message)); };

onMe(render); // server pushes the fresh wallet with every mutating response
$('delAcc').onclick = safe(async () => {
  if (!confirm('Delete your account? Your name, hacks and race entries are deleted and all vsats and store credits are forfeited. This cannot be undone.')) return;
  if ((prompt('Type DELETE to confirm') || '').trim().toUpperCase() !== 'DELETE') return toast('Not deleted');
  await call('/v1/account/delete', { confirm: 'DELETE' }); for (const k of ['device', 'named']) localStorage.removeItem(k);
  alert('Your account was deleted.'); location.reload(); });
async function boot() {
  if (!localStorage.getItem('named')) { $('signin').classList.remove('hidden');
    $('nameGo').onclick = safe(async () => { await call('/v1/profile', { name: $('nameIn').value }); localStorage.setItem('named', '1'); $('signin').classList.add('hidden'); boot(); }); return; }
  $('app').classList.remove('hidden'); await refresh(); await Promise.all([loadTargets(), loadStore(), loadRace(), loadWeek()]);
}
boot().catch(e => { if (e.status === 410) { for (const k of ['device', 'named']) localStorage.removeItem(k); return location.reload(); } toast('Server unreachable: ' + e.message); });
