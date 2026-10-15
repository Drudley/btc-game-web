import { call, remoteEngine, device, API, onMe } from './api.js';
import { META, runAttempt, h, SOUND } from './games.js';
import { practice } from './practice.js';
const $ = id => document.getElementById(id), BASE = 40, PER = 5;
const { t, srv, LOCALE } = window.I18N; const nf = n => Number(n).toLocaleString(LOCALE); // 0.4.9 i18n
const hackSec = (fw, kit) => BASE - PER * fw + PER * kit; // raw, no clamp; under me.minSeconds (15) = locked
const MIN = () => me?.minSeconds ?? 15, kitNeed = fw => Math.max(0, Math.ceil((MIN() - BASE + PER * fw) / PER));
const topKit = () => { for (let l = 5; l >= 1; l--) if ((me?.kits?.[l] || 0) > 0) return l; return 0; };
let kitSel = null; // null = auto (highest owned)
const curKit = () => kitSel != null && (kitSel === 0 || (me?.kits?.[kitSel] || 0) > 0) ? kitSel : topKit();
const lockTxt = fw => t('lock', { n: kitNeed(fw) });
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
const MODE_T = { hack: t('mode.hack'), sathack: t('mode.sathack'), race: t('mode.race') };
// 3-2-1 before every hack. It starts on tap, so the start request runs underneath it; the puzzle is mounted only after it ends
// (nothing of the puzzle is on screen during the countdown). The server starts the clock when its countdown ends, so no time is lost.
const CD = 3000;
function countdown(title) { const st = $('stage'), t0 = performance.now(); openModal(); st.innerHTML = ''; const n = h('div', { class: 'cd-num' }, '3');
  st.append(h('div', { class: 'cd' }, h('p', { class: 'kicker' }, title || t('cd.hack')), n, h('p', { class: 'muted' }, t('cd.ready'))));
  const iv = setInterval(() => { const left = Math.ceil((CD - (performance.now() - t0)) / 1000); if (left >= 1) n.textContent = left; }, 100);
  return { wait: () => new Promise(r => setTimeout(r, Math.max(0, CD - (performance.now() - t0)))).finally(() => clearInterval(iv)), stop: () => clearInterval(iv) }; }
async function startServer(body, ctx) { const cd = countdown(ctx.title || MODE_T[body.mode]);
  let s; try { s = await call('/v1/attempts', body); } catch (e) { cd.stop(); closeModal(); throw new Error(e.status ? t('start.fail', { msg: e.message }) : t('start.net')); } // never fail silently after the countdown
  if (s.resumed) { cd.stop(); toast(t('resumeToast')); ctx = { mode: s.mode, title: t('resumed', { t: MODE_T[s.mode] }) }; } else await cd.wait();
  play(s, remoteEngine(s.attemptId), ctx); return s; }

