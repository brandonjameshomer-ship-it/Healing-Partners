#!/usr/bin/env python3
"""
save-claude-session.py — archive a Claude Code session before you delete it.

Claude Code keeps each session's transcript as a JSONL file under
~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl

This copies one (or all) of those somewhere durable, writes a readable
Markdown version beside it, records metadata, and verifies the copy by
checksum.

It does NOT delete anything. Deleting is your call, and the script prints
the exact command once the copy is verified. A tool that saves and deletes
in one pass will eventually delete something it failed to save.

Usage:
    python3 save-claude-session.py list
    python3 save-claude-session.py list --project Healing-Partners
    python3 save-claude-session.py save 012o8xs1
    python3 save-claude-session.py save --all
    python3 save-claude-session.py save 012o8xs1 --out ~/Documents/claude-archive

No dependencies. Python 3.8+.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

CLAUDE_HOME = Path(os.environ.get("CLAUDE_HOME", Path.home() / ".claude"))
PROJECTS_DIR = CLAUDE_HOME / "projects"
TODOS_DIR = CLAUDE_HOME / "todos"
DEFAULT_OUT = Path.home() / "claude-session-archive"

# Tool results can be megabytes. The verbatim JSONL keeps everything; the
# Markdown is for reading, so it gets a ceiling.
MAX_RESULT_CHARS = 2000
MAX_INPUT_CHARS = 600


# ---------------------------------------------------------------- discovery


def iter_transcripts():
    """Yield (path, project_dir_name) for every session transcript on disk."""
    if not PROJECTS_DIR.is_dir():
        return
    for project_dir in sorted(PROJECTS_DIR.iterdir()):
        if not project_dir.is_dir():
            continue
        for path in sorted(project_dir.glob("*.jsonl")):
            yield path, project_dir.name


def decode_project_name(encoded: str) -> str:
    """~/.claude/projects dirs encode the cwd with '-' for '/'. Best effort."""
    return "/" + encoded.strip("-").replace("-", "/")


def read_jsonl(path: Path):
    """Parse a transcript leniently — a truncated final line is normal for a
    session that is still running, and must not abort the archive."""
    entries, bad = [], 0
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                bad += 1
    return entries, bad


# ---------------------------------------------------------------- inspection


def blocks_of(entry: dict) -> list:
    """Content blocks for an entry, normalised to a list. Schema has shifted
    across CLI versions, so accept both the string and the block-array form."""
    msg = entry.get("message")
    if not isinstance(msg, dict):
        return []
    content = msg.get("content")
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    if isinstance(content, list):
        return [b for b in content if isinstance(b, dict)]
    return []


def plain_text(entry: dict) -> str:
    return "\n".join(
        b.get("text", "") for b in blocks_of(entry) if b.get("type") == "text"
    ).strip()


def summarize(entries: list, path: Path, project_dir: str) -> dict:
    users = assistants = tool_calls = 0
    first_ts = last_ts = None
    session_id = None
    cwd = None
    title = ""

    for e in entries:
        session_id = session_id or e.get("sessionId")
        cwd = cwd or e.get("cwd")

        ts = e.get("timestamp")
        if ts:
            first_ts = first_ts or ts
            last_ts = ts

        role = (e.get("message") or {}).get("role") or e.get("type")
        if role == "user":
            users += 1
            # First substantive user line makes a serviceable title.
            if not title:
                t = plain_text(e)
                if t and not t.startswith("<"):
                    title = t.splitlines()[0][:120]
        elif role == "assistant":
            assistants += 1
            tool_calls += sum(1 for b in blocks_of(e) if b.get("type") == "tool_use")

    return {
        "session_id": session_id or path.stem,
        "title": title or "(no title)",
        "transcript": str(path),
        "project_dir": project_dir,
        "cwd": cwd or decode_project_name(project_dir),
        "first_timestamp": first_ts,
        "last_timestamp": last_ts,
        "user_messages": users,
        "assistant_messages": assistants,
        "tool_calls": tool_calls,
        "entries": len(entries),
        "bytes": path.stat().st_size,
    }


# ---------------------------------------------------------------- rendering


def clip(text: str, limit: int) -> str:
    text = text if isinstance(text, str) else json.dumps(text, default=str)
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n… [{len(text) - limit} more chars — see transcript.jsonl]"


def to_markdown(entries: list, meta: dict) -> str:
    out = [
        f"# {meta['title']}",
        "",
        f"- **Session** `{meta['session_id']}`",
        f"- **Project** `{meta['cwd']}`",
        f"- **Span** {meta.get('first_timestamp') or '?'} → {meta.get('last_timestamp') or '?'}",
        f"- **Volume** {meta['user_messages']} from you, "
        f"{meta['assistant_messages']} from Claude, {meta['tool_calls']} tool calls",
        "",
        "---",
        "",
    ]

    for e in entries:
        role = (e.get("message") or {}).get("role") or e.get("type")
        if role not in ("user", "assistant"):
            continue

        parts = []
        for b in blocks_of(e):
            kind = b.get("type")
            if kind == "text":
                if b.get("text", "").strip():
                    parts.append(b["text"].rstrip())
            elif kind == "tool_use":
                args = clip(json.dumps(b.get("input", {}), indent=2, default=str),
                            MAX_INPUT_CHARS)
                parts.append(
                    f"<details><summary>🔧 {b.get('name', 'tool')}</summary>\n\n"
                    f"```json\n{args}\n```\n\n</details>"
                )
            elif kind == "tool_result":
                body = b.get("content")
                if isinstance(body, list):
                    body = "\n".join(
                        x.get("text", "") for x in body if isinstance(x, dict)
                    )
                body = clip(body or "", MAX_RESULT_CHARS)
                if body.strip():
                    parts.append(
                        f"<details><summary>↳ result</summary>\n\n"
                        f"```\n{body}\n```\n\n</details>"
                    )
            # 'thinking' blocks are intentionally skipped — they are in the
            # JSONL if you need them, but they swamp a readable transcript.

        if not parts:
            continue
        out.append("## You" if role == "user" else "## Claude")
        out.append("")
        out.extend(parts)
        out.append("")

    return "\n".join(out)


# ---------------------------------------------------------------- archiving


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return (slug[:48] or "session").strip("-")


def save_one(path: Path, project_dir: str, out_root: Path) -> Path:
    entries, bad = read_jsonl(path)
    if not entries:
        raise SystemExit(f"! {path} parsed to zero entries — refusing to archive it")

    meta = summarize(entries, path, project_dir)
    meta["unparseable_lines"] = bad
    meta["archived_at"] = datetime.now(timezone.utc).isoformat()

    day = (meta.get("first_timestamp") or meta["archived_at"])[:10]
    short = meta["session_id"][-8:]
    dest = out_root / f"{day}-{slugify(meta['title'])}-{short}"
    dest.mkdir(parents=True, exist_ok=True)

    # 1. Verbatim copy first — everything else is derived and can be regenerated.
    copied = dest / "transcript.jsonl"
    shutil.copy2(path, copied)

    # 2. Verify before anyone is told it is safe to delete.
    if sha256(copied) != sha256(path):
        raise SystemExit(f"! checksum mismatch copying {path} — original left alone")

    (dest / "transcript.md").write_text(to_markdown(entries, meta), encoding="utf-8")
    (dest / "metadata.json").write_text(
        json.dumps(meta, indent=2, default=str), encoding="utf-8"
    )

    # 3. Todos, if this session kept any.
    todos = sorted(TODOS_DIR.glob(f"{meta['session_id']}*.json")) if TODOS_DIR.is_dir() else []
    for t in todos:
        shutil.copy2(t, dest / t.name)

    (dest / "SHA256SUMS").write_text(
        "".join(f"{sha256(f)}  {f.name}\n" for f in sorted(dest.iterdir()) if f.is_file()),
        encoding="utf-8",
    )

    size_mb = meta["bytes"] / 1_048_576
    print(f"  saved  {dest}")
    print(f"         {meta['entries']} entries, {size_mb:.1f} MB, "
          f"{len(todos)} todo file(s){', %d unparseable line(s)' % bad if bad else ''}")
    return dest


# ---------------------------------------------------------------- commands


def cmd_list(args):
    rows = []
    for path, project_dir in iter_transcripts():
        if args.project and args.project.lower() not in project_dir.lower():
            continue
        entries, _ = read_jsonl(path)
        if entries:
            rows.append(summarize(entries, path, project_dir))

    if not rows:
        print(f"No transcripts under {PROJECTS_DIR}")
        return

    rows.sort(key=lambda r: r.get("last_timestamp") or "", reverse=True)
    print(f"{len(rows)} session(s) under {PROJECTS_DIR}\n")
    for r in rows:
        print(f"  {r['session_id'][-8:]}  {(r.get('last_timestamp') or '?')[:16]:16}  "
              f"{r['bytes']/1_048_576:6.1f} MB  {r['title'][:60]}")
        print(f"            {r['cwd']}")
    print("\nSave one with:  python3 save-claude-session.py save <first-8-of-id>")


def cmd_save(args):
    out_root = Path(args.out).expanduser()
    targets = []
    for path, project_dir in iter_transcripts():
        if args.all or (args.session and args.session.lower() in path.stem.lower()):
            targets.append((path, project_dir))

    if not targets:
        raise SystemExit(f"! no transcript matching {args.session!r} under {PROJECTS_DIR}")
    if args.session and len(targets) > 1:
        print(f"! {args.session!r} matches {len(targets)} sessions — be more specific:")
        for p, _ in targets:
            print(f"    {p.stem}")
        raise SystemExit(1)

    print(f"Archiving {len(targets)} session(s) to {out_root}\n")
    saved = [save_one(p, d, out_root) for p, d in targets]

    print("\nVerified. Nothing has been deleted.")
    print("If you want the originals gone, this is the command — read it before you run it:\n")
    for (p, _), dest in zip(targets, saved):
        print(f"    rm {p}      # archived to {dest.name}")
    print()


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="show sessions found on disk")
    p_list.add_argument("--project", help="filter by project path fragment")
    p_list.set_defaults(func=cmd_list)

    p_save = sub.add_parser("save", help="archive a session (never deletes)")
    p_save.add_argument("session", nargs="?", help="session id, or any unique fragment")
    p_save.add_argument("--all", action="store_true", help="archive every session")
    p_save.add_argument("--out", default=str(DEFAULT_OUT), help=f"destination (default {DEFAULT_OUT})")
    p_save.set_defaults(func=cmd_save)

    args = ap.parse_args()
    if args.cmd == "save" and not args.session and not args.all:
        ap.error("give a session id, or --all")
    args.func(args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
