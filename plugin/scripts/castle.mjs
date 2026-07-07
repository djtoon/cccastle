// CLI behind the /castle:* commands. Prints plain text for the chat window.
//   castle.mjs me                render your castle + today/month totals
//   castle.mjs board             leaderboard, ranked by castle score
//   castle.mjs visit <name>      render another player's castle
//   castle.mjs history           30-day sparkline of your daily posts
//   castle.mjs log [name] [url] [backfill=N]   register/login, sync usage now
import { loadConfig, saveConfig, ensureIdentity, sanitizeName } from "./config.mjs";
import { pendingDeltas, postUsage, recentTranscripts } from "./usage.mjs";
import { castleText, chronicle, computeScore, fmtTokens, TIERS, tierIndex } from "./render.mjs";

const [, , cmd = "me", ...args] = process.argv;

function die(msg) {
  console.log("castle: " + msg);
  process.exit(0); // never fail the hosting command
}
function needSetup() {
  die("not set up yet. Run /castle:log <your-name> to claim your name and start posting.");
}

async function api(cfg, path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(cfg.server.replace(/\/$/, "") + path, { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) die(body.error || `server returned ${res.status}`);
    return body;
  } catch (e) {
    if (e.name === "AbortError") die("server timed out. Is " + cfg.server + " up?");
    die("could not reach server (" + e.message + ")");
  } finally {
    clearTimeout(timer);
  }
}

function statsFrom(m) {
  // m: {input, output, cache_read, cache_creation}
  // "Fresh" input includes cache_creation — that's new context being written.
  const freshIn = (m.input || 0) + (m.cache_creation || 0);
  const monthTokens = freshIn + (m.output || 0);
  const ratio = freshIn > 0 ? (m.output || 0) / freshIn : 1;
  const denom = freshIn + (m.cache_read || 0);
  const cacheRate = denom > 0 ? (m.cache_read || 0) / denom : 0;
  return { monthTokens, ratio, cacheRate };
}

function renderPlayer(name, month, streak) {
  const { monthTokens, ratio, cacheRate } = statsFrom(month);
  const p = { name, monthTokens, streak, ratio, cacheRate };
  const { text, scene } = castleText(p);
  const score = computeScore({ monthTokens, streak, cacheRate });
  return { text, scene, p, score, monthTokens, ratio, cacheRate };
}

function statLines(r, extra = []) {
  const rows = [
    ["Month tokens", fmtTokens(r.monthTokens) + "  (tier: " + TIERS[r.scene.tier].name + ")"],
    ["Streak", r.p.streak + " day" + (r.p.streak === 1 ? "" : "s") + "  ->  " + r.scene.flags + " banner" + (r.scene.flags === 1 ? "" : "s")],
    ["Out/in ratio", r.ratio.toFixed(2)],
    ["Cache hit", Math.round(r.cacheRate * 100) + "%"],
    ["Castle score", String(r.score)],
    ...extra,
  ];
  const w = Math.max(...rows.map(x => x[0].length));
  return rows.map(([k, v]) => "  " + k.padEnd(w + 2) + v).join("\n");
}

async function cmdMe() {
  const cfg = loadConfig();
  if (!cfg.server || !cfg.token) needSetup();
  const me = await api(cfg, "/api/me?token=" + encodeURIComponent(cfg.token));
  const r = renderPlayer(me.name, me.month, me.streak);
  const today = me.today || {};
  const todayTokens = (today.input || 0) + (today.output || 0) + (today.cache_creation || 0);
  console.log(r.text);
  console.log();
  console.log(chronicle(r.p, r.scene));
  console.log();
  console.log(statLines(r, [["Today", fmtTokens(todayTokens) + " tokens"]]));
}