async function refresh() { render(await call('/v1/me')); }
function render(m) { if (!m || m.vsats == null) return; me = m;
  $('uname').textContent = me.name; $('scoreTop').textContent = t('top.vsats', { n: nf(me.score) }); $('crTop').textContent = t('top.credits', { n: nf(me.credits) }); $('vsats').textContent = me.vsats;
  $('band').textContent = me.band; $('credits').textContent = me.credits; $('fwInfo').textContent = me.firewall ? t('fw.on', { l: me.firewall, c: me.firewallCharges, d: fmtDur(me.firewallUntil - Date.now()) }) : t('fw.off');
  $('vpnInfo').textContent = me.vpn ? t('vpn.on', { l: me.vpn, d: fmtDur(me.vpnUntil - Date.now()) }) : t('none'); $('spyInfo').textContent = [1, 2, 3, 4, 5].filter(l => me.spyware?.[l]).map(l => `L${l}×${me.spyware[l]}`).join(' · ') || t('none');
  const pv = me.pvp || {}; $('pvpInfo').textContent = (pv.freeLeft ? t('pvp.free', { n: pv.freeLeft }) : pv.cooldownUntil ? t('pvp.cd', { d: fmtDur(pv.cooldownUntil - Date.now()) }) : t('pvp.cdRule')) + (me.recentlyHackedUntil ? t('pvp.recent', { d: fmtDur(me.recentlyHackedUntil - Date.now()) }) : '');
  drawCord();
  $('kitInfo').textContent = [1, 2, 3, 4, 5].filter(l => me.kits[l]).map(l => `L${l}×${me.kits[l]}`).join(' · ') || t('none');
  $('shLeft').textContent = me.satHacksLeft + '/' + (me.satHacksPerDay ?? 10); $('adsLeft').textContent = me.adsLeft; $('adCr').textContent = me.adCredits;
  $('adGo').disabled = me.adsLeft <= 0;
  $('shGo').disabled = me.satHacksLeft <= 0 || me.offline; $('adGo').disabled ||= !!me.offline && me.credits >= (me.reconnectCredits ?? 1000); $('raceGo').disabled = !!me.offline || $('raceGo').disabled; for (const b of ['shGo', 'adGo', 'raceGo']) $(b).classList.add('hk'); drawKits(); drawLevels(); drawOpen(); if (me.offline) for (const b of ['shGo', 'raceGo', ...(me.credits >= (me.reconnectCredits ?? 1000) ? ['adGo'] : [])]) $(b).disabled = true; $('rename').hidden = !!me.renamed; $('renameDone').hidden = !me.renamed;
}
function drawOpen() { const el = $('openHack'); el.innerHTML = ''; if (!me.open || running) return;
  el.append(h('p', {}, t('open', { m: MODE_T[me.open.mode] || t('mode.any'), s: me.open.left }), h('button', { class: 'btn hk', onclick: hackLock(() => startServer({ mode: me.open.mode }, {})) }, t('open.resume')))); }
// Defender side (being robbed), race payouts, daily resets: poll while open, and refresh on focus / app resume.
const quiet = () => !me || running || starting || document.hidden;
setInterval(() => { if (!quiet()) refreshAll(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && me && !running && !starting) refreshAll(); });
window.addEventListener('focus', () => { if (me && !running && !starting) refreshAll(); });
window.addEventListener('pageshow', () => { if (me && !running && !starting) refreshAll(); });
function drawLevels() { const el = $('levels'); el.innerHTML = '';
  for (let l = 1; l <= 5; l++) { const sec = hackSec(l, curKit()), lk = sec < MIN();
    el.append(h('button', { class: (l === lvl ? 'on' : '') + (lk ? ' locked' : ''), onclick: () => { lvl = l; localStorage.setItem('lvl', l); drawLevels(); } }, `L${l}`, h('small', {}, lk ? lockTxt(l) : t('lvl.btn', { v: me.hackVsats?.[l - 1] ?? l * 10, s: sec })))); }
  const lk = hackSec(lvl, curKit()) < MIN(); $('shGo').disabled = me.satHacksLeft <= 0 || lk; $('shGo').textContent = lk ? t('fh.locked', { l: lvl, n: kitNeed(lvl) }) : t('fh.go'); }
function drawKits() { for (const id of ['kitsSh', 'kitsPvp']) { const el = $(id); el.innerHTML = ''; const k = curKit();
  for (let l = 0; l <= 5; l++) { const n = l ? me.kits[l] || 0 : null; el.append(Object.assign(h('button', { class: l === k ? 'on' : '', onclick: () => { kitSel = l; drawKits(); drawLevels(); loadTargets().catch(() => {}); } }, l ? `L${l}` : t('kit.none'), h('small', {}, l ? `×${n} · +${5 * l}s` : t('kit.noKit'))), { disabled: l > 0 && !n })); } } }

