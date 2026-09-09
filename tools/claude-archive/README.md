# Claude Code session archive

Two steps, kept apart on purpose.

    # 1. copy the transcript off the laptop and verify it
    python3 save-claude-session.py list
    python3 save-claude-session.py save <first-8-of-id>

    # 2. redact, then load the index into Postgres
    python3 push-claude-archive.py ~/claude-session-archive
    python3 push-claude-archive.py ~/claude-session-archive --push   # needs DATABASE_URL

Neither script deletes anything. The first prints the `rm` once the copy is
checksum-verified; running it is your decision.

## What goes where

Postgres holds metadata and searchable message text. The verbatim `.jsonl`
belongs in R2, for the same reason photographs do — see
`supabase/migrations/0005_claude_archive.sql`.

## Read this before the first run

A transcript is an engineering log and can contain **live credentials**: any
`cat` of a key file, any `supabase secrets list`, any curl carrying a bearer
token leaves its output in a `tool_result` block in plaintext.

`push-claude-archive.py` masks known key shapes — Anthropic, Stripe, Shopify,
Supabase (including JWT service keys), GitHub, AWS — and any
`SOMETHING_SECRET=<long value>` pair. It reports a count per session and sets
`needs_review` on the row.

It will not catch a secret that looks like ordinary text. The real control is
that `archive` is **not** an exposed schema, so PostgREST cannot serve these
tables at all. Keep it that way.

## Connection

The loader talks to Postgres directly, because the REST API deliberately
cannot see this schema:

    export DATABASE_URL='postgresql://postgres:PW@db.zhtjgigkgpzrzeaqjwsv.supabase.co:5432/postgres'
