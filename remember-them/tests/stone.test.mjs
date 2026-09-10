/* The renderer, and the contract between the catalogue and the renderer.
 *
 * stone.js draws; catalogue.js decides what can be ordered. The join between
 * them is one string: a catalogue colour names a render `family`. A typo there
 * is invisible in review and shows up as a stone drawn in the wrong rock, so
 * that join is checked here colour by colour.
 *
 *   node remember-them/tests/stone.test.mjs
 */
import { JSDOM } from "jsdom";
import fs from "fs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const eq = (m, got, want) => ok(got === want, m + " (got " + got + ", expected " + want + ")");

const src = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
const { window } = dom;
window.eval(src("catalogue.js"));
window.eval(src("stone.js"));
const S = window.RememberThem.Stone;
const C = window.RememberThem.Catalogue;

/* Parses the SVG the way a browser would, so a malformed string fails here
   rather than rendering as nothing on a family's screen. */
const parse = (svg) => {
  const d = new window.DOMParser().parseFromString(svg, "image/svg+xml");
  return { doc: d, bad: d.getElementsByTagName("parsererror").length > 0 };
};

console.log("\n--- every shape in every stone ---");

const families = Object.keys(S.FAMILIES);
let drawn = 0, malformed = [], noViewBox = [];
for (const f of S.FORMS) {
  for (const fam of families) {
    const st = S.byFamily(fam);
    const svg = S.render({ form: f.id, stone: st.id, name: "Ruth Elaine Carver", dates: "1931 – 2024" });
    const { doc, bad } = parse(svg);
    if (bad) { malformed.push(f.id + "/" + fam); continue; }
    if (!doc.documentElement.getAttribute("viewBox")) noViewBox.push(f.id + "/" + fam);
    drawn++;
  }
}
eq("no shape/stone pair renders malformed SVG", malformed.length, 0);
eq("every one carries a viewBox so it scales", noViewBox.length, 0);
ok(drawn === S.FORMS.length * families.length,
   drawn + " renders across " + S.FORMS.length + " shapes and " + families.length + " render families");

console.log("\n--- the catalogue/renderer join ---");

const orphans = C.supplier().colours.filter((c) => !S.FAMILIES[c.family]);
eq("every catalogue colour names a render family that exists", orphans.length, 0);
if (orphans.length) console.log("        orphaned: " + orphans.map((c) => c.id + " -> " + c.family).join(", "));

const benchOrphans = C.supplier().benchColours.filter((c) => !S.FAMILIES[c.family]);
eq("every bench colour does too", benchOrphans.length, 0);

/* byFamily() falls back to the first stone rather than returning nothing, so a
   family with no stone behind it comes back wearing the wrong one. */
const unbacked = families.filter((f) => S.byFamily(f).family !== f);
eq("every render family has a stone of its own behind it", unbacked.length, 0);
if (unbacked.length) console.log("        unbacked: " + unbacked.join(", "));

ok(C.supplier().lettering.every((l) => S.byId(S.LETTERING, l.id)),
   "every catalogue lettering style is one the renderer knows");

console.log("\n--- a family's own words ---");

const hostile = 'Ruth "Ruthie" <b>Carver</b> & Sons';
const svg = S.render({ form: "upright", stone: "academy-black", name: hostile,
                       dates: "1931 – 2024", epitaph: "She kept the <creek> in her pocket & never said why" });
const { doc, bad } = parse(svg);
ok(!bad, "a name full of markup still parses");
ok(svg.indexOf("<b>") === -1, "the markup in a name is escaped, not embedded");
eq("no element is smuggled in through the name", doc.getElementsByTagName("b").length, 0);
eq("nor through the epitaph", doc.getElementsByTagName("creek").length, 0);
ok(doc.documentElement.getAttribute("aria-label").indexOf("Ruthie") !== -1,
   "the name still reaches the accessible label");
ok(doc.documentElement.getAttribute("aria-label").indexOf("cannot show real stone") !== -1,
   "and the label says a screen is not the stone (Agreement 3.8)");

console.log("\n--- two stones on one page ---");

const a = S.render({ form: "upright", stone: "academy-black", name: "A" });
const b = S.render({ form: "upright", stone: "sierra-white", name: "B" });
const idsOf = (s) => (s.match(/id="[^"]+"/g) || []).map((x) => x.slice(4, -1));
const shared = idsOf(a).filter((id) => idsOf(b).indexOf(id) !== -1);
eq("two renders share no element ids", shared.length, 0);
ok(idsOf(a).length > 0, idsOf(a).length + " gradient and filter ids per stone, all of them unique");

console.log("\n--- polish over the lettering, only where the lettering is a mirror ---");

/* The count of spec fills is the tell: a matte cut leaves the sweep beneath it,
   cast bronze takes a second pass because its faces are polished metal. */
const specPasses = (s) => (s.match(/url\(#spec[^)]*\)/g) || []).length;
eq("sandblasted granite keeps the sweep under the cut",
   specPasses(S.render({ form: "upright", stone: "academy-black", name: "Ruth" })), 1);
eq("carved marble does too",
   specPasses(S.render({ form: "upright", stone: "marble", name: "Ruth" })), 1);
eq("cast bronze takes the sweep across its raised faces",
   specPasses(S.render({ form: "plaque", stone: "bronze", name: "Ruth" })), 2);
ok(!parse(S.render({ form: "plaque", stone: "bronze", name: "Ruth" })).bad,
   "and the second pass still parses");

console.log("\n--- wrapping an epitaph ---");

const line = "She kept the creek in her pocket and never once said why";
const wrapped = S.wrap(line, 20);
ok(wrapped.every((l) => l.length <= 20 || l.indexOf(" ") === -1),
   "no line runs past the width unless it is one long word");
eq("no word is lost in the wrap", wrapped.join(" ").split(/\s+/).length, line.split(/\s+/).length);
eq("an empty epitaph wraps to nothing", S.wrap("", 20).join(""), "");

console.log("\n--- the shape picker ---");

const badThumbs = S.FORMS.filter((f) => parse(S.thumb(f.id)).bad);
eq("every shape has a thumbnail that parses", badThumbs.length, 0);
ok(S.FORMS.every((f) => S.outline(f.id) && S.outline(f.id).length > 10),
   "every shape has a real outline path");

console.log("\n--- the renderer standing on its own ---");

const alone = new JSDOM("<!doctype html><html></html>", { runScripts: "outside-only" });
alone.window.eval(src("stone.js"));
const Solo = alone.window.RememberThem.Stone;
ok(Solo.LETTERING.length > 0, "stone.js loaded without the catalogue still has a lettering fallback");
ok(!parse(Solo.render({ form: "upright", name: "Ruth" })).bad,
   "and still draws — a page that forgets catalogue.js degrades, it does not break");

console.log(fail ? "\n" + fail + " FAILED\n" : "\nall good\n");
process.exit(fail ? 1 : 0);