function openModal() { $('modal').classList.add('on'); busyUI(); }
function closeModal() { $('modal').classList.remove('on'); $('stage').innerHTML = ''; busyUI(); } // lists were already refreshed when the result showed
const refreshLists = () => Promise.all([loadTargets(), loadStore(), loadRace(), loadWeek()]).catch(() => {}); // wallet itself arrives with the finish response
const refreshAll = () => Promise.all([refresh(), loadTargets(), loadStore(), loadRace(), loadWeek()]).catch(() => {}); // no stale wallet/kits/targets/race after a hack
$('closeM').onclick = () => { if (starting) return; if (running) { if (running.paid && !confirm(t('quit'))) return; running.ctl.abort(); } else closeModal(); };

function showResult(res, ctx) { running = null; busyUI(); const st = $('stage'); st.innerHTML = '';
  const lines = []; const s = res.settlement, r = res.reward;
  if (s) { if (res.pass) lines.push(s.stolen ? t('res.stole', { n: nf(s.stolen) }) : s.note ? srv(s.note) : t('res.nothing'));
    else lines.push(s.lost ? t('res.lost', { n: nf(s.lost), d: nf(s.toDefender), b: nf(s.toBudget ?? s.burned ?? 0) }) : t('res.noLoss')); }
  if (r) lines.push(r.vsats ? t('res.plus', { n: nf(r.vsats) }) : r.note ? srv(r.note) : t('res.noReward'));
  if (ctx.mode === 'race') lines.push(t('res.race', { s: res.stagesCleared ?? 0, t: ((res.timeMs || 0) / 1000).toFixed(1), w: res.wrong ?? 0 }));
  if (ctx.mode === 'practice') lines.push(t('res.practice'));
  st.append(h('div', { class: 'result' + (res.pass ? '' : ' fail') }, h('p', { class: 'kicker' }, res.pass ? t('res.ok') : t('res.denied', { r: res.reason ? (t('reason.' + res.reason) === 'reason.' + res.reason ? srv(res.reason) : t('reason.' + res.reason)) : t('reason.fail') })), h('h3', {}, ctx.title),
    ...lines.map(t => h('p', { class: 'res-line' }, t)), h('button', { class: 'btn', onclick: closeModal }, t('res.done'))));
  setTimeout(refreshLists, 0);
}
function play(start, engine, ctx) { $('stage').innerHTML = ''; $('openHack').innerHTML = ''; openModal(); running = { paid: ctx.mode === 'hack', ctl: runAttempt($('stage'), start, engine, res => showResult(res, ctx), ctx.title) }; }

$('shGo').onclick = hackLock(async () => { const L = lvl; await startServer({ mode: 'sathack', level: L, kit: curKit(), puzzle: FP }, { mode: 'sathack', title: t('fh.title', { l: L }) }); }); // wallet arrives with the start response (no extra /v1/me)
async function loadTargets() { const tl = await call('/v1/targets'), tb = $('targets'); tb.innerHTML = ''; // server order is a per-player daily shuffle: don't sort
  const minHot = me?.minAttackVsats ?? 10, pvpLocked = !me || me.vsats < minHot || me.offline, cd = me?.pvp?.cooldownUntil, Q = '???';
  $('tgNote').textContent = me?.offline ? t('tg.offline') : pvpLocked ? t('tg.locked', { min: minHot, have: me?.vsats ?? 0 }) : cd ? t('tg.cd', { d: fmtDur(cd - Date.now()) }) : tl.length ? '' : t('tg.empty');
  for (const x of tl) { const fwKnown = x.firewall != null, sec = fwKnown ? hackSec(x.firewall, curKit()) : null, tooShort = fwKnown && sec < MIN(), blocked = x.blockedUntil && x.blockedUntil > Date.now();
    const badges = [x.bot ? h('span', { class: 'tbot' }, t('tg.bot')) : null, x.vpn ? h('span', { class: 'tbot' }, x.revealed ? t('tg.vpnScanned') : 'VPN') : null, x.recentlyHackedUntil ? h('span', { class: 'tbot hot' }, t('tg.recent')) : null];
    const act = h('td', {}, Object.assign(h('button', { class: 'btn hk', onclick: hackLock(async () => { const k = curKit(); await startServer({ mode: 'hack', target: x.id, kit: k, puzzle: FP }, { mode: 'hack', title: t('tg.hackTitle', { name: x.name ?? t('tg.hidden') }) + (k ? t('tg.kit', { k }) : '') }); }) },
      pvpLocked || tooShort ? t('tg.lockedBtn') : blocked ? t('tg.blocked', { d: fmtDur(x.blockedUntil - Date.now()) }) : cd ? t('tg.cdBtn') : t('tg.hack')), { disabled: pvpLocked || tooShort || blocked || !!cd }));
    if (x.scannable) act.append(h('button', { class: 'btn ghost', onclick: safe(async () => { const r = await call('/v1/scan', { target: x.id }); toast(t('tg.scanned', { l: r.used })); if (r.vsats != null) render(r); await loadTargets(); }) }, t('tg.scan')));
    tb.append(h('tr', {}, h('td', {}, x.name ?? Q, ...badges), h('td', {}, x.stealable == null ? Q : t('top.vsats', { n: nf(x.stealable) })), h('td', {}, fwKnown ? 'L' + x.firewall + (x.firewall ? ` (${x.firewallCharges}/3)` : '') : Q), h('td', {}, !fwKnown ? Q : tooShort ? lockTxt(x.firewall) : sec + 's'), act)); } }
