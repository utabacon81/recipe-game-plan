/* Step alerts by web push, stored in D1 (binding name: DB).
   Pushes carry no payload: the service worker fetches the message text from the inbox, so no payload encryption is needed.

   GET    /api/push?key=1                      -> {publicKey}           VAPID public key (created on first use)
   POST   /api/push       {device, sub, items} -> {ok, n}               replace this device's upcoming alerts
   POST   /api/push       {device, sub, test}  -> {ok}                  queue one test alert for now
   DELETE /api/push?device=ID                  -> {ok}                  turn alerts off for a device
   GET    /api/push?inbox=1&endpoint=URL       -> {items}               messages already pushed and not yet shown
   GET|POST /api/push?tick=1                   -> {sent}                send everything that's due (called every minute by the cron Worker) */

let ready = false;
async function init(db){
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, sub TEXT NOT NULL, updated INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS alerts (device TEXT NOT NULL, at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tag TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE INDEX IF NOT EXISTS alerts_due ON alerts (sent, at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS alerts_dev ON alerts (device, sent)")
  ]);
  /* Delivery diagnostics, added after launch: ignore "duplicate column" errors. */
  for (const col of ["last_status INTEGER", "last_body TEXT", "last_at INTEGER"]) {
    try { await db.prepare("ALTER TABLE devices ADD COLUMN " + col).run(); } catch (e) {}
  }
  ready = true;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const DEV = /^[a-z0-9]{12,32}$/;
const LATE = 30 * 60000;   /* alerts more than 30 minutes overdue are dropped, not sent */

async function vapid(db){
  let row = await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    await db.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ pub, jwk })).run();
    row = await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  }
  return JSON.parse(row.v);
}
async function authHeader(endpoint, v, subject){
  const enc = new TextEncoder();
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + v.pub;
}
function cleanItem(x){
  if (!x || typeof x.at !== "number" || !isFinite(x.at)) return null;
  return { at: Math.round(x.at), title: String(x.title || "Game Plan").slice(0, 120), body: String(x.body || "").slice(0, 300), tag: String(x.tag || "rgp").slice(0, 60) };
}
async function body(request){ try { return await request.json(); } catch (e) { return null; } }

async function tick(db, origin){
  const now = Date.now();
  /* Anything well overdue (the ticker was down) is marked done without a push. */
  await db.prepare("UPDATE alerts SET sent = ?, seen = 1 WHERE sent = 0 AND at < ?").bind(now, now - LATE).run();
  const { results } = await db.prepare("SELECT DISTINCT device FROM alerts WHERE sent = 0 AND at <= ? LIMIT 40").bind(now + 30000).all();
  if (!results || !results.length) return 0;
  const v = await vapid(db);
  let sent = 0;
  for (const { device } of results) {
    await db.prepare("UPDATE alerts SET sent = ? WHERE device = ? AND sent = 0 AND at <= ?").bind(now, device, now + 30000).run();
    const d = await db.prepare("SELECT endpoint FROM devices WHERE id = ?").bind(device).first();
    if (!d) continue;
    let status = 0, text = "";
    try {
      const res = await fetch(d.endpoint, { method: "POST", body: new Uint8Array(0), headers: { "Authorization": await authHeader(d.endpoint, v, origin), "TTL": "1800", "Urgency": "high", "Content-Type": "application/octet-stream" } });
      status = res.status; text = (await res.text()).slice(0, 300);
      if (res.ok) sent++;
    } catch (e) { text = String(e && e.message || e).slice(0, 300); }
    await db.prepare("UPDATE devices SET last_status = ?, last_body = ?, last_at = ? WHERE id = ?").bind(status, text, Date.now(), device).run();
  }
  return sent;
}

export async function onRequest({ request, env }){
  if (!env.DB) return json({ error: "Alerts need the D1 binding named DB." }, 503);
  const db = env.DB;
  try {
    await init(db);
    const url = new URL(request.url);
    const q = url.searchParams, m = request.method;

    if (q.get("tick")) return json({ sent: await tick(db, url.origin) });

    if (m === "GET" && q.get("key")) return json({ publicKey: (await vapid(db)).pub });

    if (m === "GET" && q.get("status")) {
      const id = q.get("device") || "";
      const d = await db.prepare("SELECT endpoint, last_status, last_body, last_at FROM devices WHERE id = ?").bind(id).first();
      if (!d) return json({ found: false });
      const p = await db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE device = ? AND sent = 0").bind(id).first();
      return json({ found: true, host: new URL(d.endpoint).host, lastStatus: d.last_status, lastBody: d.last_body, lastAt: d.last_at, pending: p ? p.n : 0 });
    }

    if (m === "GET" && q.get("inbox")) {
      const endpoint = q.get("endpoint") || "";
      const d = await db.prepare("SELECT id FROM devices WHERE endpoint = ?").bind(endpoint).first();
      if (!d) return json({ items: [] });
      const { results } = await db.prepare("SELECT at, title, body, tag FROM alerts WHERE device = ? AND sent > 0 AND seen = 0 ORDER BY at").bind(d.id).all();
      await db.batch([
        db.prepare("UPDATE alerts SET seen = 1 WHERE device = ? AND sent > 0 AND seen = 0").bind(d.id),
        db.prepare("DELETE FROM alerts WHERE device = ? AND seen = 1 AND at < ?").bind(d.id, Date.now() - 2 * 86400000)
      ]);
      return json({ items: results || [] });
    }

    if (m === "DELETE") {
      const id = q.get("device") || "";
      if (!DEV.test(id)) return json({ error: "Bad device." }, 400);
      await db.batch([db.prepare("DELETE FROM devices WHERE id = ?").bind(id), db.prepare("DELETE FROM alerts WHERE device = ?").bind(id)]);
      return json({ ok: true });
    }

    if (m === "POST") {
      const b = await body(request);
      if (!b || !DEV.test(b.device || "") || !b.sub || typeof b.sub.endpoint !== "string" || !/^https:\/\//.test(b.sub.endpoint)) return json({ error: "Bad subscription." }, 400);
      const now = Date.now();
      const ops = [db.prepare("INSERT INTO devices (id, endpoint, sub, updated) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET endpoint = excluded.endpoint, sub = excluded.sub, updated = excluded.updated")
        .bind(b.device, b.sub.endpoint, JSON.stringify(b.sub), now)];
      if (b.test) {
        ops.push(db.prepare("INSERT INTO alerts (device, at, title, body, tag) VALUES (?, ?, ?, ?, ?)").bind(b.device, now, "Test alert", "Step alerts are working on this phone.", "rgp-test"));
        await db.batch(ops);
        return json({ ok: true });
      }
      const items = (Array.isArray(b.items) ? b.items : []).map(cleanItem).filter(x => x && x.at > now - LATE).slice(0, 300);
      ops.push(db.prepare("DELETE FROM alerts WHERE device = ? AND sent = 0").bind(b.device));
      items.forEach(x => ops.push(db.prepare("INSERT INTO alerts (device, at, title, body, tag) VALUES (?, ?, ?, ?, ?)").bind(b.device, x.at, x.title, x.body, x.tag)));
      await db.batch(ops);
      return json({ ok: true, n: items.length });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (e) {
    return json({ error: "Alerts hit a server error: " + (e && e.message || e) }, 500);
  }
}
