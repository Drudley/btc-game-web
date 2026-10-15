// Collapsible sections (0.4.4): every main section with an <h2> starts closed; tap the header to slide it open/closed.
// The name prompt stays open (it's an action the player must take). Content is wrapped, not re-rendered, so ids keep working.
for (const sec of document.querySelectorAll('main section, body > section, section')) {
  const h = sec.querySelector(':scope > h2'); if (!h || sec.dataset.coll) continue; sec.dataset.coll = 1;
  if (sec.closest('#signin')) continue; // the name prompt stays open (any language)
  const body = document.createElement('div'); body.className = 'cbody'; const inner = document.createElement('div'); inner.className = 'cinner'; body.append(inner);
  while (h.nextSibling) inner.append(h.nextSibling); sec.append(body);
  sec.classList.add('coll', 'closed'); h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', 'false');
  const toggle = () => { const open = sec.classList.contains('closed'); h.setAttribute('aria-expanded', String(open));
    if (open) { sec.classList.remove('closed'); body.style.height = inner.scrollHeight + 'px'; }
    else { body.style.height = body.scrollHeight + 'px'; body.offsetHeight; sec.classList.add('closed'); body.style.height = '0px'; } };
  body.addEventListener('transitionend', e => { if (e.target === body && !sec.classList.contains('closed')) body.style.height = 'auto'; }); // auto so live content can grow
  h.addEventListener('click', toggle); h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
}
