/* Shared game plans, stored in D1 (binding name: DB).
   POST /api/plan                 body {data}        -> {id, rev}      create a shared plan
   GET  /api/plan?id=             -> {data, rev, checks}               read plan and every checkbox
   PUT  /api/plan?id=             body {data, reset} -> {rev}          replace the plan (reset clears cook checkboxes)
   POST /api/plan?id=             body {task, on}    -> {ok}           set one checkbox
   Each checkbox is its own row, so two people checking different boxes never overwrite each other. */

let ready = false;
async function init(db){
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, data TEXT NOT NULL, rev INTEGER NOT NULL, updated INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS checks (plan TEXT NOT NULL, task TEXT NOT NULL, done INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (plan, task))")
  ]);
  ready = true;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const ID = /^[a-z0-9]{12}$/;
const MAX = 400000;
function newId(){
  const a = "abcdefghijkmnpqrstuvwxyz23456789", b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map(x => a[x % a.length]).join("");
}
async function body(request){ try { return await request.json(); } catch (e) { return null; } }
function validData(d){ return d && typeof d === "object" && Array.isArray(d.recipes); }

export async function onRequest({ request, env }){
  if (!env.DB) return json({ error: "Sharing isn't set up yet. Add a D1 database binding named DB to the Pages project, then redeploy." }, 503);
  const db = env.DB;
  try {
    await init(db);
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const m = request.method;
    const now = Date.now();

    if (m === "POST" && !id) {
      const b = await body(request);
      if (!b || !validData(b.data)) return json({ error: "Nothing to share." }, 400);
      const data = JSON.stringify(b.data);
      if (data.length > MAX) return json({ error: "This plan is too big to share." }, 413);
      const nid = newId();
      const checks = b.checks && typeof b.checks === "object" ? Object.entries(b.checks).filter(([k, v]) => v && k.length <= 200).slice(0, 2000) : [];
      await db.batch([
        db.prepare("INSERT INTO plans (id, data, rev, updated) VALUES (?, ?, 1, ?)").bind(nid, data, now),
        ...checks.map(([k]) => db.prepare("INSERT INTO checks (plan, task, done, updated) VALUES (?, ?, 1, ?)").bind(nid, k, now))
      ]);
      return json({ id: nid, rev: 1 });
    }

    if (!ID.test(id)) return json({ error: "That share link isn't valid." }, 400);

    if (m === "GET") {
      const row = await db.prepare("SELECT data, rev, updated FROM plans WHERE id = ?").bind(id).first();
      if (!row) return json({ error: "That shared plan doesn't exist anymore." }, 404);
      const { results } = await db.prepare("SELECT task, done FROM checks WHERE plan = ? AND done = 1").bind(id).all();
      const checks = {};
      (results || []).forEach(r => { checks[r.task] = true; });
      return json({ data: JSON.parse(row.data), rev: row.rev, updated: row.updated, checks });
    }

    if (m === "PUT") {
      const b = await body(request);
      if (!b || !validData(b.data)) return json({ error: "Bad plan." }, 400);
      const data = JSON.stringify(b.data);
      if (data.length > MAX) return json({ error: "This plan is too big to share." }, 413);
      const row = await db.prepare("UPDATE plans SET data = ?, rev = rev + 1, updated = ? WHERE id = ? RETURNING rev").bind(data, now, id).first();
      if (!row) return json({ error: "That shared plan doesn't exist anymore." }, 404);
      if (b.reset) await db.prepare("DELETE FROM checks WHERE plan = ? AND task NOT LIKE 'have:%'").bind(id).run();
      return json({ rev: row.rev });
    }

    if (m === "POST") {
      const b = await body(request);
      if (!b || typeof b.task !== "string" || !b.task || b.task.length > 200) return json({ error: "Bad checkbox." }, 400);
      await db.prepare("INSERT INTO checks (plan, task, done, updated) VALUES (?, ?, ?, ?) ON CONFLICT (plan, task) DO UPDATE SET done = excluded.done, updated = excluded.updated")
        .bind(id, b.task, b.on ? 1 : 0, now).run();
      return json({ ok: true });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (e) {
    return json({ error: "Sharing hit a server error: " + (e && e.message || e) }, 500);
  }
}
