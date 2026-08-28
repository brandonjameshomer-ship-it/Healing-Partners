// The interview — a biographer, not a form.
//
// Deploy:  supabase functions deploy interview
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          supabase secrets set ALLOWED_ORIGINS=https://healingpartners.us,https://...
//
// Deployed WITH jwt verification (the default), same as classify-story.
//
// ---------------------------------------------------------------------------
// Why this exists
//
// Page two used to be ten fixed questions in a column. The interview guide this
// product is built on says plainly not to do that: start wide, follow the
// energy, ask one question at a time, do not run a checklist. A form cannot
// follow the energy — it asks about marriage after you have just been told
// he never married.
//
// So the model reads what the family has actually said and decides what to ask
// next. Coverage still matters and is tracked, but it is a map of where the
// conversation has been, not a queue of what must be asked.
//
// ---------------------------------------------------------------------------
// What this function does NOT do
//
// It does not write anything down. The transcript arrives, shapes one question,
// and is gone. Nothing about the person who died is persisted here — no table,
// no log line, no cache. classify-story caches tags because tags are not the
// story; a transcript IS the story, and it stays in the browser where the
// family put it.
//
// Under the Partner User Agreement the Partner is the controller and Healing
// Partners the processor (§9.1), and nothing here is used to train a model
// (§8.4, DPA D-11). A function that quietly kept transcripts would break both.
// ---------------------------------------------------------------------------

// Where a conversation can go. This is a map for the model to read, not a
// queue to work through. A life that had no sport in it should never be asked
// about sport.
const AREAS = [
  "childhood", "sports", "young_adult", "dating", "marriage", "parenting",
  "work", "habits", "hobbies", "talents",
] as const;

type Area = typeof AREAS[number];

// Kept in sync with the labels page three shows over each rating slider.
const AREA_LABELS: Record<Area, string> = {
  childhood: "Childhood",
  sports: "Sports",
  young_adult: "Young adult",
  dating: "Dating",
  marriage: "Marriage",
  parenting: "Parenting",
  work: "Work",
  habits: "Habits",
  hobbies: "Hobbies",
  talents: "Talents",
};

/* ------------------------------------------------------------------
   Privacy filter — same posture as classify-story.

   A grieving family writes things a form never asks for: diagnoses, the
   home address, living relatives by name, service records. We decide what
   leaves the browser rather than forwarding it raw.

   Note the difference from classify-story: that function returns only tags,
   so nothing can be quoted back. This one returns a question, which means
   the model's output reaches the family. The system prompt therefore forbids
   quoting anything sensitive, and the redaction below runs first regardless.
   ------------------------------------------------------------------ */
function redact(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email]")
    .replace(/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]")
    .replace(/\b\d+\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd)\b/g, "[address]")
    .slice(0, 4000);
}

const SYSTEM = `You are conducting an interview with a family who has just lost someone. You are a biographer and ghost writer, not a form. Your questions decide whether the memorial ends up saying something true or something generic.

THE BAR
A stranger walking past the finished memorial should understand who this person was. You do not clear that bar by asking whether they were kind. You clear it with one concrete specific thing — the porch lending library, the candy-apple Mustang, the cameo brooch that came from her mother.

HOW TO ASK
- Ask about behaviour, not character. "What did their hands look like at the end of a workday?" beats "Were they hard-working?" Adjectives produce adjectives; specifics produce stories.
- Ask about the ordinary, not the milestone. "What would an ordinary Saturday look like?" Everyone graduates; not everyone had the same Saturday.
- Follow the energy. When they give you more detail than the question asked for, stay there and go deeper. That is the memorial.
- One question at a time. Stacked questions get you an answer to the easiest one.
- Ask the question they are waiting for. "What would embarrass them to hear us say?" gives permission to be honest, which is often a relief.

WHAT NOT TO DO
- Never ask about an area the family has already closed. If they said he never married, do not ask about marriage.
- Never assume military service. Ask plainly if it comes up; never infer it from an interest in war or history.
- Never assume faith from a name, an ethnicity, or a single holiday mention. Only go there if they raised it.
- Never ask two questions at once. Never ask a question they have effectively already answered.
- Never quote back a medical detail, an address, a living person's full name, or anything a family would not want on a screen in a shared arrangement room.

WHEN THEY ARE STRUGGLING
Grief makes recall hard; that is not a failure. Offer a menu instead of an open question ("was he more of a fixer, a talker, or a quiet one?"). Ask about objects — "what is still in the garage?" — because objects carry stories when memory stalls. Ask about other people. If they have given you very short answers three times running, say you have enough to start.

WHEN YOU HAVE ENOUGH
Set "enough" to true once you have three or four concrete, specific things you could hand to a designer. More is welcome but never required, and a family should never feel held. Err toward enough: a short honest interview beats an exhausting one.

RETURN FORMAT
Return ONLY a JSON object. No prose, no explanation, no markdown fence.

{
  "question": "",     // the single next question, in your own words, addressed to the family
  "why": "",          // one short line under the question that helps them answer it — a nudge toward the specific, not a second question
  "area": "",         // which area of life this question is reaching for, from the allowed list
  "placeholder": "",  // an example answer in the right register, to show the kind of detail wanted
  "enough": false     // true when a designer could work from what has been said
}

Write the question the way a person would say it out loud. Warm, plain, unhurried. Never use the words "deceased", "loved one", or "passing". Use the name the family uses.`;

