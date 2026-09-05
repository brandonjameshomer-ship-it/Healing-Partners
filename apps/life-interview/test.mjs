/* The life interview, driven as a browser would drive it.
 *
 *   npm install jsdom      # not vendored; nothing here is served to anyone
 *   node apps/life-interview/test.mjs
 *
 * The page ships as one ES5 file with no build step so it runs from a USB
 * stick on whatever machine is to hand. The tests have no such constraint.
 */
import { JSDOM } from "jsdom";
import fs from "fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const eq = (m, got, want) => ok(got === want, m + " (got " + got + ", expected " + want + ")");

function open() {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/" });
  const { window } = dom, doc = window.document;
  const $ = (id) => doc.getElementById(id);
  return {
    window, doc, $,
    click: (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    type: (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); },
    store: () => JSON.parse(window.localStorage.getItem("life.interview.v1")),
  };
}

/* Answer straight through, steering only the questions named in `answers`. */
function runThrough(answers) {
  const t = open();
  t.click(t.$("s-me"));
  const asked = [];
  let guard = 0;
  while (t.$("answer") && guard++ < 40) {
    const q = t.$("askHost").querySelector(".q").textContent;
    asked.push(q);
    let a = "Something ordinary.";
    for (const k in answers) if (q.indexOf(k) !== -1) a = answers[k];
    t.type(t.$("answer"), a);
    t.click(t.$("next"));
  }
  return { t, asked };
}

console.log("\n--- who it is for decides the tense ---");
{
  const t = open();
  ok(t.$("askHost").textContent.indexOf("Who is this for?") !== -1,
     "it asks who the interview is for before anything else");
  t.click(t.$("s-me"));
  ok(t.$("askHost").querySelector(".q").textContent.indexOf("about you") !== -1,
     "a living person is asked in the present tense");

  const u = open();
  u.click(u.$("s-them"));
  ok(u.$("askHost").querySelector(".q").textContent.indexOf("about them") !== -1,
     "someone who has died is asked in the past");
}

console.log("\n--- words nobody can retype ---");
{
  const t = open();
  t.click(t.$("s-me"));
  t.type(t.$("answer"), "That I never once left a job half done.");
  ok(t.store().draft.indexOf("half done") !== -1,
     "an uncommitted answer is banked on every keystroke");
  ok(t.store().pendingId, "along with the question it belongs under");
  t.click(t.$("next"));
  ok(!t.store().draft, "and the draft is cleared once it is banked as a turn");
}

console.log("\n--- correcting an answer destroys nothing ---");
{
  const t = open();
  t.click(t.$("s-me"));
  t.type(t.$("answer"), "The first thing I said.");
  t.click(t.$("next"));
  t.click(t.doc.querySelector("#thread button[data-edit]"));
  eq("the turn stays in storage while it is corrected", t.store().turns.length, 1);
  eq("it is only lifted off the page", t.store().editing, 0);
  t.type(t.$("answer"), "The first thing I said, better.");
  t.click(t.$("next"));
  eq("the correction is written back in place", t.store().turns.length, 1);
  ok(t.store().turns[0].a.indexOf("better") !== -1, "with the new wording current");
  eq("and the wording it replaced is kept", t.store().turns[0].rev.length, 1);
}

console.log("\n--- what is not for the funeral ---");
{
  const { t } = runThrough({ "has not been said": "To my brother: I should have called." });
  const priv = t.store().turns.filter((x) => x.priv);
  eq("the private answer is marked private", priv.length, 1);
  ok(t.doc.querySelector(".turn.priv .tag") !== null, "and shown as kept apart in the thread");
  t.click(t.$("m-write"));
  t.click(t.$("pullIn"));
  ok(t.$("whole").value.indexOf("should have called") === -1,
     "it never flows into the long-form draft");
}

console.log("\n--- pulling answers in twice ---");
{
  const t = open();
  t.click(t.$("s-me"));
  t.type(t.$("answer"), "Answer one."); t.click(t.$("next"));
  t.type(t.$("answer"), "Answer two."); t.click(t.$("next"));
  t.click(t.$("m-write"));
  t.click(t.$("pullIn"));
  const once = t.$("whole").value;
  t.click(t.$("pullIn"));
  eq("a second click adds nothing", t.$("whole").value, once);
  eq("and nothing is duplicated", (once.match(/Answer one/g) || []).length, 1);
}

