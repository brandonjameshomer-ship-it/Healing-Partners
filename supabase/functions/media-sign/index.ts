// Presigned URLs for Cloudflare R2 — the only way a file gets in or out.
//
// Deploy:  supabase functions deploy media-sign
// Secrets: supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
//            R2_SECRET_ACCESS_KEY=... R2_BUCKET=remember-them-media \
//            ALLOWED_ORIGINS=https://healingpartners.us,https://...
//
// Deployed WITH jwt verification (the default). Every database read and write
// below runs on the CALLER's token, so can_see_memorial() decides what they
// may touch. This function holds R2 credentials, which the browser must never
// see, but it holds no database privilege the caller does not already have.
//
// WHY PRESIGNED URLS
//
// The alternative is proxying the bytes: browser -> edge function -> R2. That
// puts a 20MB portrait through a function with a memory limit and a request
// timeout, doubles the transfer, and fails on exactly the large scanned
// photographs families care most about. Presigning means we authorise the
// upload and then stay out of the way — the browser talks to R2 directly.
//
// THE BUCKET IS PRIVATE AND STAYS PRIVATE. R2 offers an r2.dev public URL per
// bucket; it is not used here. Family photographs and proofs are readable only
// through a signed GET that expires, minted after the permission check below.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const SECRET_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const BUCKET     = Deno.env.get("R2_BUCKET") ?? "";
const HOST       = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// R2 is S3-compatible but has no regions. "auto" is what it expects in the
// credential scope; anything else fails the signature check.
const REGION  = "auto";
const SERVICE = "s3";

const UPLOAD_TTL = 300;   // 5 minutes to start the PUT
const VIEW_TTL   = 900;   // 15 minutes to load an image into a page

/* ------------------------------------------------------------------
   What may be uploaded.

   An allowlist, not a blocklist. The browser declares a content type and we
   sign for exactly that type — see signedHeaders below — so a file stored as
   image/jpeg cannot later be served as text/html. That matters more than it
   sounds: an HTML file in a bucket someone can link to is a phishing page on
   our domain.

   HEIC is here because iPhones produce it and half the photographs a family
   has of someone who died are on a phone.
   ------------------------------------------------------------------ */
const ALLOWED: Record<string, { ext: string; max: number }> = {
  "image/jpeg":      { ext: "jpg",  max: 25 * 1024 * 1024 },
  "image/png":       { ext: "png",  max: 25 * 1024 * 1024 },
  "image/webp":      { ext: "webp", max: 25 * 1024 * 1024 },
  "image/heic":      { ext: "heic", max: 40 * 1024 * 1024 },
  "image/heif":      { ext: "heif", max: 40 * 1024 * 1024 },
  "image/tiff":      { ext: "tif",  max: 60 * 1024 * 1024 },  // scanned portraits
  "image/svg+xml":   { ext: "svg",  max: 2  * 1024 * 1024 },  // renders from stone.js
  "application/pdf": { ext: "pdf",  max: 50 * 1024 * 1024 },
};

const KINDS = ["photo", "proof", "render", "document"];

/* ==================================================================
   AWS Signature Version 4, query-string form.

   Written out rather than pulled from the AWS SDK because the SDK is a very
   large dependency for one signature, and cold-start time on an edge function
   is time a funeral director spends looking at a spinner.
   ================================================================== */

const enc = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(data))));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

