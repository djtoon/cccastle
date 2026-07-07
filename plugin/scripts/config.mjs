// Local identity + server config, stored at ~/.castle/config.json
// { server, token, name }  — the token is a locally generated secret; it IS your login.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// The realm this plugin build points at by default; /castle:log <name> just works.
// Override per-user with a URL argument to /castle:log or the CASTLE_SERVER env var.
export const DEFAULT_SERVER = "https://token-castle.cccastle.workers.dev";

export const CASTLE_DIR = path.join(os.homedir(), ".castle");
const CONFIG_PATH = path.join(CASTLE_DIR, "config.json");
const STATE_PATH = path.join(CASTLE_DIR, "state.json");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

export function loadConfig() {
  const cfg = readJson(CONFIG_PATH, {});
  if (process.env.CASTLE_SERVER) cfg.server = process.env.CASTLE_SERVER;
  if (!cfg.server) cfg.server = DEFAULT_SERVER;
  return cfg;
}

export function saveConfig(cfg) {
  writeJson(CONFIG_PATH, cfg);
  return cfg;
}

// Ensure a local identity exists; generates the secret token on first use.
export function ensureIdentity(cfg) {
  if (!cfg.token) cfg.token = crypto.randomUUID();
  if (!cfg.name) {
    const raw = (process.env.USERNAME || process.env.USER || "PLAYER").toUpperCase();
    cfg.name = raw.replace(/[^A-Z0-9 ]/g, "").slice(0, 10) || "PLAYER";
  }
  return cfg;
}

export function sanitizeName(name) {
  return String(name || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, 10);
}

export function loadState() {
  return readJson(STATE_PATH, { posted: {}, lastPostAt: 0 });
}

export function saveState(state) {
  // prune session entries not seen for 14 days
  const cutoff = Date.now() - 14 * 86400e3;
  for (const [sid, s] of Object.entries(state.posted)) {
    if ((s.seen || 0) < cutoff) delete state.posted[sid];
  }
  writeJson(STATE_PATH, state);
}
