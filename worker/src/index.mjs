// Token Castle server — Cloudflare Worker + D1.
// Stores only aggregate token counts per user per UTC day. No content, ever.
import {
  castleText, chronicle, computeScore, fmtTokens, TIERS, tierIndex,
} from "../../plugin/scripts/render.mjs";

const FIELDS = ["input", "output", "cache_read", "cache_creation"];
const NAME_RE = /^[A-Z0-9 ]{1,10}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

function utcDay(d = new Date()) { return d.toISOString().slice(0, 10); }
function utcMonth() { return utcDay().slice(0, 7); }

function statsFrom(m) {
  // "Fresh" input includes cache_creation — new context being written.
  const freshIn = (m.input || 0) + (m.cache_creation || 0);
  const monthTokens = freshIn + (m.output || 0);
  const ratio = freshIn > 0 ? (m.output || 0) / freshIn : 1;
  const denom = freshIn + (m.cache_read || 0);
  const cacheRate = denom > 0 ? (m.cache_read || 0) / denom : 0;
  return { monthTokens, ratio, cacheRate };
}

// Consecutive posted days ending today or yesterday (UTC).
function streakFrom(dayList) {
  const set = new Set(dayList);
  let d = new Date();
  if (!set.has(utcDay(d))) d = new Date(d.getTime() - 86400e3);
  let streak = 0;
  while (set.has(utcDay(d))) { streak++; d = new Date(d.getTime() - 86400e3); }
  return streak;
}

