/* Does healingpartners.us still say what this folder says?
 *
 *   curl -s https://healingpartners.us/pages/for-funeral-homes > /tmp/live.html
 *   node shopify/check-drift.js [/tmp/live.html]
 *
 * The store is only updated by hand, so this folder can be right while the
 * page a funeral home reads is wrong. That has happened once already — see
 * the drift section in README.md. Exits non-zero when they disagree, so it
 * can be a CI step or a git hook.
 *
 * Entities are decoded before comparing. Without that, every &mdash; and
 * &ndash; reads as a difference and the real ones are lost in the noise.
 */
const fs = require("fs");

const ENTS = {
  amp:"&", lt:"<", gt:">", quot:'"', apos:"'", nbsp:" ", mdash:"—", ndash:"–",
  trade:"™", darr:"↓", uarr:"↑", nearr:"↗", middot:"·", rsquo:"’", lsquo:"‘",
  ldquo:"“", rdquo:"”", hellip:"…", times:"×", prime:"′", Prime:"″",
  deg:"°", reg:"®", copy:"©", pound:"£", euro:"€"
};

const decode = (s) =>
  s.replace(/&([a-zA-Z]+);/g, (m, n) => (ENTS[n] !== undefined ? ENTS[n] : m))
   .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d));

/* Typographic variants that carry no meaning and would otherwise be reported
   as drift every single run. A checker that cries wolf gets ignored, and an
   ignored check is worse than no check. */
const normalise = (s) =>
  s.replace(/\u2011/g, "-")   // non-breaking hyphen
   .replace(/\u00a0/g, " ")   // non-breaking space
   .replace(/\u2212/g, "-")   // minus sign
   .replace(/[\u2018\u2019]/g, "'")
   .replace(/[\u201c\u201d]/g, '"');

const visible = (html) =>
  normalise(decode(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
  )).replace(/\s+/g, " ").trim();

const livePath = process.argv[2] || "/tmp/live.html";
if (!fs.existsSync(livePath)) {
  console.error("No live page at " + livePath + ".\n" +
    "  curl -s https://healingpartners.us/pages/for-funeral-homes > " + livePath);
  process.exit(2);
}

const here = visible(fs.readFileSync(__dirname + "/for-funeral-homes.body.html", "utf8"));
const live = visible(fs.readFileSync(livePath, "utf8"));

/* Sentence by sentence, ignoring fragments too short to be meaningful. */
const sentences = here.split(/(?<=[.!?]) /).map((s) => s.trim()).filter((s) => s.length > 40);
const missing = sentences.filter((s) => !live.includes(s));

console.log("checked " + sentences.length + " sentences from this folder against the live page");

if (!missing.length) {
  console.log("\nno drift — the store says what this folder says");
  process.exit(0);
}

console.log("\n" + missing.length + " not found on the live page:\n");
missing.forEach((s) => console.log("  " + s.slice(0, 220) + (s.length > 220 ? "…" : "") + "\n"));
console.log("Either the page has not been pushed since this folder changed, or somebody edited");
console.log("it in the Shopify page editor. See 'How to push' in README.md.");
process.exit(1);
