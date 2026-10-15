// i18n engine (0.4.9). Classic script, loaded after src/i18n/*.js and before collapse.js / app.js.
// Language: localStorage 'lang' (picker in Account) or navigator.languages, English fallback for missing languages and keys.
(() => {
  const D = window.I18N_D || {}, LANGS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'sv'];
  const pick = () => { const s = localStorage.getItem('lang'); if (s && D[s]) return s;
    for (const l of navigator.languages || [navigator.language || 'en']) { const b = String(l).toLowerCase().split('-')[0]; if (D[b]) return b; } return 'en'; };
  const LANG = pick(), LOCALE = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', it: 'it-IT', sv: 'sv-SE' }[LANG];
  const URLS = { P: 'https://drudley.github.io/btc-game-web/privacy/', D: 'https://drudley.github.io/btc-game-web/delete-account/' };
  const t = (k, v = {}) => { let s = D[LANG]?.[k] ?? D.en[k] ?? k; return s.replace(/\{(\w+)\}/g, (m, n) => n in v ? String(v[n]) : m); };
  // Server error/notes are English sentences; map known ones to translated strings, pass unknown ones through.
  const SRV = [
    [/^ad not verified$/, 'e.adNotVerified'], [/^invalid target$/, 'e.invalidTarget'], [/^name must be 2-20/, 'e.name'],
    [/^target has no VPN/, 'e.noVpn'], [/^target is offline$/, 'e.targetOffline'], [/^unknown store item$/, 'e.unknownItem'],
    [/^needs an L(\d+)\+ spyware charge$/, 'e.spyNeed', 'l'], [/^no L(\d+) exploit kit charges$/, 'e.noKit', 'l'],
    [/^reconnecting costs (\d+) store credits; you need (\d+) more$/, 'e.reconnectCost', 'c', 'n'],
    [/^your L(\d+) VPN is still active/, 'e.vpnActive', 'l'], [/^your L(\d+) firewall is still active/, 'e.fwActive', 'l'],
    [/^locked: their firewall \(hidden by VPN\)/, 'e.lockedVpn'], [/^target not in your band$/, 'e.band'], [/^you cut the cord/, 'e.cordCut'],
    [/^locked: L(\d+) free hack needs an L(\d+)\+ exploit kit \(time would be (-?\d+)s < (\d+)s\)$/, 'e.lockedFree', 'l', 'k', 's', 'm'],
    [/^locked: L(\d+) firewall needs an L(\d+)\+ exploit kit \(time would be (-?\d+)s < (\d+)s\)$/, 'e.lockedFw', 'l', 'k', 's', 'm'],
    [/^locked: PvP needs at least (\d+) vsats \(you have (\d+)\)$/, 'e.lockedPvp', 'n', 'h'], [/^offline: ads stop at (\d+) credits/, 'e.offlineAds', 'c'],
    [/^attempt not found$/, 'e.attempt'], [/^busy/, 'e.busy'], [/^finish your hack first$/, 'e.finish'], [/^name already changed/, 'e.renamed'],
    [/^one race attempt per day$/, 'e.race'], [/^account deleted$/, 'e.deleted'], [/^daily ad limit$/, 'e.adLimit'], [/^no free hacks left today$/, 'e.noFree'],
    [/^PvP cooldown: next attack in (\d+) min$/, 'e.pvpCd', 'n'], [/^you failed against this target; try again in (\d+) min$/, 'e.failedTarget', 'n'],
    [/^reward budget empty$/, 'e.budget'], [/^need at least (\d+) vsats at settlement \(you have (\d+)\)$/, 'e.settleMin', 'n', 'h'],
    [/^already (settled|rewarded)$/, 'e.already'], [/^bad response \((\d+)\)$/, 'e.bad', 'n'],
  ];
  const srv = msg => { const m0 = String(msg ?? ''); for (const [re, k, ...names] of SRV) { const m = m0.match(re); if (m) return t(k, Object.fromEntries(names.map((n, i) => [n, m[i + 1]]))); } return m0; };
  // DOM: [data-i18n] sets innerHTML; {id} placeholders re-insert the element's own id'd children (kept live for app.js).
  const apply = (root = document) => {
    for (const el of root.querySelectorAll('[data-i18n]')) { const kids = {}; el.querySelectorAll('[id]').forEach(c => kids[c.id] = c);
      el.innerHTML = t(el.dataset.i18n, URLS).replace(/\{(\w+)\}/g, (m, n) => kids[n] ? `<i data-slot="${n}"></i>` : m);
      el.querySelectorAll('[data-slot]').forEach(s => s.replaceWith(kids[s.dataset.slot])); }
    for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    document.documentElement.lang = LANG; document.title = t('title');
    const sel = document.getElementById('langSel'); if (sel) { sel.innerHTML = '';
      const add = (v, txt) => { const o = document.createElement('option'); o.value = v; o.textContent = txt; sel.append(o); };
      add('', t('lang.auto')); for (const l of LANGS) if (D[l]) add(l, D[l]['lang.name']); sel.value = localStorage.getItem('lang') || '';
      sel.onchange = () => { sel.value ? localStorage.setItem('lang', sel.value) : localStorage.removeItem('lang'); location.reload(); }; }
  };
  window.I18N = { t, srv, LANG, LOCALE, LANGS, apply };
  apply();
})();
