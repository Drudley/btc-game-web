// Beta API client. Test sign-in = random device id stored locally (Bearer dev:<id>).
export const API = (localStorage.getItem('api') || 'https://btc-hack-miner-beta.indexagentica.workers.dev').replace(/\/$/, '');
export const device = () => { let d = localStorage.getItem('device'); if (!d) { d = 'd' + [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('device', d); } return d; };
// Every response that carries the fresh wallet (me) is pushed to the UI right away.
let meHook = null; export const onMe = f => { meHook = f; };
// 'busy' (409 from the per-player lock) means the server applied nothing, so it is always safe to retry; do it quietly a few times.
export async function call(path, body) { for (let i = 0; ; i++) { try { return await call1(path, body); } catch (e) { if (e.status !== 409 || !/busy/.test(e.message) || i >= 3) throw e; await new Promise(r => setTimeout(r, 300 * (i + 1))); } } }
async function call1(path, body) {
  const r = await fetch(API + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer dev:' + device(), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'bad response (' + r.status + ')' })); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); if (j && j.me && meHook) { try { meHook(j.me); } catch {} } return j;
}
// Network failures (no HTTP status) are retried with the same body; each input carries a counter n so the server replays instead of applying twice.
export async function callRetry(path, body, tries = 4) { for (let i = 0; ; i++) { try { return await call(path, body); } catch (e) { if (e.status || i >= tries - 1) throw e; await new Promise(r => setTimeout(r, 400 * 2 ** i)); } } }
export const remoteEngine = id => { let n = 0; const u = x => `/v1/attempts/${encodeURIComponent(id)}/${x}`;
  return { input: b => callRetry(u('input'), { ...b, n: ++n }), submit: b => callRetry(u('submit'), { ...b, n: ++n }), abort: () => callRetry(u('abort'), {}) }; };