function cordModal(cost) { return new Promise(res => { const n = me.credits, short = n < cost;
  const close = v => { ov.remove(); res(v); };
  const ov = h('div', { class: 'cmodal', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'cbox' }, h('h3', {}, t('cord.q')),
    h('ul', {}, h('li', {}, t('cord.l1')), h('li', {}, t('cord.l2')),
      h('li', {}, t('cord.l3', { c: nf(cost), n: nf(n) })), h('li', {}, t('cord.l4', { c: nf(cost) }))),
    short ? h('p', { class: 'warn' }, t('cord.short', { n: nf(cost - n) })) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, t('cancel')), h('button', { class: 'btn', onclick: () => close(true) }, t('cord.cut')))));
  ov.addEventListener('click', e => { if (e.target === ov) close(false); }); document.body.append(ov); }); }
function drawCord() { const el = $('cord'); if (!el || !me) return; el.innerHTML = ''; const cost = me.reconnectCredits ?? 1000;
  if (!me.offline) { el.append(h('b', {}, t('cord.cut')), h('p', { class: 'muted' }, t('cord.desc', { c: nf(cost) })),
      h('button', { class: 'btn ghost', onclick: safe(async () => { if (!(await cordModal(cost))) return;
        const r = await call('/v1/cord/cut', {}); render(r.me || r); toast(t('cord.offToast')); refreshLists(); }) }, t('cord.cut'))); return; }
  const need = Math.max(0, cost - me.credits);
  el.append(h('b', {}, t('cord.offH')), h('p', { class: 'muted' }, t('cord.since', { t: new Date(me.offlineSince).toLocaleString(LOCALE), c: nf(cost) }) + (need ? t('cord.need', { n: nf(need), c: nf(cost) }) : '')),
    Object.assign(h('button', { class: 'btn', onclick: safe(async () => { const r = await call('/v1/cord/reconnect', {}); render(r.me || r); toast(t('cord.back', { c: nf(cost) })); refreshLists(); }) }, t('cord.reconnect', { c: nf(cost) })), { disabled: need > 0 })); }
$('tgRefresh').onclick = safe(loadTargets);

$('adGo').onclick = hackLock(async () => { const box = $('adbox'), bar = $('adBar'); box.classList.add('on'); bar.style.width = '0';
  for (let i = 1; i <= 30; i++) { await new Promise(r => setTimeout(r, 100)); bar.style.width = (i / 30 * 100) + '%'; }
  try { const r = await call('/v1/ads/complete', { token: 'mock-ssv-' + crypto.randomUUID() }); toast(t('ad.got', { n: r.granted })); } finally { box.classList.remove('on'); } await refresh(); loadStore(); });

