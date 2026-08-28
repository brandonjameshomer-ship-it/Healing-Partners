import { JSDOM } from "jsdom";
import fs from "fs";
const html = fs.readFileSync(new URL("../intake.html", import.meta.url), "utf8");
let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };

// A stub standing in for the interview edge function. `mode` decides how it behaves.
function makeXHR(window, state) {
  return class {
    open(_m, url) { this.url = url; }
    setRequestHeader(k, v) { (this.h ||= {})[k] = v; }
    send(body) {
      state.sent.push({ url: this.url, headers: this.h, body: JSON.parse(body) });
      queueMicrotask(() => {
        if (state.mode === "error")   { this.onerror(); return; }
        if (state.mode === "timeout") { this.ontimeout(); return; }
        if (state.mode === "garbage") { this.status = 200; this.responseText = "<html>nope"; this.onload(); return; }
        this.status = 200;
        this.responseText = JSON.stringify(state.reply);
        this.onload();
      });
    }
  };
}

async function tick() { await new Promise(r => setTimeout(r, 0)); }

async function run(mode, reply) {
  const state = { mode, reply, sent: [] };
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/intake.html" });
  const { window } = dom;
  window.XMLHttpRequest = makeXHR(window, state);
  const doc = window.document, $ = id => doc.getElementById(id);
  const click = el => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };

  type($("f-first"), "Ruth Elaine Carver"); type($("f-known"), "Ruthie");
  window.RememberThem.interview.configure({
    functionsUrl: "https://ref.supabase.co/functions/v1/",
    getToken: () => "jwt-token-here"
  });
  click($("next"));
  await tick();
  return { doc, $, click, type, state, window };
}

console.log("\n--- live: the model's question is what the family sees ---");
{
  const r = await run("ok", {
    question: "What did Ruthie do the same way every single day?",
    why: "The small routine everyone could set a clock by.",
    placeholder: "Up at 4:30 no matter what…",
    area: "habits", label: "Habits", enough: false
  });
  ok(r.doc.querySelector("#askHost .q")?.textContent === "What did Ruthie do the same way every single day?",
     "the model's question is rendered");
  ok(r.doc.querySelector("#askHost .q-why")?.textContent.includes("set a clock by"), "the nudge is rendered");
  ok(r.$("answer").getAttribute("placeholder").includes("4:30"), "the placeholder sets the register");
  ok(r.doc.querySelector(".ask-cat")?.textContent === "Habits", "the area label shows");

  console.log("\n--- live: the request carries what it should, and nothing more ---");
  const req = r.state.sent[0];
  ok(req.url === "https://ref.supabase.co/functions/v1/interview", "trailing slash normalised");
  ok(req.headers.Authorization === "Bearer jwt-token-here", "the caller's own token is sent");
  ok(req.body.known === "Ruthie", "the name the family uses is sent");
  const keys = Object.keys(req.body).sort().join(",");
  ok(keys === "known,turns", "only known + turns leave the browser (got: " + keys + ")");
  ok(JSON.stringify(req.body).indexOf("Carver") === -1, "the full legal name is NOT sent");

  console.log("\n--- live: the transcript accumulates ---");
  r.type(r.$("answer"), "Up at 4:30, coffee, crossword, same chair.");
  r.click(r.$("ansNext"));
  await tick();
  const req2 = r.state.sent[1];
  ok(req2.body.turns.length === 1, "the previous turn is sent back for context");
  ok(req2.body.turns[0].area === "habits", "the area is carried so coverage is tracked");
}

console.log("\n--- live: 'enough' is a hint to the family, never a lock ---");
{
  const r = await run("ok", { question: "What would embarrass her to hear us say?", why: "", area: "talents", label: "Talents", enough: true });
  ok(r.$("answer") !== null, "the interview stays open");
  ok(r.doc.querySelector(".ask-hint")?.textContent.includes("enough here to design from"),
     "the family is told they can stop");
  ok(r.$("ansEnough") !== null, "stopping is still their choice");
}

console.log("\n--- the backend fails: the family must not notice ---");
for (const [mode, desc] of [["error","network error"],["timeout","timeout"],["garbage","unparseable response"]]) {
  const r = await run(mode, {});
  const q = r.doc.querySelector("#askHost .q");
  ok(q !== null, `${desc}: a question is still asked`);
  ok(r.$("answer") !== null, `${desc}: the family can still answer`);
  // Only what the family actually reads — body.textContent would include the
  // inline script source, comments and all.
  const visible = [...r.doc.querySelectorAll("#p2 p, #p2 button, #p2 .privacy")]
    .map(e => e.textContent).join(" ");
  ok(!visible.match(/error|failed|sorry|unavailable|try again|problem/i), `${desc}: no error text shown`);
}

console.log("\n" + (fail ? fail + " FAILING" : "all passing"));
process.exit(fail ? 1 : 0);
