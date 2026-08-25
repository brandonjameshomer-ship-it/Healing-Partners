// Story classification — AI for understanding, deterministic code for decisions.
//
// Deploy:  supabase functions deploy classify-story
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-... \
//          supabase secrets set ALLOWED_ORIGINS=https://healingpartners.us,https://...
//
// Deployed WITH jwt verification (the default). It writes as the caller, so
// row level security governs what it can touch. It must never hold the
// service role key.
//
// Called ONCE per story, not once per interaction. The recommendation engine
// stays in the browser and stays deterministic; this only replaces the regex
// tagging with something that reads meaning instead of vocabulary.
//
// "She worked through her grief" must not tag as `work`. That is the failure
// this exists to fix.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_THEMES = [
  "work", "family", "faith", "land", "music", "service", "humour",
  "community", "craft", "animals", "travel", "food", "sport", "learning",
] as const;

const ALLOWED_TRAITS = [
  "traditional", "warm", "private", "strong", "gentle", "devout",
  "practical", "joyful", "generous", "stubborn", "funny", "quiet",
] as const;

/* ------------------------------------------------------------------
   Privacy filter.

   The story is about a real person who has died, written by someone
   grieving. It can contain medical history, addresses, living relatives'
   names, and military records. We deliberately decide what leaves the
   system rather than forwarding it raw.

   Two protections:
     1. Obvious direct identifiers are redacted before the call.
     2. The model is instructed to return ONLY tags — never free text,
        never a summary, never anything quoted back.
   ------------------------------------------------------------------ */
function redact(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email]")
    .replace(/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]")
    .replace(/\b\d+\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd)\b/g, "[address]")
    .slice(0, 6000);
}

const SYSTEM = `You read a short account of someone who has died, written by a grieving family member, and return structured tags that help suggest what belongs on their memorial.

Return ONLY a JSON object. No prose, no explanation, no quoting the story back.

{
  "themes": [],       // from the allowed list, most significant first, max 4
  "traits": [],       // from the allowed list, max 3
  "places": [],       // generic only: "mountains", "a lake", "a farm" — never a named address
  "confidence": 0.0   // 0 to 1, how much the text actually supports these
}

Rules:
- Use ONLY the allowed values you are given. Never invent tags.
- Read meaning, not vocabulary. "She worked through her grief" is NOT the theme "work".
- Never infer military service from an interest in war or history. Only tag "service" if service is stated.
- Never infer faith from ethnicity, a name, or a single holiday mention.
- If the text is too short or too vague, return empty arrays and low confidence. An honest nothing is better than a guess that puts the wrong symbol on a headstone permanently.
- Never include names of living people, addresses, medical details, or anything identifying.`;

Deno.serve(async (req) => {
  // Locked to our own origins. "*" let any site invoke this with a token it
  // had obtained elsewhere.
  const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : (ALLOWED[0] ?? "null"),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Vary": "Origin",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    // The caller's own token. Required: everything this function writes is
    // written AS them, so RLS decides what they may touch.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: cors });
    }

    const { story, memorial_id } = await req.json();
    if (!story || typeof story !== "string" || story.trim().length < 20) {
      // Too little to work with. Say so rather than guessing.
      return json({ themes: [], traits: [], places: [], confidence: 0, reason: "too_short" }, cors);
    }

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ themes: [], traits: [], places: [], confidence: 0, reason: "unconfigured" }, cors);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 400,
        system: SYSTEM,
        messages: [{
          role: "user",
          content:
            `Allowed themes: ${ALLOWED_THEMES.join(", ")}\n` +
            `Allowed traits: ${ALLOWED_TRAITS.join(", ")}\n\n` +
            `Account:\n${redact(story)}`,
        }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    const raw = data?.content?.[0]?.text ?? "{}";

    // Parse defensively, then hard-filter to the allowed vocabulary. Even a
    // well-behaved model must not be able to widen the tag set.
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());
    } catch { /* fall through to empty */ }

    const themes = arr(parsed.themes).filter((t) => (ALLOWED_THEMES as readonly string[]).includes(t)).slice(0, 4);
    const traits = arr(parsed.traits).filter((t) => (ALLOWED_TRAITS as readonly string[]).includes(t)).slice(0, 3);
    const places = arr(parsed.places).map((p) => p.slice(0, 40)).slice(0, 3);
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence)) : 0;

    // Cache the tags, never the story. The story stays where the family put it.
    //
    // This runs on the CALLER's token, not the service role. The previous
    // version used SUPABASE_SERVICE_ROLE_KEY against a memorial_id taken
    // straight from the request body, which meant any signed-in user — an
    // anonymous QR session included — could overwrite story_tags on any
    // memorial at any funeral home, RLS bypassed entirely. Writing as the
    // caller puts can_see_memorial() back in the path, where it belongs.
    if (memorial_id) {
      try {
        const db = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const { error } = await db.from("memorials").update({
          story_tags: { themes, traits, places, confidence, at: new Date().toISOString() },
        }).eq("id", memorial_id);
        // No rows updated means no permission. Not an error worth failing on —
        // the tags still go back to the browser — but it must not look like success.
        if (error) console.warn("Tag cache refused:", error.message);
      } catch (e) { console.warn("Tag cache failed:", e); }
    }

    return json({ themes, traits, places, confidence }, cors);
  } catch (err) {
    console.error("classify-story failed:", err);
    // Fail soft. The browser falls back to keyword tagging, so a family is
    // never blocked by an API outage.
    return json({ themes: [], traits: [], places: [], confidence: 0, reason: "error" }, cors);
  }
});

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function json(body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