async function loadStore() { const c = await call('/v1/store'), el = $('store'); el.innerHTML = '';
  const buy = (body, label) => safe(async () => { const r = await call('/v1/store/buy', body); toast(t('st.bought', { what: label, p: nf(r.price) })); await refresh(); await loadStore(); loadTargets().catch(() => {}); });
  const btn = (label, price, body, what) => Object.assign(h('button', { class: 'btn', onclick: buy(body, what) }, t('st.price', { label, p: nf(price) })), { disabled: c.credits < price });
  const F = c.firewall, fwRow = h('div', { class: 'row' });
  for (let l = 1; l <= 5; l++) fwRow.append(F.prices[l] == null ? h('span', { class: 'pill' }, t('st.below', { l })) : btn(l === F.level ? t('st.renew', { l }) : `L${l}`, F.prices[l], { item: 'firewall', level: l }, t('st.fwWhat', { l })));
  el.append(h('div', { class: 'item' }, h('b', {}, t('st.fwH', { l: F.level })), h('p', { class: 'muted' }, t('st.fwDesc', { m: c.firewallChargesMax, days: F.days }) + (F.level ? t('st.charges', { c: c.firewallCharges, m: c.firewallChargesMax }) : '') + (F.level ? t('st.expires', { d: fmtDur(F.until - Date.now()) }) : '')), fwRow));
  const V = c.vpn, vRow = h('div', { class: 'row' });
  for (let l = 1; l <= 3; l++) vRow.append(V.prices[l] == null ? h('span', { class: 'pill' }, t('st.below', { l })) : btn(l === V.level ? t('st.renew', { l }) : `L${l}`, V.prices[l], { item: 'vpn', level: l }, t('st.vpnWhat', { l })));
  el.append(h('div', { class: 'item' }, h('b', {}, t('st.vpnH', { l: V.level })), h('p', { class: 'muted' }, t('st.vpnDesc', { days: V.days }) + (V.level ? t('st.expires', { d: fmtDur(V.until - Date.now()) }) : '')), vRow));
  const SP = c.spyware, sRow = h('div', { class: 'row' }); for (let l = 1; l <= 3; l++) sRow.append(btn(`L${l} ×${SP.uses}`, SP.prices[l], { item: 'spyware', level: l }, t('st.spyWhat', { l })));
  el.append(h('div', { class: 'item' }, h('b', {}, t('st.spyH')), h('p', { class: 'muted' }, t('st.spyDesc', { u: SP.uses, o: [1, 2, 3, 4, 5].filter(l => SP.owned[l]).map(l => `L${l}×${SP.owned[l]}`).join(' · ') || t('none') })), sRow));
    const K = c.kits, kRow = h('div', { class: 'row' }); for (let l = 1; l <= 5; l++) kRow.append(btn(`L${l} ×${K.uses}`, K.prices[l], { item: 'kit', level: l }, t('st.kitWhat', { l })));
  el.append(h('div', { class: 'item' }, h('b', {}, t('st.kitH')), h('p', { class: 'muted' }, t('st.kitDesc', { u: K.uses, s: K.secondsPerLevel, o: [1, 2, 3, 4, 5].filter(l => K.owned[l]).map(l => `L${l}×${K.owned[l]}`).join(' · ') || t('none') })), kRow));
}


