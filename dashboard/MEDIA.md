# Where photographs and proofs are stored

Everything here happens in your browser. Nothing to install on the Chromebook.

Budget about **30 minutes**. R2's free tier covers 10GB of storage and, unlike everyone else,
charges **nothing for downloads** — which matters, because the same portrait gets loaded every
time a family opens the designer.

---

## Why not just use Supabase

Supabase holds the *record* of a file. R2 holds the file.

A photograph of someone's mother is 4–20MB, a scanned portrait more, and a funeral home will
upload dozens per memorial. Supabase's free tier gives you 1GB total and caps a single file at
50MB — that runs out in a fortnight, and every database backup gets enormous along the way.

So a row in `memorial_media` stores a *key* like `memorials/9f1…/photo/6a2….jpg`, and the bytes
sit in R2. The database never touches an image.

---

## Step 1 — Turn on R2

1. Sign in at **dash.cloudflare.com**.
2. Click **R2** in the sidebar and enable it. It asks for a card even on the free tier — that is
   normal, it is there for overage, not a charge.
3. **Create bucket**, name it `remember-them-media`, location **Automatic**, and leave it
   **private**. Do not enable the public `r2.dev` URL. Nothing in this bucket should be readable
   without a signed link.

## Step 2 — Collect four values

| Value | Where |
|---|---|
| **Account ID** | R2 overview page, right-hand side |
| **Access Key ID** | R2 → **Manage API Tokens** → **Create API token** |
| **Secret Access Key** | Shown **once**, on the same screen — copy it now |
| **Bucket name** | `remember-them-media` |

When creating the token, set permission to **Object Read & Write** and scope it to that one bucket.
A token that can reach every bucket in the account is a token that can delete every family's
photographs.

## Step 3 — Let the browser upload directly

R2 refuses cross-origin uploads until you say which sites may make them. In the bucket, open
**Settings → CORS Policy** and paste:

```json
[
  {
    "AllowedOrigins": [
      "https://healingpartners.us",
      "https://brandonjameshomer-ship-it.github.io"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add any other domain the designer is served from. Leave it off `*` — that would let any website
on the internet use a leaked upload URL.

## Step 4 — Give the keys to Supabase, not to the page

The secret key must never appear in HTML or JavaScript. It goes to the edge function as a secret:

```
supabase secrets set \
  R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=remember-them-media \
  ALLOWED_ORIGINS=https://healingpartners.us
```

Then deploy:

```
supabase functions deploy media-sign
```

Leave JWT verification on (the default). The function checks who is asking before it signs
anything.

## Step 5 — Create the table

`supabase/migrations/0004_memorial_media.sql`, applied the same way as the others — see
`supabase/migrations/README.md`. It needs `schema.sql`, `access.sql` and `0002_proof_approvals.sql`
to have run first.

## Step 6 — Wire up a page

```html
<script src="media.js"></script>
<script>
  RememberThem.media.configure({
    functionsUrl: SUPABASE_URL + "/functions/v1",
    getToken: function () { return session.access_token; }
  });

  RememberThem.media.upload(fileInput.files[0], { memorialId: id }, {
    progress: function (pct) { bar.style.width = pct + "%"; },
    done: function (err, res) {
      if (err) { showMessage(err.message); return; }
      RememberThem.media.urls(res.mediaId, function (e, files) {
        img.src = files[0].url;
      });
    }
  });
</script>
```

---

## How a file actually gets in

1. The browser tells `media-sign` the memorial, the file type and the size.
2. The function checks `can_see_memorial()` **as the person asking** — it holds no database
   privilege of its own — writes a `pending` row, and signs a URL good for five minutes.
3. The browser uploads straight to R2.
4. The browser calls `confirm`. The function asks R2 how big the file really is and only then
   marks it `stored`.

Step 4 is the one that looks skippable and is not. A presigned upload URL cannot carry a size
limit, so someone could declare 2MB and send 2GB. The limit is enforced by measuring afterwards.
Anything never confirmed stays invisible and gets swept up by `media_due_for_deletion()`.

## What is deliberately restricted

- **The bucket is private.** Every read is a signed URL that expires in about 15 minutes. Those
  links get pasted into group chats and forwarded in email, and a link to a grieving family's
  photograph should stop working quickly.
- **Only JPEG, PNG, WebP, HEIC, HEIF, TIFF, SVG and PDF.** The content type is folded into the
  signature, so a file declared as a JPEG cannot be stored as something a browser would run.
- **Object keys are random.** Never `margaret-hospice-2019.jpg` — keys appear in logs and URLs,
  and a filename says more about a real person than it should.
- **Nothing is ever hard-deleted.** Retiring a photograph sets a flag. Proofs and renders cannot
  be retired at all: under Partner User Agreement §3.4 the approved proof and its file hash are
  the record of what the family agreed to, and no tidying-up should be able to reach it.

## Costs

10GB stored and 1,000,000 writes a month are free. Past that, storage is about $0.015/GB/month
and downloads stay free. A funeral home doing 20 memorials a month with ten photographs each
uses roughly 2GB a year.