Deno.serve(async (req) => {
  // Locked to our own origins. "*" would let any site invoke this with a token
  // it had obtained elsewhere.
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
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: cors });
    }

    const body = await req.json();
    const known = typeof body?.known === "string" ? body.known.slice(0, 60) : "";
    const turns: Array<{ q?: unknown; a?: unknown; area?: unknown }> =
      Array.isArray(body?.turns) ? body.turns.slice(-24) : [];

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    // Unconfigured is not an error the family should ever see. The browser
    // falls back to the fixed question set and the interview continues.
    if (!key) return json({ reason: "unconfigured" }, cors);

    // The transcript so far, redacted. Answers are trimmed but not summarised —
    // the model needs the family's own words to follow the energy.
    const transcript = turns
      .filter((t) => typeof t.a === "string" && (t.a as string).trim())
      .map((t) => `Q: ${String(t.q ?? "").slice(0, 300)}\nA: ${redact(String(t.a))}`)
      .join("\n\n");

    const covered = turns
      .map((t) => String(t.area ?? ""))
      .filter((a) => (AREAS as readonly string[]).includes(a));

    const who = known || "them";
    const user = transcript
      ? `The family calls the person who died "${who}".\n\n` +
        `Areas already touched: ${covered.length ? covered.join(", ") : "none"}\n` +
        `Areas available: ${AREAS.join(", ")}\n\n` +
        `The interview so far:\n\n${transcript}\n\n` +
        `Ask the next question. Follow what they have given you rather than moving to a new area for its own sake.`
      : `The family calls the person who died "${who}". Nothing has been said yet.\n\n` +
        `Areas available: ${AREAS.join(", ")}\n\n` +
        `Open the interview. Start wide and unstructured — invite them to say whatever comes, in whatever order. Do not lead with a specific area.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // The quality of the question IS the product here, which is why this
        // is Opus where classify-story is content with Sonnet. Effort is the
        // tuning knob: a family is waiting on this response, so it is not set
        // higher than the job needs.
        model: "claude-opus-5",
        max_tokens: 2000,
        output_config: { effort: "medium" },
        // The guide never changes between families or between turns, so it is
        // worth caching. Check usage.cache_read_input_tokens if you suspect
        // it has stopped hitting.
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();

    // Opus 5 thinks by default; the answer is the last text block, not the first.
    const raw = (data?.content ?? [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("")
      .trim();

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());
    } catch { /* fall through to the fallback below */ }

    const question = str(parsed.question, 240);
    // No usable question means no question. The browser falls back rather than
    // showing the family an empty card.
    if (!question) return json({ reason: "unparsed" }, cors);

    const area = (AREAS as readonly string[]).includes(String(parsed.area))
      ? String(parsed.area) as Area
      : null;

    return json({
      question,
      why: str(parsed.why, 200),
      placeholder: str(parsed.placeholder, 160),
      area,
      label: area ? AREA_LABELS[area] : "Their story",
      enough: parsed.enough === true,
    }, cors);
  } catch (err) {
    // Fail soft, always. A family in an arrangement room must never be blocked
    // by an API outage — the browser carries on with the fixed questions.
    console.error("interview failed:", err instanceof Error ? err.message : "unknown");
    return json({ reason: "error" }, cors);
  }
});

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function json(body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
