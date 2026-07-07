---
description: Claim your castle name / login and sync usage now (optionally backfill=N days). The realm server is built in; pass a URL only to use a different one.
argument-hint: "[name] [backfill=N] [server-url]"
disable-model-invocation: true
---

```!
node "${CLAUDE_PLUGIN_ROOT}/scripts/castle.mjs" log $ARGUMENTS
```

The output above is the result of registering/syncing with the castle server. Present it verbatim inside a fenced code block. If it reports the name is taken, tell the user to rerun /castle:log with a different name. First-time setup is just: /castle:log YOURNAME backfill=30
