---
description: Render another player's castle by name
argument-hint: "<player>"
disable-model-invocation: true
---

```!
node "${CLAUDE_PLUGIN_ROOT}/scripts/castle.mjs" visit "$ARGUMENTS"
```

The output above is preformatted ASCII art of the requested player's castle. Present it verbatim inside a single fenced code block, followed by the stat lines exactly as printed. If the output starts with "castle:" it is an error message — relay it in plain prose (e.g. unknown player) instead.
