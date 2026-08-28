# Tests

The pages ship as plain ES5 with no build step, because they have to run on a
funeral director's old laptop. The tests do not have that constraint — they run
on your machine, never on theirs — so they use Node and jsdom.

```
npm install jsdom          # not vendored; nothing here is served to a browser
node remember-them/tests/intake.test.mjs
node remember-them/tests/intake-live.test.mjs
```

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
