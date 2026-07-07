# Token Castle 🏰

```
                    ████
                    █
              █ █ █ █ █ █ █
              ███▓█████▒███
              ██████░███▓██
              █████▒░▒█████
              █████████████
              ██████░██████
              ██▒███░██████
              ███▓███████▒█
              ██▓███░██████
              █████████████
              ██████░██████
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 ░░▒▒░░░▒▒▒▒░░░░░▒▓▓▓▓▓░░░▒░░░▒░░░░░▒▒░
 ░▒░▒░░░░░░░░░░░▒░▓▓▓▓▓░░░░░▒░░░▒░░▒▒░░
```

**Your Claude Code token usage, reforged into a castle.** Every token you spend lays another
grey stone. Keep a daily streak and banners fly from your towers. Run a hot cache and a moat
fills around your walls. Then everyone's castle lines up on a shared leaderboard — and here's
the twist: **efficiency beats brute force.** A lean builder with a hot cache and a long streak
can out-castle a wasteful whale. 🐋

🏰 **See the realm:** https://token-castle.cccastle.workers.dev/

---

## ⚔️ Quick start

**1. Add the marketplace and install** (inside Claude Code):

```
/plugin marketplace add djtoon/cccastle
/plugin install castle@cccastle
```

Then restart / `/reload-plugins` so the hooks wake up. (Needs Node 18+ on your PATH.)

**2. Claim your name:**

```
/castle:log YOURNAME backfill=30
```

That's it. You get a castle, your last 30 days of usage are imported, and from then on it
tops itself up automatically as you work. Forget to pass a name? The plugin will simply ask
you to pick one — no accidental logins.

---

## 🧱 What your castle is telling you

| You'll see... | Because... |
|---|---|
| 🏰 **Bigger stronghold** — tent → keep → walled keep → castle → citadel | More monthly tokens (1M / 10M / 50M / 200M) |
| 🚩 **More banners** flying from the towers | Longer daily streak (one per 5 days; 25+ raises the streak standard) |
| 🗼 **Taller towers** vs. 🧱 **a broader base** | Output-heavy work builds up; input-heavy work builds out |
| 🌊 **A moat, drawbridge & shield `(+)`** | A hot cache — 80% digs the moat, 90% widens it, 96%+ earns the shield of efficiency |

**Castle score** (the season ranking — resets monthly):

```
score = (monthTokens / 1M) × (0.5 + cacheRate) × (1 + min(streak,30)/30) × 100
```

Spend **×** efficiency **×** consistency. That's why the tortoise can beat the hare here.

---

## 📜 Commands

| Command | What it does |
|---|---|
| `/castle:me` | Your castle, with today's and this month's totals |
| `/castle:board` | The leaderboard by score, the reigning castle, and a link to the realm |
| `/castle:visit <player>` | Go gawk at someone else's castle |
| `/castle:history` | Your last 30 days as a sparkline |
| `/castle:log [name] [backfill=N]` | Claim or rename your castle and force a sync |

---

## 🔒 Your privacy is sacred

Only **aggregate token counts and your chosen name** ever leave your machine. Never your
content, never file names, never prompts. Usage is read from your local session transcripts,
counted per day, and only the totals are posted. That's the whole payload.

The hook is also **fail-silent**: offline, server down, or a weird transcript will never break
a session — unsent counts just wait in `~/.castle/state.json` until next time.

---

## 🛠️ Run your own realm (optional)

The leaderboard is a tiny Cloudflare Worker + D1 database (comfortably within the free plan).
It isn't bundled in this plugin repo, but the plugin can point anywhere: set `CASTLE_SERVER`
or pass a URL to `/castle:log <name> <https://your-server/>`. By default it points at the
public realm above, so you don't need a server at all to play.

---

*Built for fun. May your cache stay warm and your banners fly high.* 🚩 MIT.
