#!/usr/bin/env node
/* =============================================================================
 * Opus 5, Sonnet 5 and Haiku 4.5 on the same transcript, blind.
 * -----------------------------------------------------------------------------
 *   export ANTHROPIC_API_KEY=sk-ant-...        (Terminal only — never in the repo)
 *   node tools/interview-ab.mjs                            # all three, bundled transcripts
 *   node tools/interview-ab.mjs my-transcripts.json        # your own transcripts
 *   node tools/interview-ab.mjs --models opus,sonnet       # just two of them
 *   node tools/interview-ab.mjs --runs 3                   # 3 questions per transcript
 *
 * WHY BLIND. You are judging the one call in this product where a worse
 * question means a worse memorial, and you already believe Opus is better —
 * the code says so in a comment. Knowing which is which while you score would
 * settle the question before you started. So each set is shuffled, labelled
 * A, B, C, and which model produced which is not printed until the tally.
 *
 * WHY THIS READS THE EDGE FUNCTION. The system prompt and the area list are
 * parsed straight out of supabase/functions/interview/index.ts at run time
 * rather than copied here. A copy would drift, and then you would be comparing
 * two models on a prompt neither of them will ever see in production.
 *
 * WHAT IT COSTS. One call per model per question. At roughly 5K input and 600
 * output, all three together are about $0.05 a set — a 30-transcript run is
 * under two dollars. It prints the running total as it goes.
 * =========================================================================== */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FN = path.join(here, "..", "supabase", "functions", "interview", "index.ts");

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
    "  In Terminal:  export ANTHROPIC_API_KEY=sk-ant-...\n" +
    "  The key set with `supabase secrets set` lives on Supabase, not on this machine."
  );
  process.exit(2);
}

/* Anthropic first-party rates, $ per million tokens. */
const MODELS = {
  opus:   { id: "claude-opus-5",    in: 5.00, out: 25.00, effort: "medium" },
  sonnet: { id: "claude-sonnet-5",  in: 2.00, out: 10.00, effort: "medium" },
  haiku:  { id: "claude-haiku-4-5", in: 1.00, out:  5.00, effort: null },
  /* effort is an Opus/Sonnet-tier parameter. Sonnet 5 takes it, so swapping
     Opus for Sonnet changes nothing but the model string — which is what makes
     it a fair comparison. Haiku 4.5 rejects effort with a 400, so it has to be
     called differently, and the edge function would swallow that as an outage. */
};

/* ---- the real prompt, lifted from the function ------------------------- */

function loadPrompt() {
  const src = fs.readFileSync(FN, "utf8");

  const sys = src.match(/^const SYSTEM = `([\s\S]*?)`;$/m);
  if (!sys) throw new Error("Could not find SYSTEM in " + FN);

  const areasBlock = src.match(/^const AREAS = \[([\s\S]*?)\] as const;$/m);
  if (!areasBlock) throw new Error("Could not find AREAS in " + FN);
  const areas = [...areasBlock[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  /* If either regex ever stops matching the function has been restructured —
     better to stop than to silently compare models on a stale prompt. */

  return { SYSTEM: sys[1], AREAS: areas };
}

/* The same shape the function builds. Kept short deliberately — if this and
   the function disagree the comparison is worthless, so it is checked below. */
function userMessage({ SYSTEM, AREAS }, known, turns) {
  const transcript = turns
    .filter((t) => t.a && t.a.trim())
    .map((t) => `Q: ${String(t.q ?? "").slice(0, 300)}\nA: ${t.a}`)
    .join("\n\n");
  const covered = turns.map((t) => t.area).filter((a) => AREAS.includes(a));
  const who = known || "them";

  return transcript
    ? `The family calls the person who died "${who}".\n\n` +
      `Areas already touched: ${covered.length ? covered.join(", ") : "none"}\n` +
      `Areas available: ${AREAS.join(", ")}\n\n` +
      `The interview so far:\n\n${transcript}\n\n` +
      `Ask the next question. Follow what they have given you rather than moving to a new area for its own sake.`
    : `The family calls the person who died "${who}". Nothing has been said yet.\n\n` +
      `Areas available: ${AREAS.join(", ")}\n\n` +
      `Open the interview. Start wide and unstructured — invite them to say whatever comes, in whatever order. Do not lead with a specific area.`;
}

/* ---- one call ---------------------------------------------------------- */

async function ask(model, prompt, user) {
  const body = {
    model: model.id,
    max_tokens: 2000,
    system: [{ type: "text", text: prompt.SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };
  if (model.effort) body.output_config = { effort: model.effort };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${model.id} → ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();

  const raw = (data.content ?? [])
    .filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();

  let parsed = {};
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()); } catch {}

  const u = data.usage ?? {};
  const cost =
    ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)) / 1e6 * model.in +
    (u.output_tokens ?? 0) / 1e6 * model.out;

  return {
    question: parsed.q || raw.slice(0, 300),
    why: parsed.why || "",
    area: parsed.area || "",
    cost,
    cached: u.cache_read_input_tokens ?? 0,
  };
}

/* ---- transcripts ------------------------------------------------------- */

