// Beta API client. Test sign-in = random device id stored locally (Bearer dev:<id>).
export const API = (localStorage.getItem('api') || 'https://btc-hack-miner-beta.indexagentica.workers.dev').replace(/\/$/, '');
export const device = () => { let d = localStorage.getItem('device'); if (!d) { d = 'd' + [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('device', d); } return d; };
export async function call(path, body) {
  const r = await fetch(API + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer dev:' + device(), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'bad response (' + r.status + ')' })); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); return j;
}
export const remoteEngine = id => ({ input: b => call(`/v1/attempts/${encodeURIComponent(id)}/input`, b), submit: b => call(`/v1/attempts/${encodeURIComponent(id)}/submit`, b), abort: () => call(`/v1/attempts/${encodeURIComponent(id)}/abort`, {}) });
