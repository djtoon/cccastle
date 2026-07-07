# Token Castle 🏰

Your Claude Code token usage as a procedural ASCII castle on a shared leaderboard.
Spend flows in, castle grows — but efficiency wins: a lean player with a hot cache and a
long streak can out-castle a wasteful whale.

**The loop:** a Stop/SessionEnd hook reads token usage from the session transcript,
accumulates locally, and posts daily deltas to your server. The server aggregates per user
into daily/monthly sums. Your castle is a pure function of those numbers. Everyone's castle
sits on a shared web leaderboard, top to bottom.

**Privacy:** only aggregate token counts and your name leave the machine. Never content,
never file names, never prompts.

## Deployment status — LIVE

| | |
|---|---|
| **Realm URL** | https://token-castle.cccastle.workers.dev |
| **Public leaderboard** | https://token-castle.cccastle.workers.dev/ |
| **Worker** | `token-castle` — deployed to Cloudflare (free plan), workers.dev subdomain `cccastle` |
| **Database** | D1 `token-castle` (id `dfe490be-6ca7-4e95-ba71-549bfed45613`), binding `DB`, schema applied to `--remote` |
| **Registered players** | DAN (reigning) |
| **Local repo** | `C:\cccastle` (plugin/ + worker/) |

Deployed 2026-07-07. The Cloudflare account, workers.dev subdomain, remote D1 schema, and
worker are all in place — the server needs no further setup. New players just install the
plugin and run `/castle:log <name>` (§2–3 below). To push code changes to the live worker:
`cd worker && npx wrangler deploy`.

## How the numbers map to the castle

| Stat | Effect |
|---|---|
| Monthly fresh tokens (input + output + cache-write) | Tier: tent → keep → walled keep → castle → citadel (1M / 10M / 50M / 200M) |
| Daily streak | One banner per 5 days; 25+ hangs the streak standard from the keep |
| Output/input ratio | Output-heavy → taller towers; input-heavy → wider base |
| Cache hit rate | 80%+ moat, 90%+ wide moat + drawbridge, 96%+ shield of efficiency `(+)` — real Claude Code traffic is cache-dominated, so thresholds sit at the top of the realistic range |

**Castle score** (season metric, resets monthly):
`(monthTokens/1M) × (0.5 + cacheRate) × (1 + min(streak,30)/30) × 100`

## Repo layout

```
.claude-plugin/marketplace.json   makes this repo installable via /plugin marketplace add
plugin/                  Claude Code plugin (install this)
  .claude-plugin/plugin.json
  hooks/hooks.json       Stop + SessionEnd → scripts/sync.mjs
  commands/              /castle:me, board, visit, history, log
  scripts/               render.mjs (shared), sync.mjs, castle.mjs, usage.mjs, config.mjs
worker/                  Cloudflare Worker + D1 (deploy this — free plan is plenty)
  src/index.mjs          API + public "realm" page at /
  schema.sql
  wrangler.jsonc
```

## 1. Deploy the server (Cloudflare free plan) — DONE

This is already live at `token-castle.cccastle.workers.dev` (see Deployment status above).
The steps below are recorded for reference / re-deploying to a fresh account:

```bash
cd worker
npx wrangler login
npx wrangler d1 create token-castle          # copy the database_id it prints
# paste the id into wrangler.jsonc ("database_id")
npx wrangler d1 execute token-castle --remote --file=schema.sql
npx wrangler deploy                          # note the https://token-castle.<you>.workers.dev URL
```

Note: a brand-new Cloudflare account has no `workers.dev` subdomain until one is claimed
(this was done via the API for `cccastle`; the dashboard Workers page also creates one on
first visit). Free-plan headroom: Workers 100k req/day, D1 100k writes/day. The hook posts
at most once per 4 minutes per machine, so even a large team fits comfortably.

To redeploy after code changes: `cd worker && npx wrangler deploy`.

## 2. Install the plugin

**From GitHub (recommended).** This repo is a Claude Code plugin marketplace
(`.claude-plugin/marketplace.json` at the root points at `plugin/`). Inside Claude Code:

```
/plugin marketplace add djtoon/cccastle
/plugin install castle@cccastle
```

`marketplace add` accepts the `owner/repo` shorthand or the full
`https://github.com/djtoon/cccastle.git` URL. After installing, restart or reload so the
hooks register.

**For local development** (from a checkout):

```bash
claude --plugin-dir C:\cccastle\plugin
```

Requires Node 18+ on PATH (the hook and commands run small node scripts).

## 3. Log in and claim your name

Inside Claude Code:

```
/castle:log DAN backfill=30
```

The realm server is baked into the plugin (`DEFAULT_SERVER` in `plugin/scripts/config.mjs` —
currently `https://token-castle.cccastle.workers.dev`; change it if you deploy your own, or
pass a URL argument / set `CASTLE_SERVER` to override per user). This generates a local
secret token (`~/.castle/config.json` — that token *is* your login, back it up), claims the
name **DAN** (names are unique per user), backfills the last 30 days of transcripts, and
syncs. From then on the hook posts automatically as you work.

## Commands

| Command | What it does |
|---|---|
| `/castle:me` | Your castle + today's and this month's totals |
| `/castle:board` | Leaderboard ranked by castle score, plus the reigning castle |
| `/castle:visit <player>` | Render someone else's castle |
| `/castle:history` | Last 30 days of posts as a sparkline |
| `/castle:log [name] [backfill=N] [url]` | Claim/rename your name and force a sync (url optional — the realm is built in) |

## The realm page

https://token-castle.cccastle.workers.dev/ — every player ranked top to bottom, each with
their own rendered castle, chronicle line, and stats. `/api/board` serves the same data as JSON.

## Notes

- Usage is read from session transcripts (`~/.claude/projects/**/*.jsonl`), deduped by
  `requestId`, bucketed per UTC day by entry timestamp. The transcript format is internal to
  Claude Code and may shift between versions; `usage.mjs` is the single place to adjust.
- The hook is fail-silent by design: offline, server down, or unparseable transcript never
  breaks a session; unposted deltas are carried forward in `~/.castle/state.json`.
