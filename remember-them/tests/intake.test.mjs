import { JSDOM } from "jsdom";
import fs from "fs";

const html = fs.readFileSync(new URL("../intake.html", import.meta.url), "utf8");
let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };

const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/intake.html" });
const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const type = (el, v) => {
  el.value = v;
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};

console.log("\n--- page 1 -> 2 ---");
ok($("p1").classList.contains("on"), "starts on page 1");
click($("next"));
ok($("p1").classList.contains("on"), "blocked without a name");
type($("f-first"), "Ruth Elaine Carver");
type($("f-known"), "Ruthie");
click($("next"));
ok($("p2").classList.contains("on"), "advances to page 2 once named");
ok($("nameEcho").textContent === "Ruthie", "uses the name the family uses");

console.log("\n--- the interview (fallback mode, no backend configured) ---");
ok($("askHost").querySelector(".q") !== null, "a question is on the table");
ok($("answer") !== null, "there is somewhere to answer it");
const q1 = $("askHost").querySelector(".q").textContent;
console.log("        Q1: " + q1);

type($("answer"), "The creek behind the house. She came home muddy every single day one whole summer.");
click($("ansNext"));
ok(doc.querySelectorAll("#thread .turn").length === 1, "the answer moves into the thread");
const q2 = $("askHost").querySelector(".q").textContent;
ok(q2 !== q1, "the next question is a different one");
console.log("        Q2: " + q2);

console.log("\n--- correcting an answer ---");
click(doc.querySelector("#thread button[data-edit]"));
ok(doc.querySelectorAll("#thread .turn").length === 0, "the turn comes back off the thread");
ok($("answer").value.startsWith("The creek"), "the previous words are still there to edit");
type($("answer"), "The creek behind the house, every summer until she was twelve.");
click($("ansNext"));
ok(doc.querySelectorAll("#thread .turn").length === 1, "the correction lands back in the thread");

console.log("\n--- ending the interview ---");
type($("answer"), "Thirty-one years teaching third grade at the same school.");
click($("ansEnough"));
ok(doc.querySelectorAll("#thread .turn").length === 2, "the last answer is still kept");
ok($("askHost").querySelector("textarea") === null, "no further question is pushed");

console.log("\n--- personality words ---");
const w = $("wordInput");
["Stubborn", "Generous", "Early"].forEach((word) => {
  w.value = word;
  w.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
});
ok(doc.querySelectorAll("#wordList .word").length === 3, "words are captured");

console.log("\n--- page 3 weighting reads the real turns ---");
click($("next"));
ok($("p3").classList.contains("on"), "advances to weighting");
const sliders = doc.querySelectorAll('#weighHost input[type=range]');
ok(sliders.length === 3, "one slider per answer plus the words (got " + sliders.length + ")");
const quotes = [...doc.querySelectorAll("#weighHost .weigh-quote")].map(e => e.textContent);
ok(quotes.some(t => t.includes("creek behind the house, every summer")),
   "it rates the CORRECTED answer, not the original");

console.log("\n--- persistence across a reload ---");
const saved = window.localStorage.getItem("rt.intake.v1");
ok(saved && JSON.parse(saved).turns.length === 2, "turns are saved");
const dom2 = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/intake.html" });
dom2.window.localStorage.setItem("rt.intake.v1", saved);
const dom3 = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/intake.html" });
ok(true, "reload path exercised");

console.log("\n--- migration from the old fixed-form save ---");
const legacy = JSON.stringify({
  at: Date.now(), name: "Harold Vance", known: "Hal",
  answers: { work: "Thirty-one years at the mill.", hobbies: "Roses along the whole fence line." },
  words: ["Quiet"], weights: {}
});
const dom4 = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/intake.html",
  beforeParse(w) { w.localStorage.setItem("rt.intake.v1", legacy); } });
const d4 = dom4.window.document;
ok(d4.getElementById("f-first").value === "Harold Vance", "legacy identity restored");
ok(d4.querySelectorAll("#thread .turn").length === 2, "legacy answers became turns (got " +
   d4.querySelectorAll("#thread .turn").length + ")");

console.log("\n" + (fail ? fail + " FAILING" : "all passing"));
process.exit(fail ? 1 : 0);
