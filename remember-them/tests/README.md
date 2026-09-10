# Tests

The pages ship as plain ES5 with no build step, because they have to run on a
funeral director's old laptop. The tests do not have that constraint — they run
on your machine, never on theirs — so they use Node and jsdom.

```sh
npm install jsdom          # not vendored; nothing here is served to a browser
for t in remember-them/tests/*.test.mjs; do node "$t" || break; done
```

Each file runs on its own and exits non-zero on a failure, so any one of them
can be the thing a hook or a CI step runs.

`intake.test.mjs` drives the real page with no backend configured: the fallback
question set, correcting an answer, ending the interview, the 1–10 weighting
reading back the corrected text, and a save written by the old fixed-form
version still loading.

`intake-live.test.mjs` stubs the `interview` edge function and checks the live
path: that the model's question reaches the family intact, that **only** the
familiar name and the transcript leave the browser — never the full legal name —
and that a network error, a timeout and an unparseable response each fall back
to a real question with no error text shown. That last one is the point. This
runs in an arrangement room with a family at the table; an outage must never
end the conversation.

`catalogue.test.mjs` is the price engine. The spot checks at the top are figures
a person can look up in the AFM *Wholesale Price Guide for 2025* — a flat marker
in Category 1, the slant that reads the India column because its table has no
fourth, the bench whose installation is passed through at cost. Then it prices
every product against every size against every colour and insists that nothing
throws, nothing totals zero, and nothing comes out below wholesale. It finishes
by loading `preview.html` and reading the verdict off the page, so the in-page
self-check cannot quietly start failing while nobody has it open.

`stone.test.mjs` is the renderer and the seam it shares with the catalogue.
Every shape in every render family has to parse as SVG and carry a viewBox;
every catalogue colour has to name a render family that exists, which is a
one-word join that no amount of reading catches when it is wrong; two stones on
one page have to use different element ids or the second inherits the first's
gradients. It also puts a name full of angle brackets and ampersands through
`render()`, because the one thing on that screen that is not ours to control is
what a family types about the person who died.

Neither of these needs a backend, a key or a network.