console.log("\n--- skipIf: a question the answers have made unkind ---");
{
  const r = runThrough({ "takes up your days":
    "I worked the mill. We had no children, it was just the two of us." });
  ok(!r.asked.some((q) => q.indexOf("came after you") !== -1),
     "the children question is not asked");
  ok(r.t.$("withheld").textContent.indexOf("there were no children") !== -1,
     "the reason is named rather than hidden");
  const btn = r.t.doc.querySelector('#withheld button[data-unskip="kids"]');
  ok(btn !== null, "and it can be asked anyway");
  r.t.click(btn);
  ok(r.t.$("askHost").querySelector(".q").textContent.indexOf("came after you") !== -1,
     "clicking that puts it back on the table");
}

console.log("\n--- skipIf: the veto, because withholding is the worse error ---");
{
  const r = runThrough({ "takes up your days":
    "We had no children of our own, but we adopted two." });
  ok(r.asked.some((q) => q.indexOf("came after you") !== -1),
     "\"adopted\" vetoes the skip and the question is still asked");

  const s = runThrough({ "should happen when you die":
    "No service in a church, but a gathering at the house." });
  ok(s.asked.some((q) => q.indexOf("should speak") !== -1),
     "\"but\" vetoes it too");
}

console.log("\n--- skipIf: no service means no questions about the service ---");
{
  const r = runThrough({ "should happen when you die":
    "No service, no fuss. Scatter me and go to the pub." });
  ok(!r.asked.some((q) => q.indexOf("music") !== -1),
     "music is not asked of someone who wants no service");
  ok(!r.asked.some((q) => q.indexOf("should speak") !== -1), "nor who should speak");
  ok(r.t.$("withheld").textContent.indexOf("no service") !== -1, "both are listed with the reason");
}

console.log("\n--- ordinary answers fire no rules ---");
{
  const r = runThrough({});
  eq("nothing is withheld", r.t.$("withheld").textContent.trim(), "");
  ok(r.asked.some((q) => q.indexOf("came after you") !== -1), "every question is asked");
  ok(r.asked.length >= 15, r.asked.length + " questions asked in a full pass");
}

console.log("\n--- taking something back means it is gone ---");
{
  const t = open();
  t.window.confirm = () => true;
  t.click(t.$("s-me"));
  t.type(t.$("answer"), "A thing about my son I should not have written.");
  t.click(t.$("next"));
  t.type(t.$("answer"), "Something I stand by.");
  t.click(t.$("next"));
  t.click(t.$("m-write"));
  t.click(t.$("pullIn"));
  ok(t.$("whole").value.indexOf("should not have written") !== -1,
     "the words reach the long-form draft when pulled in");
  t.click(t.$("m-ask"));
  t.click(t.doc.querySelectorAll("#thread button[data-take]")[0]);
  eq("the turn is removed", t.store().turns.length, 1);
  ok(JSON.stringify(t.store()).indexOf("should not have written") === -1,
     "and the words are nowhere in storage, including the long-form draft");
  ok(t.store().turns[0].a.indexOf("stand by") !== -1, "the other answer is untouched");
}

console.log("\n--- a correction is still recoverable, because that is the accident case ---");
{
  const t = open();
  t.window.confirm = () => true;
  t.click(t.$("s-me"));
  t.type(t.$("answer"), "First wording."); t.click(t.$("next"));
  t.click(t.doc.querySelector("#thread button[data-edit]"));
  t.type(t.$("answer"), "Second wording."); t.click(t.$("next"));
  eq("the replaced wording is kept as history", t.store().turns[0].rev.length, 1);
  ok(t.store().turns[0].rev[0].a.indexOf("First") !== -1, "with the original text");
}

console.log(fail ? "\n" + fail + " FAILED\n" : "\nall good\n");
process.exit(fail ? 1 : 0);
