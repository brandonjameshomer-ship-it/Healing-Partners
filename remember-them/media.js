/* Remember Them — file uploads.
 *
 * WHAT THIS TALKS TO
 *
 * The media-sign edge function, which mints a short-lived Cloudflare R2 URL
 * after checking the caller may touch that memorial. The bytes go from this
 * browser straight to R2 and never pass through our server: a 20MB scan of a
 * 1970s portrait would time out an edge function, and those are exactly the
 * photographs families care most about.
 *
 * Three steps, always in this order:
 *   1. ask for a URL   (records the intent, so nothing lands untracked)
 *   2. PUT to R2       (with progress, because this is the slow part)
 *   3. confirm         (the server measures what actually arrived)
 *
 * Step 3 is not bookkeeping. A presigned PUT carries no size limit of its own,
 * so the limit is enforced afterwards by asking R2 what it really stored. A
 * file that never gets confirmed stays invisible and gets swept up.
 *
 * No build step, no dependencies, ES5 — it has to run on a funeral director's
 * old laptop, same as stone.js.
 */
window.RememberThem = window.RememberThem || {};

(function (RT) {
  "use strict";

  var cfg = {
    functionsUrl: "",   /* https://<project-ref>.supabase.co/functions/v1 */
    getToken: null      /* function returning the signed-in user's access token */
  };

  /* Call once after the Supabase client has a session:
   *
   *   RememberThem.media.configure({
   *     functionsUrl: SUPABASE_URL + "/functions/v1",
   *     getToken: function () { return session.access_token; }
   *   });
   */
  function configure(o) {
    if (o.functionsUrl) cfg.functionsUrl = o.functionsUrl.replace(/\/+$/, "");
    if (o.getToken) cfg.getToken = o.getToken;
  }

  function ready() {
    return !!(cfg.functionsUrl && cfg.getToken && cfg.getToken());
  }

  /* ---- talking to the function ---------------------------------- */
  function call(body, done) {
    if (!ready()) { done(new Error("Sign in before adding photographs.")); return; }

    var xhr = new XMLHttpRequest();
    xhr.open("POST", cfg.functionsUrl + "/media-sign", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", "Bearer " + cfg.getToken());
    xhr.onload = function () {
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300) { done(null, data); return; }
      /* The function writes messages meant for a grieving family to read.
         Show its wording rather than a status code. */
      done(new Error((data && data.error) || "That didn't work. Try again."));
    };
    xhr.onerror = function () { done(new Error("No connection. Check the network and try again.")); };
    xhr.send(JSON.stringify(body));
  }

  /* ---- hashing ---------------------------------------------------
     Only for proofs and renders. Partner User Agreement 3.4 requires the file
     hash of the proof the family approved to sit on the approval record, so
     that one is worth reading a whole file into memory for. Family snapshots
     are not — a 40MB HEIC hashed on a Chromebook stalls the page for seconds
     and buys nothing.                                                   */
  function hashIfNeeded(file, kind, done) {
    var wants = (kind === "proof" || kind === "render");
    if (!wants || !window.crypto || !crypto.subtle || !FileReader) { done(null); return; }

    var reader = new FileReader();
    reader.onload = function () {
      crypto.subtle.digest("SHA-256", reader.result).then(function (buf) {
        var b = new Uint8Array(buf), out = "", i;
        for (i = 0; i < b.length; i++) out += (b[i] < 16 ? "0" : "") + b[i].toString(16);
        done(out);
      })["catch"](function () { done(null); });
    };
    reader.onerror = function () { done(null); };
    reader.readAsArrayBuffer(file);
  }

  /* ---- the upload ------------------------------------------------
   *
   *   RememberThem.media.upload(file, { memorialId: id, kind: "photo" }, {
   *     progress: function (pct) { bar.style.width = pct + "%"; },
   *     done: function (err, res) { ... }
   *   });
   */
  function upload(file, opts, cb) {
    cb = cb || {};
    var progress = cb.progress || function () {};
    var done = cb.done || function () {};

    if (!file) { done(new Error("No file chosen.")); return; }
    if (!opts || !opts.memorialId) { done(new Error("No memorial to attach this to.")); return; }

    var kind = opts.kind || "photo";

    call({
      action: "upload",
      memorial_id: opts.memorialId,
      design_id: opts.designId || null,
      filename: file.name,
      content_type: file.type,
      size: file.size,
      kind: kind
    }, function (err, grant) {
      if (err) { done(err); return; }

      var xhr = new XMLHttpRequest();
      xhr.open(grant.method || "PUT", grant.url, true);

      /* Exactly the headers the URL was signed for. R2 checks content-type
         against the signature, so anything else here is a 403 — which is the
         point: it is what stops a file declared as a JPEG being stored as
         something a browser would execute. */
      var h;
      for (h in grant.headers) {
        if (Object.prototype.hasOwnProperty.call(grant.headers, h)) {
          xhr.setRequestHeader(h, grant.headers[h]);
        }
      }

      /* XHR rather than fetch for exactly one reason: fetch cannot report
         upload progress, and on a funeral home's connection a 20MB portrait
         is thirty silent seconds. */
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          done(new Error("The photograph didn't finish uploading. Try again."));
          return;
        }
        progress(100);
        hashIfNeeded(file, kind, function (sha) {
          call({ action: "confirm", media_id: grant.media_id, sha256: sha }, function (cErr, res) {
            if (cErr) { done(cErr); return; }
            done(null, {
              mediaId: grant.media_id,
              bytes: res && res.byte_size,
              sha256: sha,
              name: file.name
            });
          });
        });
      };
      xhr.onerror = function () { done(new Error("The upload was interrupted. Try again.")); };
      xhr.send(file);
    });
  }

  /* ---- reading ----------------------------------------------------
     Signed URLs expire in about fifteen minutes, deliberately: they end up in
     <img src>, get pasted into group chats and forwarded in email, and a link
     to a grieving family's photograph should stop working quickly. Ask again
     rather than caching what comes back.

       RememberThem.media.urls([id1, id2], function (err, files) { ... });   */
  function urls(mediaIds, done) {
    var list = [].concat(mediaIds);
    if (!list.length) { done(null, []); return; }
    call({ action: "view", media_ids: list }, function (err, res) {
      if (err) { done(err); return; }
      done(null, (res && res.files) || []);
    });
  }

  /* Retire a family photograph. Proofs and renders cannot be retired — an
     approved proof is evidence, and no amount of tidying up should reach it. */
  function retire(mediaId, done) {
    call({ action: "retire", media_id: mediaId }, done || function () {});
  }

  RT.media = {
    configure: configure,
    ready: ready,
    upload: upload,
    urls: urls,
    retire: retire
  };
})(window.RememberThem);