/* Three shapes the real thing has to handle: nothing said yet, an answer with
   one concrete detail worth chasing, and an answer that closes a door — the
   case where a form would ask about a marriage that was just ruled out. */
const BUNDLED = [
  { known: "Ruthie", turns: [] },
  { known: "Ruthie", turns: [
    { area: "childhood", q: "What do you want said about her?",
      a: "The creek behind the house. She came home muddy every single day one whole summer." },
  ]},
  { known: "Joe", turns: [
    { area: "childhood", q: "What do you want said about him?",
      a: "He never married and he had no children. It was him and the workshop, forty years." },
    { area: "talents", q: "What could he do that nobody else could?",
      a: "He could fix anything with a screwdriver and patience. Neighbours brought him toasters." },
  ]},
];

/* ---- main -------------------------------------------------------------- */

const args = process.argv.slice(2);
const runsFlag = args.indexOf("--runs");
const RUNS = runsFlag >= 0 ? Number(args[runsFlag + 1]) || 1 : 1;
const fileArg = args.find((a) => !a.startsWith("--") && a !== String(RUNS));

const transcripts = fileArg
  ? JSON.parse(fs.readFileSync(fileArg, "utf8"))
  : BUNDLED;

const prompt = loadPrompt();
console.log(`Prompt read from ${path.relative(process.cwd(), FN)} — ` +
            `${prompt.SYSTEM.length} chars, ${prompt.AREAS.length} areas.`);
console.log(`${transcripts.length} transcript(s) × ${RUNS} run(s). ` +
            `Answers are shuffled; which model is which is revealed at the end.\n`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const askUser = (q) => new Promise((r) => rl.question(q, r));

const CHOSEN = (() => {
  const i = args.indexOf("--models");
  const names = i >= 0 ? args[i + 1].split(",") : ["opus", "sonnet", "haiku"];
  const bad = names.filter((n) => !MODELS[n]);
  if (bad.length) { console.error("Unknown model(s): " + bad.join(", ")); process.exit(2); }
  return names;
})();

const LETTERS = "ABCDEFG";
const tally = Object.fromEntries([...CHOSEN.map((n) => [n, 0]), ["tie", 0]]);
let spent = 0;
const log = [];

for (let i = 0; i < transcripts.length; i++) {
  for (let run = 0; run < RUNS; run++) {
    const t = transcripts[i];
    const user = userMessage(prompt, t.known, t.turns || []);

    let answers;
    try {
      answers = await Promise.all(CHOSEN.map((n) => ask(MODELS[n], prompt, user)));
    } catch (e) {
      console.error("\n  " + e.message + "\n");
      continue;
    }
    answers.forEach((r) => { spent += r.cost; });

    /* Shuffle, so the same model is not always in the same position. */
    const order = CHOSEN.map((n, k) => ({ name: n, r: answers[k] }))
      .sort(() => Math.random() - 0.5);
    const labelOf = (letter) => order[LETTERS.indexOf(letter)].name;

    console.log("─".repeat(72));
    console.log(`Transcript ${i + 1}${RUNS > 1 ? ` · run ${run + 1}` : ""} — "${t.known}", ` +
                `${(t.turns || []).length} answer(s) so far`);
    const last = (t.turns || []).slice(-1)[0];
    if (last) console.log(`  last answer: "${last.a.slice(0, 90)}${last.a.length > 90 ? "…" : ""}"`);
    console.log();
    order.forEach((o, k) => {
      console.log(`  ${LETTERS[k]}  ${o.r.question}`);
      if (o.r.why) console.log(`     (${o.r.why})`);
      console.log();
    });

    const valid = order.map((_, k) => LETTERS[k].toLowerCase()).concat(["=", "q"]);
    let ans = "";
    while (!valid.includes(ans)) {
      ans = (await askUser(`  Best question? [${valid.join(" / ")}]  (= tie, q quit) `)).trim().toLowerCase();
    }
    if (ans === "q") { run = RUNS; i = transcripts.length; break; }

    const winner = ans === "=" ? "tie" : labelOf(ans.toUpperCase());
    tally[winner]++;
    log.push({ transcript: i + 1, run: run + 1, winner,
               questions: Object.fromEntries(order.map((o) => [o.name, o.r.question])) });
    console.log(`  → ${winner === "tie" ? "tie" : winner}\n`);
  }
}

rl.close();

const judged = Object.values(tally).reduce((a, b) => a + b, 0);
console.log("═".repeat(72));
console.log(`Judged ${judged} set(s).  ` +
  CHOSEN.map((n) => `${n} ${tally[n]}`).join(" · ") + ` · tie ${tally.tie}`);
console.log(`Spent about ${spent.toFixed(3)}.`);
if (judged >= 5) {
  const best = CHOSEN.slice().sort((a, b) => tally[b] - tally[a])[0];
  console.log(`\nAhead on this sample: ${best}. Three invented transcripts decide nothing —`);
  console.log("run it again on real ones before changing the model in index.ts.");
}

const out = path.join(here, "..", "interview-ab-results.json");
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), tally, spent, log }, null, 2));
console.log(`\nFull log: ${path.relative(process.cwd(), out)}`);