async function cmdBoard() {
  const cfg = loadConfig();
  if (!cfg.server) needSetup();
  const { board } = await api(cfg, "/api/board");
  if (!board || !board.length) die("the realm is empty — be the first: /castle:log <name>");
  console.log("  #  PLAYER      TIER         MONTH     STREAK  CACHE  SCORE");
  console.log("  -- ----------  -----------  --------  ------  -----  ------");
  board.forEach((u, i) => {
    const s = statsFrom(u.month);
    console.log(
      "  " + String(i + 1).padStart(2) + " " +
      u.name.padEnd(11) +
      TIERS[tierIndex(s.monthTokens)].name.padEnd(13) +
      fmtTokens(s.monthTokens).padEnd(10) +
      (u.streak + "d").padEnd(8) +
      (Math.round(s.cacheRate * 100) + "%").padEnd(7) +
      u.score
    );
  });
  const top = board[0];
  const r = renderPlayer(top.name, top.month, top.streak);
  console.log("\n  Reigning castle:\n");
  console.log(r.text);
  const realm = (cfg.server || "").replace(/\/$/, "") + "/";
  console.log("\n  " + "=".repeat(realm.length + 20));
  console.log("  Visit the realm ->  " + realm);
  console.log("  " + "=".repeat(realm.length + 20));
}

async function cmdVisit() {
  const cfg = loadConfig();
  if (!cfg.server) needSetup();
  const name = sanitizeName(args.join(" "));
  if (!name) die("usage: /castle:visit <player>");
  const u = await api(cfg, "/api/player?name=" + encodeURIComponent(name));
  const r = renderPlayer(u.name, u.month, u.streak);
  console.log(r.text);
  console.log();
  console.log(chronicle(r.p, r.scene));
  console.log();
  console.log(statLines(r));
}

async function cmdHistory() {
  const cfg = loadConfig();
  if (!cfg.server || !cfg.token) needSetup();
  const { name, days } = await api(cfg, "/api/history?token=" + encodeURIComponent(cfg.token));
  if (!days || !days.length) die("no posts yet — usage syncs automatically, or force it with /castle:log");
  const BLOCKS = "▁▂▃▄▅▆▇█";
  const max = Math.max(...days.map(d => d.tokens), 1);
  const spark = days.map(d => d.tokens === 0 ? " " : BLOCKS[Math.min(7, Math.floor((d.tokens / max) * 7.999))]).join("");
  const total = days.reduce((a, d) => a + d.tokens, 0);
  const active = days.filter(d => d.tokens > 0).length;
  console.log(name + " — last " + days.length + " days");
  console.log();
  console.log("  " + spark);
  console.log("  " + days[0].day + " ".repeat(Math.max(1, spark.length - 20)) + days[days.length - 1].day);
  console.log();
  console.log("  total " + fmtTokens(total) + " tokens over " + active + " active day" + (active === 1 ? "" : "s") +
    ", best day " + fmtTokens(max));
}

async function cmdLog() {
  let cfg = ensureIdentity(loadConfig());
  let backfill = 3;
  for (const a of args) {
    if (/^https?:\/\//i.test(a)) cfg.server = a.replace(/\/$/, "");
    else if (/^backfill=\d+$/i.test(a)) backfill = Math.min(90, parseInt(a.split("=")[1], 10));
    else if (a.trim()) {
      const n = sanitizeName(a);
      if (n) cfg.name = n;
    }
  }
  if (!cfg.server) die("no server configured. Usage: /castle:log <name> [server-url]");
  saveConfig(cfg);

  const transcripts = recentTranscripts(backfill);
  const pending = pendingDeltas(transcripts);
  const days = pending.hasAny ? pending.deltas : {};

  // Always post (even empty) so registration/rename happens server-side.
  const res = await postUsage(cfg, days).catch(e => ({ ok: false, body: { error: e.message } }));
  if (!res.ok) {
    if (res.status === 409) die('the name "' + cfg.name + '" is taken. Pick another: /castle:log <other-name>');
    die("post failed: " + (res.body && res.body.error || ("status " + res.status)));
  }
  pending.apply();

  const posted = Object.entries(days);
  const sum = posted.reduce((a, [, d]) => a + d.input + d.output + d.cache_creation, 0);
  console.log("Logged in as " + cfg.name + " @ " + cfg.server);
  if (posted.length) {
    console.log("Synced " + fmtTokens(sum) + " fresh tokens across " + posted.length + " day(s) from " +
      transcripts.length + " session transcript(s), last " + backfill + " days.");
  } else {
    console.log("Nothing new to sync (scanned " + transcripts.length + " transcript(s), last " + backfill + " days).");
  }
  console.log("Your castle: /castle:me   The realm: " + cfg.server + "/");
}

const commands = { me: cmdMe, board: cmdBoard, visit: cmdVisit, history: cmdHistory, log: cmdLog };
(commands[cmd] || (() => die("unknown command: " + cmd)))().catch(e => die(e.message));
