---
description: Render your token castle with today's and this month's totals
disable-model-invocation: true
---

```!
node "${CLAUDE_PLUGIN_ROOT}/scripts/castle.mjs" me
```

The output above is preformatted ASCII art from the castle CLI. Present it to the user verbatim inside a single fenced code block, followed by the stat lines exactly as printed. Do not redraw, re-align, or summarize the art. If the output starts with "castle:" it is an error message — relay it in plain prose instead and suggest the fix it mentions.
