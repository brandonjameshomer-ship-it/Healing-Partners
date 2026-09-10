/* Signing in, and what it does and does not change.
 *
 *   node remember-them/tests/auth.test.mjs
 *
 * The page must behave identically when nobody is signed in — that is the
 * whole fallback contract — so most of what follows checks that adding auth
 * took nothing away.
 */
import { JSDOM, ResourceLoader } from "jsdom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const intake = path.join(here, "..", "intake.html");

let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) fail++; };
const eq = (m, got, want) => ok(got === want, m + " (got " + got + ", expected " + want + ")");

/* The document needs an https origin, because jsdom gives a file:// page an
   opaque origin and then sessionStorage does not exist — which is the very
   thing under test. So: https URL for storage, and a loader that serves the
   page's own auth.js from disk rather than the network. Nothing is fetched. */
class LocalLoader extends ResourceLoader {
  fetch(url, opts) {
    if (url.endsWith("/auth.js")) {
      return Promise.resolve(Buffer.from(fs.readFileSync(path.join(here, "..", "auth.js"))));
    }
    return null;   // refuse everything else
  }
}

async function open(seedSession) {
  const dom = new JSDOM(fs.readFileSync(intake, "utf8"), {
    runScripts: "dangerously",
    resources: new LocalLoader(),
    url: "https://healingpartners.us/remember-them/intake.html",
    beforeParse(w) {
      if (seedSession) {
        try { w.sessionStorage.setItem("rt.session.v1", JSON.stringify(seedSession)); } catch (e) {}
      }
      /* Nothing in a test may reach the network. */
      w.XMLHttpRequest = class {
        constructor() { this.sent = null; this.headers = {}; }
        open(m, u) { this.method = m; this.url = u; }
        setRequestHeader(k, v) { this.headers[k] = v; }
        send(b) { this.sent = b; open.lastRequest = this; }
      };
    },
  });
  await new Promise((r) => dom.window.addEventListener("load", r, { once: true }));
  return dom;
}

console.log("\n--- auth.js loads and exposes what the page needs ---");
{
  const dom = await open(null);
  const A = dom.window.RememberThem && dom.window.RememberThem.auth;
  ok(!!A, "window.RememberThem.auth exists");
  ok(typeof A.signIn === "function", "signIn is callable");
  ok(A.functionsUrl.endsWith("/functions/v1"), "functionsUrl points at the edge functions");
  eq("nobody is signed in by default", A.signedIn(), false);
  eq("and no token is offered", A.token(), "");
  dom.window.close();
}

console.log("\n--- signed out, the page behaves exactly as before ---");
{
  const dom = await open(null);
  const doc = dom.window.document;
  const q = doc.querySelector("#askHost .q");
  ok(doc.querySelector("#signinToggle") !== null, "the sign-in control is present");
  eq("the sign-in panel starts closed", doc.querySelector("#signinPanel").hidden, true);
  ok(doc.querySelector("#p1").classList.contains("on"), "the interview still starts on page 1");
  dom.window.close();
}

console.log("\n--- a stored session configures the interview ---");
{
  const dom = await open({
    access_token: "test-token-abc",
    email: "director@example.test",
    expires_at: Date.now() + 3600e3,
  });
  const A = dom.window.RememberThem.auth;
  eq("the session is recognised", A.signedIn(), true);
  eq("and the token is returned", A.token(), "test-token-abc");
  ok(dom.window.document.querySelector("#signinToggle").textContent.includes("director@example.test"),
     "the masthead shows who is signed in");
  ok(dom.window.document.querySelector("#si-out").hidden === false, "and offers a way out");
  dom.window.close();
}

console.log("\n--- an expired session is dropped rather than used ---");
{
  const dom = await open({
    access_token: "stale-token",
    email: "old@example.test",
    expires_at: Date.now() - 1000,
  });
  const A = dom.window.RememberThem.auth;
  eq("an expired token is not offered", A.token(), "");
  eq("and is cleared from storage", dom.window.sessionStorage.getItem("rt.session.v1"), null);
  dom.window.close();
}

console.log("\n--- the token never touches localStorage ---");
{
  const dom = await open({
    access_token: "secret-token-xyz",
    email: "d@example.test",
    expires_at: Date.now() + 3600e3,
  });
  const ls = JSON.stringify(Object.entries({ ...dom.window.localStorage }));
  ok(ls.indexOf("secret-token-xyz") === -1,
     "no access token in localStorage — it must die with the tab on a shared desk");
  ok(dom.window.sessionStorage.getItem("rt.session.v1").indexOf("secret-token-xyz") !== -1,
     "it lives in sessionStorage instead");
  dom.window.close();
}

console.log("\n--- the sign-in request is shaped correctly ---");
{
  const dom = await open(null);
  const doc = dom.window.document;
  doc.querySelector("#si-email").value = "director@example.test";
  doc.querySelector("#si-pass").value = "hunter2";
  doc.querySelector("#signinForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  const r = open.lastRequest;
  ok(!!r, "a request was made");
  ok(r.url.includes("/auth/v1/token?grant_type=password"), "to the password grant endpoint");
  ok(!!r.headers.apikey, "with the publishable key as apikey");
  ok(r.headers.apikey.startsWith("sb_publishable_"), "and it is a publishable key, not a secret");
  const body = JSON.parse(r.sent);
  eq("carrying the email", body.email, "director@example.test");
  ok(!r.url.includes("hunter2") && !JSON.stringify(r.headers).includes("hunter2"),
     "and the password only in the body, never in the URL or a header");
  dom.window.close();
}

console.log("\n--- the page still loads nothing from the network ---");
{
  const html = fs.readFileSync(intake, "utf8");
  const external = (html.match(/(?:src|rel="stylesheet"[^>]*href)="https?:\/\/[^"]*"/g) || []);
  eq("no external scripts or stylesheets", external.length, 0);
  const scripts = (html.match(/<script src="[^"]*"/g) || []);
  ok(scripts.every((s) => !s.includes("//")), "every script it loads is a local file: " + scripts.join(", "));
}

console.log(fail ? "\n" + fail + " FAILED\n" : "\nall good\n");
process.exit(fail ? 1 : 0);
