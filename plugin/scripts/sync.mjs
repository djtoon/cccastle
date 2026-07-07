// Hook entry point (Stop + SessionEnd). Reads the hook payload from stdin,
// diffs the session transcript against what was already posted, and ships the
// delta to the server. Always exits 0 — a broken tracker must never break a session.
import { loadConfig, loadState } from "./config.mjs";
import { pendingDeltas, postUsage } from "./usage.mjs";

const MIN_POST_INTERVAL_MS = 4 * 60 * 1000; // batch Stop-hook posts

async function main() {
  const raw = await new Promise(resolve => {
    let buf = "";
    process.stdin.on("data", c => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    setTimeout(() => resolve(buf), 3000);
  });

  let payload = {};
  try { payload = JSON.parse(raw); } catch { /* no payload, nothing to do */ }
  const transcript = payload.transcript_path;
  if (!transcript) return;

  const cfg = loadConfig();
  if (!cfg.server || !cfg.token) return; // not set up yet — /castle:log does that

  const isSessionEnd = payload.hook_event_name === "SessionEnd";
  if (!isSessionEnd) {
    const last = loadState().lastPostAt || 0;
    if (Date.now() - last < MIN_POST_INTERVAL_MS) return;
  }

  const pending = pendingDeltas([transcript]);
  if (!pending.hasAny) { pending.touch(); return; }

  try {
    const res = await postUsage(cfg, pending.deltas, pending.skillDeltas);
    if (res.ok) pending.apply();
  } catch { /* offline or server down — deltas stay pending */ }
}

main().catch(() => {}).finally(() => process.exit(0));