// RFC 3986. encodeURIComponent leaves ! ' ( ) * alone and AWS does not, so a
// key containing any of them would sign correctly and then 403.
function uriEncode(s: string, encodeSlash: boolean): string {
  // Percent-encode the UTF-8 BYTES, not the code units. A key or bucket name
  // containing an accented character signs correctly either way in the common
  // case and then 403s the one time it matters.
  return s.replace(/[^A-Za-z0-9\-._~/]/g, (c) =>
    Array.from(enc.encode(c))
      .map((b) => "%" + b.toString(16).toUpperCase().padStart(2, "0")).join(""),
  ).replace(/\//g, encodeSlash ? "%2F" : "/");
}

async function signingKey(dateStamp: string): Promise<Uint8Array> {
  let k = await hmac(enc.encode("AWS4" + SECRET_KEY), dateStamp);
  k = await hmac(k, REGION);
  k = await hmac(k, SERVICE);
  return await hmac(k, "aws4_request");
}

/* Returns a URL that is valid, on its own, for exactly one operation on one
   object for `ttl` seconds. Headers listed in `extraHeaders` are folded into
   the signature, which means the request MUST send them with those exact
   values or R2 rejects it. */
async function presign(
  method: "GET" | "PUT" | "HEAD",
  key: string,
  ttl: number,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  // A signature is only valid near its own timestamp, so this genuinely has
  // to be wall-clock time.
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");  // 20260826T171300Z
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const headers: Record<string, string> = { host: HOST, ...lowerKeys(extraHeaders) };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort()
    .map((h) => `${h}:${headers[h].trim().replace(/\s+/g, " ")}\n`).join("");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${ACCESS_KEY}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(ttl),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query).sort()
    .map((k) => `${uriEncode(k, true)}=${uriEncode(query[k], true)}`).join("&");

  const canonicalUri = `/${uriEncode(BUCKET, false)}/${uriEncode(key, false)}`;

  // UNSIGNED-PAYLOAD: we are authorising an upload we will never see the body
  // of. This is why the size limit has to be checked again after the fact.
  const canonicalRequest = [
    method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hex(await hmac(await signingKey(dateStamp), stringToSign));
  return `https://${HOST}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function lowerKeys(o: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(o)) out[k.toLowerCase()] = o[k];
  return out;
}

/* ==================================================================
   The function
   ================================================================== */

Deno.serve(async (req) => {
  const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",").map((o) => o.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? "null"),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Vary": "Origin",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "Method not allowed", cors);

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    console.error("media-sign is missing R2 configuration");
    return fail(503, "File storage is not configured yet.", cors);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return fail(401, "Unauthorized", cors);

  // The caller's own token, so row level security applies to everything below.
  // The service role key is deliberately absent from this function: with it,
  // a memorial_id taken from the request body would let any signed-in user —
  // including an anonymous share-link session — read another family's photographs.
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  try {
    const body = await req.json();
    switch (body.action) {
      case "upload":  return await startUpload(db, body, cors);
      case "confirm": return await confirmUpload(db, body, cors);
      case "view":    return await viewUrl(db, body, cors);
      case "retire":  return await retire(db, body, cors);
      default:        return fail(400, "Unknown action", cors);
    }
  } catch (err) {
    console.error("media-sign failed:", err);
    return fail(500, "Something went wrong handling that file.", cors);
  }
});

/* ---- upload -------------------------------------------------------
   Records the intent first, then signs. If the browser never completes the
   PUT the row stays 'pending' and media_due_for_deletion() sweeps it up. A
   file in the bucket with no row would be invisible and immortal, which is
   the worse failure. */
async function startUpload(db: any, body: any, cors: Record<string, string>) {
  const { memorial_id, filename, content_type, size, kind, design_id } = body;

  if (!memorial_id) return fail(400, "Which memorial is this for?", cors);

  const rule = ALLOWED[String(content_type)];
  if (!rule) {
    return fail(415, "That file type can't be used on a memorial. Send a JPEG, PNG, HEIC or PDF.", cors);
  }
  if (typeof size !== "number" || size <= 0) return fail(400, "Missing file size", cors);
  if (size > rule.max) {
    return fail(413, `That file is ${mb(size)} and the limit is ${mb(rule.max)}.`, cors);
  }
  const useKind = KINDS.includes(body.kind) ? kind : "photo";

  // The key is random, never derived from the family's filename. Object keys
  // end up in logs and in signed URLs, and "margaret-hospice-2019.jpg" in a
  // URL says more about a real person than it should.
  const objectKey = `memorials/${memorial_id}/${useKind}/${crypto.randomUUID()}.${rule.ext}`;

  const { data, error } = await db.from("memorial_media").insert({
    memorial_id,
    design_id: design_id ?? null,
    kind: useKind,
    object_key: objectKey,
    content_type,
    original_name: typeof filename === "string" ? filename.slice(0, 160) : null,
    declared_size: size,
    status: "pending",
  }).select("id").single();

  // No row inserted means no permission — can_see_memorial() said no. Say the
  // same thing whether the memorial is another home's or does not exist, so
  // this cannot be used to discover which memorial ids are real.
  if (error || !data) {
    console.warn("upload refused:", error?.message);
    return fail(403, "You don't have access to that memorial.", cors);
  }

  // Binding content-type into the signature is what makes the allowlist real:
  // the PUT must send this exact header or R2 refuses it.
  const url = await presign("PUT", objectKey, UPLOAD_TTL, { "content-type": content_type });

  return json({
    media_id: data.id,
    object_key: objectKey,
    url,
    method: "PUT",
    headers: { "Content-Type": content_type },
    expires_in: UPLOAD_TTL,
  }, cors);
}

/* ---- confirm ------------------------------------------------------
   Called after the PUT succeeds. This is where the size limit is actually
   enforced — a presigned PUT carries no limit of its own, so a caller could
   declare 2MB and send 2GB. We ask R2 what it really stored.

   sha256 comes from the browser, which computed it over the same bytes it
   sent. Partner User Agreement 3.4 wants a proof file hash on the approval
   record; this is where that value originates. */
async function confirmUpload(db: any, body: any, cors: Record<string, string>) {
  const { media_id, sha256 } = body;
  if (!media_id) return fail(400, "Missing media_id", cors);

  const { data: row, error } = await db.from("memorial_media")
    .select("id, object_key, content_type, declared_size").eq("id", media_id).single();
  if (error || !row) return fail(403, "You don't have access to that file.", cors);

  const head = await fetch(await presign("HEAD", row.object_key, 60), { method: "HEAD" });
  if (!head.ok) {
    await db.from("memorial_media").update({ status: "failed" }).eq("id", media_id);
    return fail(404, "That upload didn't arrive. Try again.", cors);
  }

  const actual = Number(head.headers.get("content-length") ?? 0);
  const limit = ALLOWED[row.content_type]?.max ?? 0;
  if (actual > limit) {
    // Over the limit after the fact. Mark it failed so nothing displays it,
    // and let the retention sweep remove the object.
    await db.from("memorial_media").update({ status: "failed", byte_size: actual }).eq("id", media_id);
    return fail(413, `That file is ${mb(actual)} and the limit is ${mb(limit)}.`, cors);
  }

  const { error: upErr } = await db.from("memorial_media").update({
    status: "stored",
    byte_size: actual,
    sha256: typeof sha256 === "string" && /^[0-9a-f]{64}$/.test(sha256) ? sha256 : null,
    confirmed_at: new Date().toISOString(),
  }).eq("id", media_id);
  if (upErr) return fail(403, "You don't have access to that file.", cors);

  return json({ ok: true, media_id, byte_size: actual }, cors);
}

/* ---- view ---------------------------------------------------------
   A short-lived GET. Deliberately short: these URLs end up in <img src>, get
   copied into emails and pasted into group chats, and a link to a grieving
   family's photograph should stop working quickly. Pages re-request rather
   than caching the URL. */
async function viewUrl(db: any, body: any, cors: Record<string, string>) {
  const ids: string[] = Array.isArray(body.media_ids)
    ? body.media_ids.slice(0, 50)
    : (body.media_id ? [body.media_id] : []);
  if (!ids.length) return fail(400, "Missing media_id", cors);

  // One round trip for a whole gallery. RLS filters the list, so ids the
  // caller may not see simply do not come back.
  const { data, error } = await db.from("memorial_media")
    .select("id, object_key, content_type, caption, original_name")
    .in("id", ids).eq("status", "stored").is("deleted_at", null);
  if (error) return fail(403, "You don't have access to those files.", cors);

  const urls = await Promise.all((data ?? []).map(async (r: any) => ({
    media_id: r.id,
    content_type: r.content_type,
    caption: r.caption,
    original_name: r.original_name,
    url: await presign("GET", r.object_key, VIEW_TTL),
  })));

  return json({ files: urls, expires_in: VIEW_TTL }, cors);
}

/* ---- retire -------------------------------------------------------
   A soft delete. The object stays in R2 until the retention sweep, and the
   row is never removed: a proof the family approved is evidence, and there
   is no version of "tidying up" that should be able to destroy it. */
async function retire(db: any, body: any, cors: Record<string, string>) {
  const { media_id } = body;
  if (!media_id) return fail(400, "Missing media_id", cors);

  const { data, error } = await db.from("memorial_media")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", media_id).eq("kind", "photo")   // proofs and renders are not retirable
    .select("id");

  if (error || !data?.length) {
    return fail(403, "That file can't be removed.", cors);
  }
  return json({ ok: true, media_id }, cors);
}

/* ---- plumbing ---------------------------------------------------- */
function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
function json(bodyObj: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function fail(status: number, message: string, cors: Record<string, string>) {
  return json({ error: message }, cors, status);
}