async function monthAgg(db, token) {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(input),0) input, COALESCE(SUM(output),0) output,
            COALESCE(SUM(cache_read),0) cache_read, COALESCE(SUM(cache_creation),0) cache_creation
     FROM days WHERE token = ? AND day LIKE ?`
  ).bind(token, utcMonth() + "%").first();
  return row || { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
}

async function streakOf(db, token) {
  const { results } = await db.prepare(
    `SELECT day FROM days WHERE token = ? AND day >= ? AND (input+output+cache_creation) > 0`
  ).bind(token, utcDay(new Date(Date.now() - 45 * 86400e3))).all();
  return streakFrom(results.map(r => r.day));
}

async function boardData(db) {
  const { results } = await db.prepare(
    `SELECT u.token, u.name,
            COALESCE(SUM(d.input),0) input, COALESCE(SUM(d.output),0) output,
            COALESCE(SUM(d.cache_read),0) cache_read, COALESCE(SUM(d.cache_creation),0) cache_creation
     FROM users u LEFT JOIN days d ON d.token = u.token AND d.day LIKE ?
     GROUP BY u.token, u.name`
  ).bind(utcMonth() + "%").all();
  const out = [];
  for (const r of results) {
    const month = { input: r.input, output: r.output, cache_read: r.cache_read, cache_creation: r.cache_creation };
    const streak = await streakOf(db, r.token);
    const s = statsFrom(month);
    out.push({ name: r.name, month, streak, score: computeScore({ ...s, streak }) });
  }
  out.sort((a, b) => b.score - a.score || statsFrom(b.month).monthTokens - statsFrom(a.month).monthTokens);
  return out;
}

/* ---------- API handlers ---------- */

async function handleLog(req, db) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { token, days } = body;
  const name = String(body.name || "").toUpperCase().trim();
  if (!token || typeof token !== "string" || token.length < 8 || token.length > 64)
    return json({ error: "missing or invalid token" }, 400);
  if (!NAME_RE.test(name)) return json({ error: "name must be 1-10 chars, A-Z 0-9" }, 400);

  const user = await db.prepare(`SELECT token, name FROM users WHERE token = ?`).bind(token).first();
  if (!user) {
    const taken = await db.prepare(`SELECT token FROM users WHERE name = ? COLLATE NOCASE`).bind(name).first();
    if (taken) return json({ error: `name "${name}" is already claimed` }, 409);
    await db.prepare(`INSERT INTO users (token, name, created_at) VALUES (?, ?, ?)`)
      .bind(token, name, new Date().toISOString()).run();
  } else if (user.name.toUpperCase() !== name) {
    const taken = await db.prepare(`SELECT token FROM users WHERE name = ? COLLATE NOCASE AND token != ?`)
      .bind(name, token).first();
    if (taken) return json({ error: `name "${name}" is already claimed` }, 409);
    await db.prepare(`UPDATE users SET name = ? WHERE token = ?`).bind(name, token).run();
  }

  const entries = Object.entries(days || {}).slice(0, 100);
  const now = new Date().toISOString();
  for (const [day, d] of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const vals = FIELDS.map(f => {
      const v = Number(d && d[f]) || 0;
      return v > 0 && v < 1e12 ? Math.round(v) : 0;
    });
    if (!vals.some(v => v > 0)) continue;
    await db.prepare(
      `INSERT INTO days (token, day, input, output, cache_read, cache_creation, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (token, day) DO UPDATE SET
         input = input + excluded.input, output = output + excluded.output,
         cache_read = cache_read + excluded.cache_read,
         cache_creation = cache_creation + excluded.cache_creation,
         updated_at = excluded.updated_at`
    ).bind(token, day, ...vals, now).run();
  }

  return json({ ok: true, name, month: await monthAgg(db, token) });
}

async function handleMe(url, db) {
  const token = url.searchParams.get("token") || "";
  const user = await db.prepare(`SELECT token, name FROM users WHERE token = ?`).bind(token).first();
  if (!user) return json({ error: "unknown token — run /castle:log to register" }, 404);
  const today = await db.prepare(`SELECT input, output, cache_read, cache_creation FROM days WHERE token = ? AND day = ?`)
    .bind(token, utcDay()).first();
  return json({
    name: user.name,
    today: today || { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
    month: await monthAgg(db, token),
    streak: await streakOf(db, token),
  });
}

async function handlePlayer(url, db) {
  const name = (url.searchParams.get("name") || "").toUpperCase().trim();
  const user = await db.prepare(`SELECT token, name FROM users WHERE name = ? COLLATE NOCASE`).bind(name).first();
  if (!user) return json({ error: `no castle found for "${name}"` }, 404);
  return json({
    name: user.name,
    month: await monthAgg(db, user.token),
    streak: await streakOf(db, user.token),
  });
}

async function handleHistory(url, db) {
  const token = url.searchParams.get("token") || "";
  const user = await db.prepare(`SELECT name FROM users WHERE token = ?`).bind(token).first();
  if (!user) return json({ error: "unknown token — run /castle:log to register" }, 404);
  const { results } = await db.prepare(
    `SELECT day, input, output, cache_creation FROM days WHERE token = ? AND day >= ? ORDER BY day`
  ).bind(token, utcDay(new Date(Date.now() - 29 * 86400e3))).all();
  const byDay = new Map(results.map(r => [r.day, r.input + r.output + r.cache_creation]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const day = utcDay(new Date(Date.now() - i * 86400e3));
    days.push({ day, tokens: byDay.get(day) || 0 });
  }
  return json({ name: user.name, days });
}

/* ---------- the realm page: every player, top to bottom, each with their castle ---------- */

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function realmPage(board) {
  const sections = board.map((u, i) => {
    const s = statsFrom(u.month);
    const p = { name: u.name, monthTokens: s.monthTokens, streak: u.streak, ratio: s.ratio, cacheRate: s.cacheRate };
    const { text, scene } = castleText(p);
    return `
    <section class="player">
      <div class="head">
        <span class="rank">#${i + 1}</span>
        <span class="pname">${esc(u.name)}</span>
        <span class="meta">${TIERS[tierIndex(s.monthTokens)].name} · ${fmtTokens(s.monthTokens)} tokens ·
          ${u.streak}d streak · ${Math.round(s.cacheRate * 100)}% cache · <b>${u.score} pts</b></span>
      </div>
      <pre>${esc(text)}</pre>
      <p class="chron">${esc(chronicle(p, scene))}</p>
    </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Realm — Token Castle</title>
<style>
  :root{--bg:#101223;--panel:#181b30;--edge:#262a47;--ink:#c9cee0;--muted:#7e86a3;--torch:#e8a03c}
  *{box-sizing:border-box}
  body{background:var(--bg);color:var(--ink);font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:36px 16px 64px}
  .wrap{max-width:960px;margin:0 auto}
  .eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--torch);font-weight:600}
  h1{margin:6px 0 4px;font-size:26px;font-weight:650}
  .sub{color:var(--muted);font-size:14px;margin:0 0 28px;max-width:64ch;line-height:1.5}
  .player{background:var(--panel);border:1px solid var(--edge);border-radius:10px;padding:18px 16px;margin:0 0 18px}
  .head{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}
  .rank{font-family:Consolas,monospace;color:var(--torch);font-weight:700;font-size:18px}
  .pname{font-weight:650;letter-spacing:.06em;font-size:16px}
  .meta{color:var(--muted);font-size:13px}
  .meta b{color:var(--torch)}
  .player:first-of-type{border-color:var(--torch)}
  pre{font-family:"Cascadia Mono",Consolas,monospace;font-size:12px;line-height:1.18;color:#9aa3b5;
      overflow-x:auto;margin:0;padding:6px 2px}
  .chron{color:var(--muted);font-size:13px;font-style:italic;margin:8px 0 0}
  .empty{color:var(--muted);text-align:center;padding:60px 0}
  footer{color:#565d7d;font-size:12px;text-align:center;margin-top:30px}
</style></head><body><div class="wrap">
  <div class="eyebrow">Usage heraldry · ${esc(utcMonth())}</div>
  <h1>The Realm</h1>
  <p class="sub">Every player's month of Claude Code usage, rendered as a stronghold. Tokens raise the
     walls, streaks fly the banners, cache efficiency digs the moat. Ranked by castle score:
     spend × efficiency × consistency.</p>
  ${board.length ? sections : '<p class="empty">The realm is empty. Claim the first castle with /castle:log</p>'}
  <footer>Only aggregate token counts are stored — never content. Season resets monthly.</footer>
</div></body></html>`;
}

/* ---------- router ---------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const db = env.DB;
    try {
      if (req.method === "POST" && url.pathname === "/api/log") return await handleLog(req, db);
      if (req.method === "GET") {
        if (url.pathname === "/api/me") return await handleMe(url, db);
        if (url.pathname === "/api/board") return json({ board: (await boardData(db)).slice(0, 50) });
        if (url.pathname === "/api/player") return await handlePlayer(url, db);
        if (url.pathname === "/api/history") return await handleHistory(url, db);
        if (url.pathname === "/health") return json({ ok: true });
        if (url.pathname === "/") {
          const board = (await boardData(db)).slice(0, 100);
          return new Response(realmPage(board), { headers: { "content-type": "text/html; charset=utf-8" } });
        }
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server error: " + e.message }, 500);
    }
  },
};
