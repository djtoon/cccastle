// Transcript parsing + delta posting.
// Verified on real transcripts (Claude Code 2.1.x): assistant entries carry
// message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens};
// streamed chunks repeat identical usage under one requestId, so we count each requestId once.
// Only aggregate counts ever leave the machine — never content.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadState, saveState } from "./config.mjs";

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

// Compute unposted deltas for the given transcripts against local state.
// Returns { deltas: {day: fields}, apply() } — call apply() only after a successful post.
export function pendingDeltas(transcriptPaths) {
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
  return {
    state,
    deltas,
    hasAny: Object.keys(deltas).length > 0,
    apply() {
      for (const { posted, day, tot } of updates) posted.days[day] = { ...tot };
      state.lastPostAt = Date.now();
      saveState(state);
    },
    touch() { saveState(state); },
  };
}

export async function postUsage(cfg, days) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(cfg.server.replace(/\/$/, "") + "/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cfg.token, name: cfg.name, days }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
