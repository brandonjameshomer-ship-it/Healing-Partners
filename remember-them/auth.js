/* =============================================================================
 * Signing a funeral director in, without a build step and without a CDN.
 * -----------------------------------------------------------------------------
 * The edge functions are deployed with verify_jwt = true, so `interview` and
 * `classify-story` need a real access token before they will answer. This is
 * the smallest honest way to get one.
 *
 * Why not @supabase/supabase-js: intake.html has no external references at all,
 * which is what lets it run from a USB stick on a machine with no network. A
 * CDN <script> would end that, and the library is ~40KB of features we do not
 * use. Supabase's auth endpoint is ordinary REST; the whole exchange is one
 * POST, and it is below.
 *
 * WHERE THE TOKEN LIVES — sessionStorage, deliberately, never localStorage.
 * These machines sit on a shared front desk. sessionStorage dies with the tab,
 * so the next family's session cannot inherit the last director's token by
 * mechanism rather than by policy. The cost is a sign-in after each restart,
 * which is the right trade in that room.
 *
 * The two values below are public. The project URL is public by definition and
 * the publishable key is a public identifier — row-level security is what
 * protects the data, not the secrecy of this string. The service-role key must
 * never appear in a page.
 * =========================================================================== */
window.RememberThem = window.RememberThem || {};

window.RememberThem.auth = (function () {
  "use strict";

  var URL_BASE = "https://zhtjgigkgpzrzeaqjwsv.supabase.co";
  var PUBLISHABLE = "sb_publishable_MeyfJR1u0XkHj3j9tQTJww_xFGtsclJ";
  var KEY = "rt.session.v1";

  /* ---- storage -------------------------------------------------------- */

  function read() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      /* A token past its life is worse than none: it produces a 401 the page
         then treats as an outage and hides. Drop it early instead. */
      if (!o || !o.access_token || !o.expires_at || Date.now() > o.expires_at) {
        clear();
        return null;
      }
      return o;
    } catch (e) { return null; }
  }

  function write(o) {
    try { sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  /* ---- the exchange --------------------------------------------------- */

  /* done(errorMessageOrNull). Never throws — the caller is a page with a
     family sitting in front of it. */
  function signIn(email, password, done) {
    var xhr = new XMLHttpRequest();
    var settled = false;
    function finish(err) { if (!settled) { settled = true; done(err); } }

    try {
      xhr.open("POST", URL_BASE + "/auth/v1/token?grant_type=password", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("apikey", PUBLISHABLE);
      xhr.timeout = 15000;

      xhr.onload = function () {
        var o = null;
        try { o = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && o && o.access_token) {
          write({
            access_token: o.access_token,
            email: (o.user && o.user.email) || email,
            /* 60s of margin so a token cannot expire mid-request. */
            expires_at: Date.now() + (((o.expires_in || 3600) - 60) * 1000)
          });
          finish(null);
          return;
        }
        /* Supabase distinguishes these; a director does not need to. Anything
           that is not "we could not reach it" reads the same way. */
        if (xhr.status === 400 || xhr.status === 401) {
          finish("That email and password did not match.");
        } else {
          finish("Could not reach the server. The interview will use its own questions.");
        }
      };
      xhr.onerror = function () { finish("Could not reach the server. The interview will use its own questions."); };
      xhr.ontimeout = function () { finish("The server did not answer. The interview will use its own questions."); };
      xhr.send(JSON.stringify({ email: String(email || ""), password: String(password || "") }));
    } catch (e) {
      finish("Could not sign in on this device.");
    }
  }

  function signOut() { clear(); }

  function token() { var s = read(); return s ? s.access_token : ""; }
  function email() { var s = read(); return s ? s.email : ""; }
  function signedIn() { return !!token(); }

  return {
    functionsUrl: URL_BASE + "/functions/v1",
    signIn: signIn,
    signOut: signOut,
    token: token,
    email: email,
    signedIn: signedIn
  };
})();
