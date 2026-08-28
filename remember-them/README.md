# Remember Them

Part of the Healing Partners project. Memorial design software for independent funeral homes —
the family is interviewed about the person, the answers narrow the options, and three proofs come
out the other end.

**Show them. Don't ask them to imagine.**

## The flow

| Page | What happens |
|---|---|
| `intake.html` | Three pages. Who died; then the interview; then the family rates every answer 1–10 for how much it should shape the design. |
| `index.html` | Reads that record. Suggests design elements scored by the family's own ratings, compares the level ones side by side, and builds three proofs. |
| `designer.html` | Direct configurator, for when the design is already settled and someone just needs to draw it. |
| `thank-you.html` | After the order is placed. |

The intake hands over through `localStorage` under `rt.handoff.v1`, falling back to `sessionStorage`
when the store is blocked. **Nothing about the person goes in the query string** — a URL lands in
browser history on a shared machine, in proxy logs, and in the `Referer` header sent to third
parties, and a name plus a date of birth is a strong identity pair. The record is honoured for
twelve hours only: these machines sit on a shared front desk, and one family's interview must never
surface in the next family's session.

## The interview — page two

A biographer, not a form. The interview guide the product is built on is explicit about it: start
wide and unstructured, follow the energy, ask one question at a time, do not run a checklist. A
fixed column of questions cannot follow the energy — it asks about a marriage straight after being
told he never married.

So the next question comes from `supabase/functions/interview`, which has read what the family
actually said. It covers the same ground the spec calls for — stories across the life stages, then
habits, hobbies and talents, then ten words for their personality — but as a map of where the
conversation has been rather than a queue to work through. A life with no sport in it never gets
asked about sport.

Three things about that function are load-bearing:

- **It writes nothing down.** The transcript shapes one question and is gone. `classify-story`
  caches its tags because tags are not the story; a transcript *is* the story, and it stays in the
  browser where the family put it. Nothing here trains a model (Agreement §8.4, DPA D-11).
- **Only the familiar name and the transcript leave the browser** — never the full legal name, and
  emails, phone numbers, addresses and government identifiers are redacted before the call.
- **Every failure falls back to the fixed question set**, silently. Unconfigured, offline, timed
  out, unparseable — the family sees a real question and is never told the machine broke. This runs
  in an arrangement room with a family at the table.

The page is unconfigured by default; the project ref and session token do not belong in a public
repository. Wire it up once the Supabase client has a session:

```js
RememberThem.interview.configure({
  functionsUrl: SUPABASE_URL + "/functions/v1",
  getToken: function () { return session.access_token; }
});
```

Until that call is made the fixed questions carry the interview on their own, which is why the page
is worth demoing before any backend exists.

Tests are in `tests/` — see the README there.

## `catalogue.js` — what can be ordered

What is for sale, from whom, at what wholesale price, keyed by supplier. Affordable Family
Memorials is filled in from their *Wholesale Price Guide for 2025*: twenty granite colours across
four price categories, flat markers in nine sizes, bevels at 6" and 8", slants, ten die sizes with
the bases they sit on, benches, sixteen porcelain portraits, vases, final inscriptions, finish
codes and lead times.

The other five suppliers — Lundgren, OMS, Pacific Coast, Matthews and Monuments.com — are declared
as empty profiles listing exactly what is missing. That is deliberate: an empty profile makes the
gap visible, so the ask to each vendor is a list rather than a vague request.

`Catalogue.price()` returns wholesale and retail side by side, plus a `quotes` list for anything
with no published price. **Every number in the file is wholesale and none of it may be shown to a
family.** Retail is wholesale × the Partner's markup — 2.5 is the suggested figure, but Agreement
§6.8 makes retail the Partner's own decision, so it is a setting rather than a constant. Bench
installation is the one line passed through at cost with no markup at all.

Roughly half the product list — cast glass, glass art, granite and glass inlay, bronze, cremation
pedestals, statuary, custom shape work — has a vendor and no price sheet behind it. Those are
flagged for quote and are never estimated.

## `stone.js` — how it is drawn

The renderer both pages draw with. It models thickness, the polished-face/rock-pitched-side
contrast, and — the part that matters most — how lettering catches light in each material.
Sandblasting frosts the cut so it reads *paler* than the polish around it; cast bronze stands
proud and throws its shadow down-right; on white marble frosting gives no contrast at all, so the
cut reads as its own shadow.

It no longer owns the option list. Each catalogue colour names a *render family*, and stone.js
owns what that family looks like. Several real colours share one family — AFM sells four black
granites at four prices, and on a screen they are one dark polished rock. The commercial
distinction is real and lives in the catalogue; the renderer does not pretend to a precision it
does not have.

`preview.html` draws every shape against every render family, then prices every product, size and
category through `Catalogue.price()`. There is no test runner on this project, so that page is the
test: anything that throws lands in a red box, and a handful of figures are asserted against the
printed sheet so a silently-wrong total cannot pass as a right one. It is a working page, not part
of the customer flow.

## What a preview is not

A screen cannot reproduce stone, bronze, etching or polish. That difference is not a design error —
Partner User Agreement §3.8 — and every surface showing a design says so.

Healing Partners supplies designs, proofs and production files. It does not engrave, fabricate,
transport, set or sell physical memorials, and nothing in the interface should suggest otherwise.
