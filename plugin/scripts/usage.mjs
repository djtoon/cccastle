// Transcript parsing (token counts only) + skill ledger + delta posting.
// Verified on real transcripts (Claude Code 2.1.x): assistant entries carry
// message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens};
// streamed chunks repeat identical usage under one requestId, so we count each requestId once.
// Skill usage is NOT read from transcripts — hooks (skill-hook.mjs) receive only the
// skill name in their event payload and append it to a local ledger. Only aggregate
// counts and skill names ever leave the machine — never content.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, loadState, saveState, loadSkillLedger } from "./config.mjs";

export const FIELDS = ["input", "output", "cache_read", "cache_creation"];

function zero() { return { input: 0, output: 0, cache_read: 0, cache_creation: 0 }; }

// Sum a transcript's usage into per-UTC-day buckets, deduped by requestId.
export function usageByDay(transcriptPath) {
  const days = {};
  const seen = new Set();
  let text;
  try { text = fs.readFileSync(transcriptPath, "utf8"); } catch { return days; }
  for (const line of text.split("\n")) {
    if (!line || !line.includes('"usage"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "assistant" || !e.message || !e.message.usage) continue;
    const key = e.requestId || e.message.id || e.uuid;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const day = (e.timestamp || new Date().toISOString()).slice(0, 10);
    const u = e.message.usage;
    const d = (days[day] ||= zero());
    d.input += u.input_tokens || 0;
    d.output += u.output_tokens || 0;
    d.cache_read += u.cache_read_input_tokens || 0;
    d.cache_creation += u.cache_creation_input_tokens || 0;
  }
  return days;
}

// All transcripts across projects modified in the last `daysBack` days.
export function recentTranscripts(daysBack) {
  const root = path.join(os.homedir(), ".claude", "projects");
  const cutoff = Date.now() - daysBack * 86400e3;
  const out = [];
  let projects;
  try { projects = fs.readdirSync(root); } catch { return out; }
  for (const proj of projects) {
    const dir = path.join(root, proj);
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const full = path.join(dir, f);
      try {
        if (fs.statSync(full).mtimeMs >= cutoff) out.push(full);
      } catch { /* ignore */ }
    }
  }
  return out;
}

function sessionIdOf(transcriptPath) {
  return path.basename(transcriptPath, ".jsonl");
}

// Compute unposted deltas (tokens from transcripts, skills from the hook ledger)
// against local state. Returns { deltas, skillDeltas, apply() } — call apply()
// only after a successful post.
export function pendingDeltas(transcriptPaths) {
  const cfg = loadConfig();
  const state = loadState();
  const deltas = {};
  const updates = [];
  for (const tp of transcriptPaths) {
    const sid = sessionIdOf(tp);
    const totals = usageByDay(tp);
    const posted = (state.posted[sid] ||= { days: {}, seen: 0 });
    posted.seen = Date.now();
    for (const [day, tot] of Object.entries(totals)) {
      const prev = posted.days[day] || zero();
      const d = {};
      let any = false;
      for (const f of FIELDS) {
        d[f] = Math.max(0, (tot[f] || 0) - (prev[f] || 0));
        if (d[f] > 0) any = true;
      }
      if (!any) continue;
      const agg = (deltas[day] ||= zero());
      for (const f of FIELDS) agg[f] += d[f];
      updates.push({ posted, day, tot });
    }
  }

  // skills: ledger (written by skill-hook.mjs) minus what was already posted
  const skillDeltas = {};
  const ledger = cfg.skills === false || process.env.CASTLE_NO_SKILLS ? {} : loadSkillLedger().days || {};
  const postedSkills = (state.postedSkills ||= {});
  for (const [day, tot] of Object.entries(ledger)) {
    const prev = postedSkills[day] || {};
    for (const [skill, count] of Object.entries(tot)) {
      const delta = Math.max(0, count - (prev[skill] || 0));
      if (delta <= 0) continue;
      (skillDeltas[day] ||= {})[skill] = delta;
    }
  }

  return {
    state,
    deltas,
    skillDeltas,
    hasAny: Object.keys(deltas).length > 0 || Object.keys(skillDeltas).length > 0,
    apply() {
      for (const { posted, day, tot } of updates) posted.days[day] = { ...tot };
      for (const [day, tot] of Object.entries(ledger)) postedSkills[day] = { ...tot };
      state.lastPostAt = Date.now();
      saveState(state);
    },
    touch() { saveState(state); },
  };
}

/* ---------- skill metadata: resolved locally, best-effort ---------- */

function readDesc(file) {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 4000);
    const m = head.match(/^description:\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").slice(0, 120);
  } catch { /* ignore */ }
  return null;
}

// Resolve {source, desc} for skill names from local skill/command files.
export function resolveSkillMeta(names) {
  const meta = {};
  const home = os.homedir();
  const cacheRoot = path.join(home, ".claude", "plugins", "cache");
  const plugins = []; // { dir, source: "marketplace/plugin", plugin }
  try {
    for (const mkt of fs.readdirSync(cacheRoot)) {
      const mktDir = path.join(cacheRoot, mkt);
      let ps; try { ps = fs.readdirSync(mktDir); } catch { continue; }
      for (const pl of ps) {
        let vs; try { vs = fs.readdirSync(path.join(mktDir, pl)); } catch { continue; }
        for (const v of vs) plugins.push({ dir: path.join(mktDir, pl, v), source: mkt + "/" + pl, plugin: pl });
      }
    }
  } catch { /* no plugin cache */ }

  for (const name of names) {
    const [ns, cmd] = name.includes(":") ? name.split(":", 2) : [null, name];
    const candidates = [];
    if (ns) {
      for (const p of plugins.filter(p => p.plugin === ns)) {
        candidates.push([path.join(p.dir, "commands", cmd + ".md"), p.source]);
        candidates.push([path.join(p.dir, "skills", cmd, "SKILL.md"), p.source]);
      }
    } else {
      candidates.push([path.join(home, ".claude", "skills", name, "SKILL.md"), "personal"]);
      candidates.push([path.join(home, ".claude", "commands", name + ".md"), "personal"]);
      for (const p of plugins) {
        candidates.push([path.join(p.dir, "skills", name, "SKILL.md"), p.source]);
        candidates.push([path.join(p.dir, "commands", name + ".md"), p.source]);
      }
    }
    for (const [file, source] of candidates) {
      const desc = readDesc(file);
      if (desc !== null) { meta[name] = { source, desc }; break; }
      // file exists but no description? still record the source
      if (!meta[name] && fs.existsSync(file)) meta[name] = { source, desc: "" };
    }
  }
  return meta;
}

export async function postUsage(cfg, days, skills) {
  const skillNames = [...new Set(Object.values(skills || {}).flatMap(d => Object.keys(d)))];
  const meta = skillNames.length ? resolveSkillMeta(skillNames) : {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(cfg.server.replace(/\/$/, "") + "/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cfg.token, name: cfg.name, days, skills: skills || {}, meta }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
