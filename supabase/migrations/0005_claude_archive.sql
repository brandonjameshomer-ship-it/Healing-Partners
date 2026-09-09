-- 0005_claude_archive.sql
--
-- A PLACE TO KEEP CLAUDE CODE TRANSCRIPTS, WELL AWAY FROM THE FAMILIES
--
-- Claude Code writes one JSONL file per session under ~/.claude/projects/ on
-- the machine that ran it. Those files are the only record of how a decision
-- got made, and they die with the laptop. This is where the record goes so it
-- survives, and so "which session did I find the defunct Stripe plan in?"
-- becomes a query instead of an afternoon.
--
-- WHY ITS OWN SCHEMA, AND NOT public
--
-- Two reasons, and the first is the serious one.
--
-- A transcript is an engineering log that may contain live credentials. Every
-- `cat` of a key file, every `supabase secrets list`, every curl carrying a
-- bearer token leaves its output sitting in a tool_result block in plaintext.
-- Several sessions on this account were *about* setting up credentials, so
-- this is a near certainty rather than a worry. That material must not sit in
-- the same schema as Family Personal Data, which is held under a
-- controller/processor agreement and protected by can_see_memorial().
--
-- Second: PostgREST only serves the schemas named in the project's API
-- settings — `public, graphql_public` unless someone changes it. Leaving
-- `archive` off that list means no browser client can reach these tables at
-- all, by any request, authenticated or not. That is a stronger control than
-- any policy, because it removes the route rather than guarding it.
--
--   DO NOT ADD `archive` TO THE EXPOSED SCHEMAS IN THE API SETTINGS.
--
-- The RLS below is belt-and-braces for the day someone forgets that.
--
-- WHERE THE BYTES LIVE
--
-- Not here, for the same reason as 0004. A long transcript runs to tens of
-- megabytes and it is write-once, read-rarely — exactly the shape that pushed
-- photographs to R2. Postgres holds the metadata and the searchable text; R2
-- holds the verbatim .jsonl. A row here is a pointer.
--
-- These are not memorial_media rows. That table is keyed to a memorial by
-- design and every read runs through can_see_memorial(). A transcript belongs
-- to no memorial, so it gets its own home under its own key prefix, the same
-- argument the photo library makes for its reference images.

-- ============================================================
-- The schema
-- ============================================================

create schema if not exists archive;

-- The API roles get nothing. service_role is what the uploader authenticates
-- as, and it bypasses RLS anyway; a human reads these through the SQL editor,
-- which connects as postgres. Neither path needs anon or authenticated.
revoke all on schema archive from anon, authenticated;
grant usage on schema archive to service_role;

comment on schema archive is
  'Engineering records that are not part of the product. May contain secrets. '
  'Never expose over PostgREST.';

-- ============================================================
-- One row per session
-- ============================================================

create table if not exists archive.claude_sessions (
  session_id     text primary key,       -- the CLI's own uuid, so re-runs collide
  title          text,                   -- first substantive user line, for scanning
  project_path   text,                   -- cwd the session ran in
  origin         text,                   -- 'claude_code_cli' | 'web_claude_ai'

  started_at     timestamptz,
  ended_at       timestamptz,

  message_count  int  not null default 0,
  tool_calls     int  not null default 0,
  byte_size      bigint,                 -- size of the verbatim .jsonl

  -- Path inside the R2 bucket, e.g. archive/claude/<session_id>.jsonl.
  -- Which bucket is a deployment decision, not a schema one; keeping
  -- transcripts out of the family media bucket entirely is the tidier choice.
  object_key     text unique,

  -- Of the verbatim file, before redaction. Two jobs: it makes re-ingesting
  -- the same session a no-op, and it lets you prove years later that the
  -- archived copy is the one that was taken.
  sha256         text not null,

  -- How many secret-shaped strings the uploader masked on the way in. A
  -- scrubber that fired is a session worth looking at by eye: the patterns
  -- catch sk-ant-, shpat_, whsec_, sk_live_, JWTs and AWS-shaped keys, and
  -- miss anything that does not announce itself.
  redactions     int  not null default 0,
  needs_review   boolean generated always as (redactions > 0) stored,

  ingested_at    timestamptz not null default now()
);

create index if not exists claude_sessions_started_idx
  on archive.claude_sessions (started_at desc);

-- ============================================================
-- One row per message
-- ============================================================
--
-- This is the half that earns its keep. The .jsonl in R2 is the archive; this
-- is the index over it. Tool results are truncated on the way in — the full
-- text is in the object — so `truncated` marks where to go and look.

create table if not exists archive.claude_messages (
  session_id  text not null
              references archive.claude_sessions(session_id) on delete cascade,
  seq         int  not null,             -- position in the transcript
  role        text not null check (role in ('user','assistant')),
  at          timestamptz,
  body        text not null,
  truncated   boolean not null default false,
  primary key (session_id, seq)
);

create index if not exists claude_messages_fts_idx
  on archive.claude_messages
  using gin (to_tsvector('english', body));

create index if not exists claude_messages_session_idx
  on archive.claude_messages (session_id, seq);

-- ============================================================
-- Grants
-- ============================================================
--
-- A new schema inherits none of the default privileges Supabase sets up on
-- public, so service_role has to be granted explicitly or the uploader fails
-- with "permission denied for schema archive". The default-privileges line
-- covers anything added to this schema later.

grant all privileges on all tables in schema archive to service_role;
grant all privileges on all sequences in schema archive to service_role;

alter default privileges in schema archive
  grant all privileges on tables to service_role;
alter default privileges in schema archive
  grant all privileges on sequences to service_role;

-- ============================================================
-- Row level security
-- ============================================================
--
-- Unreachable over the API already, because `archive` is not an exposed
-- schema. These policies exist for the day that changes by accident.

alter table archive.claude_sessions enable row level security;
alter table archive.claude_messages enable row level security;

-- is_founder() is created unqualified in dashboard/access.sql, so it lives in
-- public. A policy in another schema must name it explicitly: a bare
-- is_founder() resolves against the search_path in force when the policy is
-- created, which is not something to leave to chance in a security rule.

drop policy if exists cs_founder on archive.claude_sessions;
create policy cs_founder on archive.claude_sessions for all to authenticated
  using (public.is_founder()) with check (public.is_founder());

drop policy if exists cm_founder on archive.claude_messages;
create policy cm_founder on archive.claude_messages for all to authenticated
  using (public.is_founder()) with check (public.is_founder());

-- ============================================================
-- Searching it
-- ============================================================
--
--   select s.title, s.started_at, m.seq, left(m.body, 200)
--     from archive.claude_messages m
--     join archive.claude_sessions s using (session_id)
--    where to_tsvector('english', m.body) @@ websearch_to_tsquery('english', 'stripe defunct plan')
--    order by s.started_at desc;
--
-- And the ones to read by eye before trusting them:
--
--   select session_id, title, redactions from archive.claude_sessions
--    where needs_review order by redactions desc;
