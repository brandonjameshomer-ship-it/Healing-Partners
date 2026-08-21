# Remember Them

Part of the Healing Partners project. Memorial design software for independent funeral homes —
the family is interviewed about the person, the answers narrow the options, and three proofs come
out the other end.

**Show them. Don't ask them to imagine.**

## The flow

| Page | What happens |
|---|---|
| `intake.html` | Three pages. Who died; then a biographer-style interview covering stories by life stage, habits, hobbies, talents and ten words for their personality; then the family rates every answer 1–10 for how much it should shape the design. |
| `index.html` | Reads that record. Suggests design elements scored by the family's own ratings, compares the level ones side by side, and builds three proofs. |
| `designer.html` | Direct configurator, for when the design is already settled and someone just needs to draw it. |
| `thank-you.html` | After the order is placed. |

The intake hands over through `localStorage` under `rt.handoff.v1`, with the name and dates also in
the query string so private browsing does not lose who this is. The record is honoured for twelve
hours only — these machines sit on a shared front desk, and one family's interview must never
surface in the next family's session.

## `stone.js`

The renderer both pages draw with. Shapes, granites, lettering and emblems live here too, so the
two pages cannot describe different catalogues.

It models thickness, the polished-face/rock-pitched-side contrast, and — the part that matters
most — how lettering catches light in each material. Sandblasting frosts the cut so it reads
*paler* than the polish around it; cast bronze stands proud and throws its shadow down-right; on
white marble frosting gives no contrast at all, so the cut reads as its own shadow.

`preview.html` renders every shape against every material for checking changes. It is a working
page, not part of the customer flow.

## What a preview is not

A screen cannot reproduce stone, bronze, etching or polish. That difference is not a design error —
Partner User Agreement §3.8 — and every surface showing a design says so.

Healing Partners supplies designs, proofs and production files. It does not engrave, fabricate,
transport, set or sell physical memorials, and nothing in the interface should suggest otherwise.
