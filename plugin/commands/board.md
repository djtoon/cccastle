---
description: Show the castle leaderboard, ranked by castle score (spend x efficiency x streak)
disable-model-invocation: true
---

```!
node "${CLAUDE_PLUGIN_ROOT}/scripts/castle.mjs" board
```

The output above is a preformatted leaderboard table and ASCII castle. Present it verbatim inside a single fenced code block. Do not reformat the table into markdown. If the output starts with "castle:" it is an error message — relay it in plain prose and suggest the fix it mentions.
