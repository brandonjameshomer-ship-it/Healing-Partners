/* The price engine, against the printed sheet and against itself.
 *
 * The figures below are the ones a person can look up in Affordable Family
 * Memorials' Wholesale Price Guide for 2025. preview.html carries the same
 * spot checks so the page shows a red box when it is opened; this file exists
 * so a regression is caught without anyone having to open it. The sheet is the
 * source of truth for both — if a number here and a number there disagree,
 * neither file is the authority. The paper is.
 *
 *   node remember-them/tests/catalogue.test.mjs
 */
import { JSDOM } from "jsdom";
import fs from "fs";
import { pathToFileURL } from "url";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const eq = (m, got, want) => ok(got === want, m + " (got " + got + ", expected " + want + ")");

const src = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const dom = new JSDOM("<!doctype html><html></html>", { runScripts: "outside-only" });
const { window } = dom;
window.eval(src("catalogue.js"));
const C = window.RememberThem.Catalogue;

console.log("\n--- against the AFM sheet ---");

/* 24x12 flat marker, Georgia Gray (Cat 1): 545 stone + 300 setting. */
const flat = C.price({ product: "flat", size: "24x12", colour: "georgia-gray", extras: ["install"] });
eq("flat 24x12 Cat 1 wholesale", flat.wholesale, 845);
eq("flat 24x12 Cat 1 retail at the suggested 2.5", flat.retail, Math.round(845 * 2.5));

/* 8in bevel, 24x12, Academy Black (Cat 2): 910 + 400 setting. */
eq("bevel8 24x12 Cat 2 wholesale",
   C.price({ product: "bevel8", size: "24x12", colour: "academy-black", extras: ["install"] }).wholesale,
   1310);

/* 24x6x24 die (Cat 2 = 1365) on the first base that fits: C, 30x12x6 at 585,
   whose setting is 620. */
const die = C.price({ product: "die", size: "24x6x24", colour: "academy-black" });
eq("die 24x6x24 Cat 2 + base + setting", die.wholesale, 1365 + 585 + 620);

/* A Cat 4 colour on the slant table reads the India column, because that table
   has no numbered 4th. The slant brings its own base (AA, 30x14x6, 1070 at
   Cat 4) but not its own setting. */
const slant = C.price({ product: "slant", size: "24x16", colour: "imperial-red" });
eq("slant 24x16 Cat 4 reads the India column", slant.lines[0].wholesale, 1560);
eq("slant carries a base but not the base setting", slant.wholesale, 1560 + 1070);
eq("slant priced as two lines, stone and base", slant.lines.length, 2);

/* Bench installation is passed through at cost: 2310x2.5 + 450. */
const bench = C.price({ product: "bench", size: "traditional", colour: "gray", extras: ["install"] });
eq("traditional bench wholesale", bench.wholesale, 2760);
eq("traditional bench retail, install at cost", bench.retail, Math.round(2310 * 2.5) + 450);

/* Oversize foundation adds 15% to the base setting and to nothing else. */
const over = C.price({ product: "die", size: "24x6x24", colour: "academy-black", oversizeFoundation: true });
eq("oversize foundation is 15% of the setting alone",
   over.wholesale - die.wholesale, Math.round(620 * 1.15) - 620);

console.log("\n--- what must never carry a price ---");

const quoted = C.price({ product: "flat", size: "24x12", colour: "missouri-red" });
ok(quoted.ok === false, "a quote-only colour is flagged, not priced");
ok(quoted.quotes.length > 0, "and it says what needs quoting");
eq("a quote-only colour totals nothing", quoted.wholesale, 0);

const nonsense = C.price({ product: "no-such-product", size: "24x12", colour: "georgia-gray" });
ok(nonsense.ok === false, "an unknown product returns not-ok rather than throwing");
eq("an unknown product totals nothing", nonsense.wholesale, 0);

console.log("\n--- a colour id the catalogue does not carry ---");

/* price() substitutes rather than refusing: an unrecognised colour falls back
   to the first in the list, and a bench asked for a granite colour falls back
   to Gray. The UI never offers a colour the product cannot take, so this is
   reachable only through a typo or a stale saved design — but when it happens
   the estimate must not claim a stone it did not price. That is what these
   check. Whether the substitution should instead be flagged for quote is an
   open question; if it changes, these two are the tests to change. */
const typo = C.price({ product: "flat", size: "24x12", colour: "not-a-colour" });
ok(typo.lines[0].label.includes(C.supplier().colours[0].label),
   "an unknown colour is priced as the substitute, and the line says which");
const benchInGranite = C.price({ product: "bench", size: "traditional", colour: "imperial-red" });
ok(!benchInGranite.lines[0].label.includes("Imperial Red"),
   "a bench never carries the label of a colour benches are not made in");

console.log("\n--- retail is the Partner's decision, not a constant (Agreement 6.8) ---");

const atCost = C.price({ product: "flat", size: "24x12", colour: "georgia-gray", extras: ["install"], markup: 1 });
eq("markup 1 makes retail equal wholesale", atCost.retail, atCost.wholesale);
ok(C.price({ product: "flat", size: "24x12", colour: "georgia-gray", markup: 3 }).retail >
   C.price({ product: "flat", size: "24x12", colour: "georgia-gray", markup: 2 }).retail,
   "a higher markup yields a higher retail");
eq("retail() rounds a single figure the same way", C.retail(545, "afm", 2.5), Math.round(545 * 2.5));

console.log("\n--- every orderable combination ---");

let priced = 0, quotedCount = 0, threw = null, negative = 0, underCost = 0;
for (const p of C.supplier().products) {
  for (const z of p.sizes) {
    for (const col of C.supplier().colours) {
      let r;
      try { r = C.price({ product: p.id, size: z.id, colour: col.id }); }
      catch (e) { threw = p.id + "/" + z.id + "/" + col.id + ": " + e.message; break; }
      if (!r.ok) { quotedCount++; continue; }
      priced++;
      if (r.wholesale <= 0) negative++;
      if (r.retail < r.wholesale) underCost++;
    }
  }
}
ok(threw === null, "nothing throws across the whole catalogue" + (threw ? " — " + threw : ""));
ok(priced > 0, priced + " combinations priced, " + quotedCount + " flagged for quote");
eq("no priced combination totals zero or less", negative, 0);
eq("no priced combination sells below wholesale", underCost, 0);
ok(C.combinationCount() > 0, "combinationCount() reports " + C.combinationCount() + " orderable combinations");

console.log("\n--- preview.html's own self-check ---");

const previewUrl = pathToFileURL(new URL("../preview.html", import.meta.url).pathname);
const page = await JSDOM.fromFile(previewUrl.pathname, {
  runScripts: "dangerously",
  resources: "usable",
  url: previewUrl.href
});
await new Promise((r) => page.window.addEventListener("load", r, { once: true }));
const verdict = page.window.document.getElementById("verdict");
ok(verdict !== null, "the page reports a verdict");
if (verdict) {
  ok(!verdict.className.includes("fail"), "preview.html agrees with the sheet");
  console.log("        " + verdict.textContent.trim().split("\n").join("\n        "));
}
page.window.close();

console.log(fail ? "\n" + fail + " FAILED\n" : "\nall good\n");
process.exit(fail ? 1 : 0);
