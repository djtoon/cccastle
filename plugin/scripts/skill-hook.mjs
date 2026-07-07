// Hook entry point for skill tracking (PostToolUse matcher "Skill" + UserPromptExpansion).
// Privacy by construction: this script sees ONLY the hook event payload — the skill
// name — never the conversation. It appends {day -> skill -> count} to a local
// ledger (~/.castle/skills.json); sync.mjs posts deltas from the ledger later.
// Always exits 0 — a broken tracker must never break a session.
import { loadConfig, loadSkillLedger, saveSkillLedger } from "./config.mjs";

// built-in CLI commands that aren't skills — not worth a guild tent
const BUILTIN = new Set([
  "plugin", "model", "reload-plugins", "doctor", "help", "clear", "compact",
  "resume", "plan", "exit", "quit", "login", "logout", "status", "cost", "memory", "config",
  "permissions", "bug", "terminal-setup", "vim", "export", "mcp", "agents", "hooks",
  "ide", "install-github-app", "migrate-installer", "release-notes", "todos", "upgrade",
  "add-dir", "bashes", "statusline", "fast", "rewind", "usage", "context", "output-style",
]);

function normSkill(name) {
  const n = String(name || "").toLowerCase().replace(/^\//, "").trim()
    .split(/\s+/)[0].replace(/[^a-z0-9:_-]/g, "").slice(0, 40);
  return n && !BUILTIN.has(n) ? n : null;
}

// The payload shape differs per event; probe the fields that can carry the name.
function skillFrom(payload) {
  if (payload.tool_name === "Skill" && payload.tool_input) return payload.tool_input.skill;
  for (const k of ["skill_name", "command_name", "command", "skill"]) {
    if (typeof payload[k] === "string" && payload[k]) return payload[k];
  }
  if (typeof payload.prompt === "string") {
    const m = payload.prompt.match(/^\s*\/([a-zA-Z0-9:_-]+)/);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  const raw = await new Promise(resolve => {
    let buf = "";
    process.stdin.on("data", c => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    setTimeout(() => resolve(buf), 3000);
  });

  let payload = {};
  try { payload = JSON.parse(raw); } catch { return; }

  const cfg = loadConfig();
  if (cfg.skills === false || process.env.CASTLE_NO_SKILLS) return; // opted out

  const skill = normSkill(skillFrom(payload));
  if (!skill) return;

  const day = new Date().toISOString().slice(0, 10);
  const ledger = loadSkillLedger();
  const d = (ledger.days[day] ||= {});
  d[skill] = (d[skill] || 0) + 1;
  saveSkillLedger(ledger);
}

main().catch(() => {}).finally(() => process.exit(0));