const fmtEnd = t => new Date(t).toLocaleString(LOCALE, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
async function loadWeek() { const w = await call('/v1/week'); $('prize').textContent = `$${w.prizeUsd}` + (w.prizeSats ? ` ≈ ${nf(w.prizeSats)} sats` : '') + (w.activePlayers != null ? t('wk.active', { n: w.activePlayers }) : ''); $('week').textContent = w.week; $('wkEnd').textContent = fmtEnd(w.endsAt);
  $('payNote').textContent = w.payoutsEnabled ? '' : t('wk.payOff'); $('rank').textContent = w.myRank ? '#' + w.myRank : '–';
  const tb = $('wkStand'); tb.innerHTML = ''; w.standings.slice(0, 10).forEach((x, i) => tb.append(h('tr', {}, h('td', {}, '#' + (i + 1)), h('td', {}, x.name), h('td', {}, t('top.vsats', { n: nf(x.score) })))));
  if (!w.standings.length) tb.append(h('tr', {}, h('td', {}, t('wk.none'))));
  $('wkLast').textContent = w.last?.winners?.length ? t('wk.last', { l: w.last.winners.map(x => `${x.name} ${nf(x.score)} vsats → $${x.usd ?? '?'}${x.sats ? ' ≈ ' + nf(x.sats) + ' sats' : ''}`).join(' · ') }) : ''; }
async function loadRace() { const r = await call('/v1/race'); $('raceDay').textContent = r.day; $('raceEnd').textContent = fmtEnd(r.endsAt); $('racePool').textContent = nf(r.prizeVsats); $('raceLast').textContent = r.last?.winners?.length ? t('race.yday', { l: r.last.winners.map(x => `${x.name} ${x.stages}/5 → ${nf(x.vsats)} vsats`).join(' · ') }) : ''; $('raceFw').textContent = r.firewall; $('raceSec').textContent = r.seconds; $('raceGo').disabled = r.entered;
  $('raceMine').textContent = r.mine ? t('race.mine', { s: r.mine.stagesCleared, t: (r.mine.timeMs / 1000).toFixed(1), w: r.mine.wrong }) : r.entered ? t('race.inprog') : '';
  const tb = $('standings'); tb.innerHTML = ''; r.standings.forEach((x, i) => tb.append(h('tr', {}, h('td', {}, '#' + (i + 1)), h('td', {}, x.name), h('td', {}, `${x.stages}/5`), h('td', {}, x.time + ' s'), h('td', {}, t('race.wrong', { n: x.wrong })))));
  if (!r.standings.length) tb.append(h('tr', {}, h('td', {}, t('race.none')))); }
$('raceGo').onclick = hackLock(async () => { if (!confirm(t('race.confirm'))) return; await startServer({ mode: 'race' }, { mode: 'race', title: t('mode.race') }); });

const pg = $('pg'); for (const [id, G] of Object.entries(META)) pg.append(h('button', { class: 'tab hk', onclick: hackLock(async () => { const p = practice(id, BASE); await countdown(t('pr.title', { g: t(`g.${id}.name`) })).wait(); play(p.start, p.engine, { mode: 'practice', title: t('pr.title', { g: t(`g.${id}.name`) }) }); }) }, h('span', {}, G.no), t(`g.${id}.name`)));
$('snd').onchange = e => SOUND.on = e.target.checked;
$('rename').onclick = e => { e.preventDefault(); if (me?.renamed) return toast(t('rn.used')); const n = prompt(t('rn.prompt'), me?.name || ''); if (!n) return; if (!confirm(t('rn.confirm', { n: n.trim() }))) return; call('/v1/profile', { name: n }).then(refresh, err => toast(err.message)); };

onMe(render); // server pushes the fresh wallet with every mutating response
$('delAcc').onclick = safe(async () => {
  if (!confirm(t('del.confirm'))) return;
  if ((prompt(t('del.type')) || '').trim().toUpperCase() !== 'DELETE') return toast(t('del.not'));
  await call('/v1/account/delete', { confirm: 'DELETE' }); for (const k of ['device', 'named']) localStorage.removeItem(k);
  alert(t('del.done')); location.reload(); });
async function boot() {
  if (!localStorage.getItem('named')) { $('signin').classList.remove('hidden');
    $('nameGo').onclick = safe(async () => { await call('/v1/profile', { name: $('nameIn').value }); localStorage.setItem('named', '1'); $('signin').classList.add('hidden'); boot(); }); return; }
  $('app').classList.remove('hidden'); await refresh(); await Promise.all([loadTargets(), loadStore(), loadRace(), loadWeek()]);
}
boot().catch(e => { if (e.status === 410) { for (const k of ['device', 'named']) localStorage.removeItem(k); return location.reload(); } toast(t('unreach', { msg: e.message })); });
