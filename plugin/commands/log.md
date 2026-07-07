---
description: Claim your castle name / login and sync usage now (optionally backfill=N days). The realm server is built in; pass a URL only to use a different one.
argument-hint: "[name] [backfill=N] [server-url]"
disable-model-invocation: true
---

```!
node "${CLAUDE_PLUGIN_ROOT}/scripts/castle.mjs" log $ARGUMENTS
```

The output above is the result of registering/syncing with the castle server. Present it verbatim inside a fenced code block.

- If it asks the user to **pick a name** (no name set yet), don't just repeat it — warmly ask the user what name they'd like for their castle (1-10 letters/numbers), and tell them you'll run `/castle:log <their-name> backfill=30` once they reply.
- If it reports the name is **taken**, tell the user to rerun /castle:log with a different name.
- First-time setup is just: `/castle:log YOURNAME backfill=30`.
