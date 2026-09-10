#!/usr/bin/env node
/* =============================================================================
 * Is the cache_control in interview/index.ts doing anything at all?
 * -----------------------------------------------------------------------------
 *   export ANTHROPIC_API_KEY=sk-ant-...        (Terminal only)
 *   node tools/cache-probe.mjs
 *   node tools/cache-probe.mjs --model claude-sonnet-5
 *
 * The function marks its system prompt with cache_control and the comment says
 * to check usage.cache_read_input_tokens if you suspect it has stopped hitting.
 * Nobody has. This checks.
 *
 * Two things can be true and both are worth knowing:
 *
 *   1. The system prompt may be BELOW the minimum cacheable prefix. Minimums are
 *      model-dependent (roughly 512-4096 tokens). A prefix under the minimum is
 *      not cached and no error is raised — it simply never hits.
 *
 *   2. Even when it does hit, only the SYSTEM prompt is cached. The transcript
 *      is re-billed in full every turn, and it is the part that grows. The
 *      "Areas already touched" line sits BEFORE the transcript and changes every
 *      turn, so a breakpoint after the transcript could not help either — the
 *      varying line poisons the prefix behind it.
 *
 * It runs the same request three times: the first writes the cache, the second
 * and third should read it. Caching affects INPUT tokens only — output is billed
 * at full rate every time, which is why the split is printed.
 * =========================================================================== */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FN = path.join(here, "..", "supabase", "functions", "interview", "index.ts");

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY is not set. Export it in Terminal."); process.exit(2); }

const RATES = {
  "claude-opus-5":    { in: 5.00, out: 25.00, effort: "medium" },
  "claude-sonnet-5":  { in: 2.00, out: 10.00, effort: "medium" },
  "claude-haiku-4-5": { in: 1.00, out:  5.00, effort: null },
};
const i = process.argv.indexOf("--model");
const MODEL = i >= 0 ? process.argv[i + 1] : "claude-opus-5";
const R = RATES[MODEL];
if (!R) { console.error("Unknown model: " + MODEL); process.exit(2); }

const src = fs.readFileSync(FN, "utf8");
const SYSTEM = (src.match(/^const SYSTEM = `([\s\S]*?)`;$/m) || [])[1];
if (!SYSTEM) { console.error("Could not read SYSTEM from " + FN); process.exit(2); }

/* A transcript long enough to be representative of a real interview. */
const turns = Array.from({ length: 8 }, (_, n) => ({
  q: `Question ${n + 1} about the person who died, of the sort the guide produces.`,
  a: "She kept the creek in her pocket and never said why. Thirty-one years teaching third " +
     "grade at the same school, and she could name every child she ever taught, in order.",
}));
const user =
  `The family calls the person who died "Ruthie".\n\n` +
  `Areas already touched: childhood, work\nAreas available: childhood, sports, young_adult\n\n` +
  `The interview so far:\n\n` +
  turns.map((t) => `Q: ${t.q}\nA: ${t.a}`).join("\n\n") +
  `\n\nAsk the next question.`;

async function call() {
  const body = {
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };
  if (R.effort) body.output_config = { effort: R.effort };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).usage ?? {};
}

console.log(`Model: ${MODEL}`);
console.log(`System prompt: ${SYSTEM.length} chars (~${Math.round(SYSTEM.length / 3.8)} tokens estimated)\n`);

const runs = [];
for (let n = 0; n < 3; n++) {
  const u = await call();
  runs.push(u);
  const fresh  = u.input_tokens ?? 0;
  const write  = u.cache_creation_input_tokens ?? 0;
  const read   = u.cache_read_input_tokens ?? 0;
  const out    = u.output_tokens ?? 0;
  const cost   = (fresh + write) / 1e6 * R.in + read / 1e6 * R.in * 0.1 + out / 1e6 * R.out;
  console.log(`run ${n + 1}  fresh-in ${String(fresh).padStart(6)}  ` +
              `cache-write ${String(write).padStart(6)}  cache-read ${String(read).padStart(6)}  ` +
              `out ${String(out).padStart(5)}   $${cost.toFixed(4)}`);
}

const readsAfterFirst = runs.slice(1).reduce((a, u) => a + (u.cache_read_input_tokens ?? 0), 0);
const lastOut = runs.at(-1).output_tokens ?? 0;
const lastIn  = (runs.at(-1).input_tokens ?? 0) + (runs.at(-1).cache_read_input_tokens ?? 0);

console.log();
if (readsAfterFirst === 0) {
  console.log("THE CACHE IS NOT HITTING. cache_read_input_tokens is zero on repeat runs.");
  console.log("Most likely the system prompt is below this model's minimum cacheable prefix,");
  console.log("so the cache_control marker is silently doing nothing.");
} else {
  console.log(`The cache IS hitting — ${readsAfterFirst} tokens read across runs 2 and 3.`);
}

const inCost  = lastIn  / 1e6 * R.in;
const outCost = lastOut / 1e6 * R.out;
console.log(`\nWhere the money is on a warm run:  input $${inCost.toFixed(4)}  ` +
            `output $${outCost.toFixed(4)}  (${Math.round(outCost / (inCost + outCost) * 100)}% is output)`);
console.log("Caching can only ever touch the input side. Output is billed in full every time.");
