# Token Castle 🏰

Your Claude Code token usage as a procedural ASCII castle on a shared leaderboard.
Spend flows in, castle grows — but efficiency wins: a lean player with a hot cache and a
long streak can out-castle a wasteful whale.

**The loop:** a Stop/SessionEnd hook reads token usage from the session transcript,
accumulates locally, and posts daily deltas to the realm server. The server aggregates per
user into daily/monthly sums. Your castle is a pure function of those numbers. Everyone's
castle sits on a shared web leaderboard, top to bottom.

**Privacy:** only aggregate token counts and your name leave the machine. Never content,
never file names, never prompts.

**The realm:** https://token-castle.cccastle.workers.dev/ — every player ranked top to
bottom, each with their own rendered castle, chronicle line, and stats.

## Install

This repo is a Claude Code plugin marketplace. Inside Claude Code:

```
/plugin marketplace add djtoon/cccastle
/plugin install castle@cccastle
```

Then restart or reload so the hooks register. Requires Node 18+ on PATH (the hook and
commands run small Node scripts). The realm server is baked into the plugin — no server setup
needed to play.

## Claim your name

```
/castle:log YOURNAME backfill=30
```

This generates a local secret token (`~/.castle/config.json` — that token *is* your login,
back it up), claims your name (names are unique, up to 10 chars A–Z/0–9), backfills the last
30 days of transcripts, and syncs. From then on the hook posts automatically as you work.

## Commands

| Command | What it does |
|---|---|
| `/castle:me` | Your castle + today's and this month's totals |
| `/castle:board` | Leaderboard ranked by castle score, plus the reigning castle |
| `/castle:visit <player>` | Render someone else's castle |
| `/castle:history` | Last 30 days of posts as a sparkline |
| `/castle:log [name] [backfill=N]` | Claim/rename your name and force a sync |

## How the numbers map to the castle

| Stat | Effect |
|---|---|
| Monthly fresh tokens (input + output + cache-write) | Tier: tent → keep → walled keep → castle → citadel (1M / 10M / 50M / 200M) |
| Daily streak | One banner per 5 days; 25+ hangs the streak standard from the keep |
| Output/input ratio | Output-heavy → taller towers; input-heavy → wider base |
| Cache hit rate | 80%+ moat, 90%+ wide moat + drawbridge, 96%+ shield of efficiency `(+)` — real Claude Code traffic is cache-dominated, so thresholds sit at the top of the realistic range |

**Castle score** (season metric, resets monthly):
`(monthTokens/1M) × (0.5 + cacheRate) × (1 + min(streak,30)/30) × 100`

## Notes

- Usage is read from session transcripts (`~/.claude/projects/**/*.jsonl`), deduped by
  request id, bucketed per UTC day.
- The hook is fail-silent by design: offline, server down, or an unparseable transcript never
  breaks a session; unposted deltas are carried forward in `~/.castle/state.json`.

Run your own realm? Deploy the `worker/` (Cloudflare Worker + D1, free plan is plenty) and
point the plugin at it with `CASTLE_SERVER` or a URL argument to `/castle:log`.

MIT.
