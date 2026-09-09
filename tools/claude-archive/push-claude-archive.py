#!/usr/bin/env python3
"""
push-claude-archive.py — load archived Claude Code sessions into Supabase.

Reads the directories produced by save-claude-session.py, masks anything that
looks like a credential, and loads two tables created by
supabase/migrations/0005_claude_archive.sql:

    archive.claude_sessions   one row per session
    archive.claude_messages   one row per message, full-text indexed

It talks to Postgres directly, not to the REST API. That is deliberate: the
`archive` schema is kept off the exposed-schemas list precisely so PostgREST
cannot reach it, which also means the supabase-py client cannot.

It writes CSV plus a load.sql and, by default, stops there so you can read
what is about to happen. Pass --push to run it.

    python3 push-claude-archive.py ~/claude-session-archive
    python3 push-claude-archive.py ~/claude-session-archive --push
    export DATABASE_URL='postgresql://postgres:PW@db.zhtjgigkgpzrzeaqjwsv.supabase.co:5432/postgres'

No dependencies beyond psql on PATH. Python 3.8+.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Postgres holds searchable text; the verbatim .jsonl in R2 holds everything.
# Anything longer than this is cut and flagged, so you know to go to the object.
MAX_BODY_CHARS = 8000

R2_PREFIX = "archive/claude"


# ---------------------------------------------------------------- redaction

# Ordered most-specific first. Over-masking is the correct failure direction:
# a redacted string you did not need to hide costs nothing, a leaked live key
# costs a rotation and an incident.
PATTERNS = [
    ("anthropic",  re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("openai",     re.compile(r"\bsk-(?!ant-)[A-Za-z0-9]{20,}")),
    ("shopify",    re.compile(r"\bshp(at|ss|ca|pa)_[A-Za-z0-9]{20,}")),
    ("stripe",     re.compile(r"\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}")),
    ("stripe-whsec", re.compile(r"\bwhsec_[A-Za-z0-9]{16,}")),
    ("supabase-pat", re.compile(r"\bsbp_[a-f0-9]{40}\b")),
    ("github",     re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})")),
    ("aws",        re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b")),
    # Supabase anon/service keys are JWTs, and the service key is a master key.
    ("jwt",        re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}")),
    ("private-key", re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
        re.DOTALL)),
    # Last resort: any identifier *containing* a secret-sounding word, followed
    # by a long opaque value. False positives by design.
    #
    # Note there is no \b anchoring the name. An earlier version had one and
    # silently missed R2_SECRET_ACCESS_KEY — underscores are word characters,
    # so there is no boundary between "R2_" and "SECRET", and the real variable
    # name in supabase/.env.example is exactly that shape. Match the word
    # anywhere inside the identifier instead.
    ("keyed", re.compile(
        r"(?i)([A-Za-z0-9_.\-]*"
        r"(?:api[_-]?key|secret|token|password|passwd|bearer|credential)"
        r"[A-Za-z0-9_.\-]*)[ \t]*[:=][ \t]*[\"']?"
        r"([A-Za-z0-9_\-\.\/+]{16,})[\"']?")),
    # [ \t] rather than \s so the pair cannot span a newline. With \s*, prose
    # ending "…the secrets:" swallowed the variable name on the next line.
]


def redact(text: str):
    """Return (masked_text, count). Counts every substitution made."""
    if not text:
        return text, 0
    total = 0
    for label, pat in PATTERNS:
        if label == "keyed":
            def sub_keyed(m):
                nonlocal total
                total += 1
                return f"{m.group(1)}=[REDACTED:{label}]"
            text = pat.sub(sub_keyed, text)
        else:
            text, n = pat.subn(f"[REDACTED:{label}]", text)
            total += n
    return text, total


# ---------------------------------------------------------------- reading


def blocks_of(entry: dict) -> list:
    msg = entry.get("message")
    if not isinstance(msg, dict):
        return []
    c = msg.get("content")
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    return [b for b in c if isinstance(b, dict)] if isinstance(c, list) else []


def body_of(entry: dict) -> str:
    """Flatten one entry to the text worth searching. Tool *inputs* are kept
    (they say what was done); tool results are kept but are what usually hits
    the length cap."""
    out = []
    for b in blocks_of(entry):
        kind = b.get("type")
        if kind == "text":
            out.append(b.get("text", ""))
        elif kind == "tool_use":
            out.append(f"[tool:{b.get('name','?')}] "
                       + json.dumps(b.get("input", {}), default=str))
        elif kind == "tool_result":
            c = b.get("content")
            if isinstance(c, list):
                c = "\n".join(x.get("text", "") for x in c if isinstance(x, dict))
            out.append(str(c or ""))
    return "\n".join(p for p in out if p).strip()


def load_archive(d: Path):
    """Turn one archive directory into (session_row, [message_rows])."""
    meta_path, jsonl_path = d / "metadata.json", d / "transcript.jsonl"
    if not (meta_path.is_file() and jsonl_path.is_file()):
        return None, []

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sid = meta["session_id"]
    redactions = 0
    messages = []
    seq = 0

    with jsonl_path.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue  # truncated live line; the object keeps it
            role = (entry.get("message") or {}).get("role") or entry.get("type")
            if role not in ("user", "assistant"):
                continue
            body = body_of(entry)
            if not body:
                continue
            body, n = redact(body)
            redactions += n
            truncated = len(body) > MAX_BODY_CHARS
            if truncated:
                body = body[:MAX_BODY_CHARS]
            seq += 1
            messages.append({
                "session_id": sid, "seq": seq, "role": role,
                "at": entry.get("timestamp") or "", "body": body,
                "truncated": "true" if truncated else "false",
            })

    title, _ = redact(meta.get("title") or "")
    session = {
        "session_id": sid,
        "title": title[:200],
        "project_path": meta.get("cwd") or "",
        "origin": "claude_code_cli",
        "started_at": meta.get("first_timestamp") or "",
        "ended_at": meta.get("last_timestamp") or "",
        "message_count": len(messages),
        "tool_calls": meta.get("tool_calls") or 0,
        "byte_size": meta.get("bytes") or 0,
        "object_key": f"{R2_PREFIX}/{sid}.jsonl",
        "sha256": sha_of(d, "transcript.jsonl"),
        "redactions": redactions,
    }
    return session, messages


def sha_of(d: Path, name: str) -> str:
    """Reuse the checksum the archiver already computed and verified."""
    sums = d / "SHA256SUMS"
    if sums.is_file():
        for line in sums.read_text().splitlines():
            digest, _, fname = line.partition("  ")
            if fname.strip() == name:
                return digest
    import hashlib
    h = hashlib.sha256()
    with (d / name).open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- emitting

SESSION_COLS = ["session_id", "title", "project_path", "origin", "started_at",
                "ended_at", "message_count", "tool_calls", "byte_size",
                "object_key", "sha256", "redactions"]
MESSAGE_COLS = ["session_id", "seq", "role", "at", "body", "truncated"]

LOAD_SQL = """\
-- Generated by push-claude-archive.py. Safe to re-run: staged into temp
-- tables, then upserted. A session already present with the same sha256 is
-- left alone rather than rewritten.
begin;

