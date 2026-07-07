---
description: Show your daily token posts for the last 30 days as a sparkline
disable-model-invocation: true
---

```!
node "${CLAUDE_PLUGIN_ROOT}/scripts/castle.mjs" history
```

The output above is a preformatted sparkline of daily usage. Present it verbatim inside a single fenced code block. If the output starts with "castle:" it is an error message — relay it in plain prose and suggest the fix it mentions.