create temp table _s (like archive.claude_sessions including defaults) on commit drop;
alter table _s drop column if exists needs_review;
alter table _s drop column if exists ingested_at;
create temp table _m (like archive.claude_messages including defaults) on commit drop;

\\copy _s ({session_cols}) from '{sessions_csv}' with (format csv, header true)
\\copy _m ({message_cols}) from '{messages_csv}' with (format csv, header true)

insert into archive.claude_sessions ({session_cols})
select {session_cols} from _s
on conflict (session_id) do update set
  title         = excluded.title,
  message_count = excluded.message_count,
  tool_calls    = excluded.tool_calls,
  object_key    = excluded.object_key,
  sha256        = excluded.sha256,
  redactions    = excluded.redactions,
  ingested_at   = now()
where archive.claude_sessions.sha256 is distinct from excluded.sha256;

-- Messages are replaced wholesale for any session in this batch: a transcript
-- is append-only, so a differing sha256 means new turns, not edited ones.
delete from archive.claude_messages
 where session_id in (select session_id from _s);

insert into archive.claude_messages ({message_cols})
select {message_cols} from _m;

commit;

select session_id, message_count, redactions, needs_review
  from archive.claude_sessions order by ingested_at desc limit 20;
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archive_root", help="dir holding the save-claude-session.py output")
    ap.add_argument("--out", default="/tmp/claude-archive-load", help="where to write CSV + load.sql")
    ap.add_argument("--push", action="store_true", help="actually run psql (needs DATABASE_URL)")
    args = ap.parse_args()

    root = Path(args.archive_root).expanduser()
    out = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)

    sessions, messages = [], []
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        s, m = load_archive(d)
        if s:
            sessions.append(s)
            messages.extend(m)
            flag = f"  ⚠ {s['redactions']} redaction(s)" if s["redactions"] else ""
            print(f"  {s['session_id'][-8:]}  {len(m):5d} messages{flag}  {s['title'][:48]}")

    if not sessions:
        raise SystemExit(f"! no archives with metadata.json under {root}")

    scsv, mcsv = out / "sessions.csv", out / "messages.csv"
    for path, cols, rows in ((scsv, SESSION_COLS, sessions), (mcsv, MESSAGE_COLS, messages)):
        with path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)

    sql = LOAD_SQL.format(
        session_cols=", ".join(SESSION_COLS),
        message_cols=", ".join(MESSAGE_COLS),
        sessions_csv=scsv, messages_csv=mcsv,
    )
    (out / "load.sql").write_text(sql, encoding="utf-8")

    total_red = sum(s["redactions"] for s in sessions)
    print(f"\n{len(sessions)} session(s), {len(messages)} message(s), "
          f"{total_red} redaction(s) → {out}")
    if total_red:
        print("Read the flagged sessions by eye. The scrubber catches known key")
        print("shapes; it does not catch a secret that looks like ordinary text.")

    if not args.push:
        print(f"\nNothing sent. To load it:\n\n    psql \"$DATABASE_URL\" -f {out/'load.sql'}\n")
        return

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("! --push needs DATABASE_URL set")
    print("\nLoading…")
    subprocess.run(["psql", dsn, "-v", "ON_ERROR_STOP=1", "-f", str(out / "load.sql")], check=True)

    print(f"\nPostgres has the index. The verbatim .jsonl still needs to reach R2:\n")
    for s in sessions:
        print(f"    aws s3 cp <archive>/transcript.jsonl s3://<bucket>/{s['object_key']} \\")
        print(f"        --endpoint-url https://<account>.r2.cloudflarestorage.com")
        break
    print("\n(one per session; object_key is already recorded in the row)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
