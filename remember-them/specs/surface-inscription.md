# Surface and Inscription — how a proof gets made

The procedurally drawn stone was judged underwhelming after a substantial realism pass, and that
verdict was about the approach rather than the execution (`docs/photo-library.md`). It matters more
than an ordinary polish note, because the promise is **"Show them. Don't ask them to imagine."**
A preview that reads as an icon fails the pitch however correct its geometry is.

`audio-to-memorial.md` §4–5 sets the direction: retrieve a real photograph, composite the real
inscription onto it. *The stone is a photograph and the lettering is a specification. Neither is
invented.* This document is the interface that makes that buildable, and the order it gets built in.

---

## 1 · The split

Two models, one narrow contract.

**SURFACE** owns the rock. It publishes four things and nothing else:

| Field | What it is |
|---|---|
| `pixels` | A photograph, or a procedural drawing filled with photographic granite. The only thing carrying realism. |
| `quad` | Four points bounding a **blank** region of the stone face. |
| `light` | `{x, y}` direction and an ambient term, in screen space. |
| `material` | A catalogue colour id, resolved to a render family: `{engrave, frost, cut, lip, polish}`. |

**INSCRIPTION** owns what is cut. It consumes those four and publishes one thing:

```
layout = [ { text | glyph, x_in, y_in, cap_in, alphabet,
             depth_in, technique, depth_source }, … ]
```

`depth_in` is **per entry**, not per design, and `technique` is an enum — `sandblast`, `v-sunk`,
`frosted-panel`, `raised-bronze`. `depth_source` is `supplier-table` or `default`. Shaped this way now
because if AFM comes back saying depth varies by alphabet, the only change is that `depth_in` is
populated from an `alphabet × technique → depth_in` table instead of a per-technique constant, and
the schema does not move. On screen, shadow offset is `depth_in × tan(light elevation)` and frost
strength is unchanged. There is still no per-alphabet stroke profile, because a profile difference
*is* a technique, and technique is already an enum.

In inches, at true scale, in the supplier's real alphabet, computed before any pixels exist.

Everything else is a **view** of that layout: the composite is the layout projected through the quad
and shaded by the material; the dimensioned sheet is the layout drawn flat; the order form is the
layout in a supplier's vocabulary. One object, three renderings. Today the SVG *is* the design,
which is exactly why it can be beautiful and unmanufacturable at the same time.

### Why each field is in the contract

**`light` is explicit because a shadow cannot be assumed.** `stone.js` hardcodes the offsets
`dx="0.9" dy="1.4"`, quietly encoding light from the upper left. Composite that onto a photograph
lit from the right and every letter reads as a sticker.

**`material` is declared, never sampled.** A blank stone has no cut to read `frost` from, so the
material comes from the catalogue rather than the photograph. `photo-library.md` already refuses to
guess it — *"a wrong colour name is worse than an empty cell"* — and this is why that refusal
matters at render time and not only at ordering time.

**Scale is not a field.** It is an exact match on `size_id`, which means a tape at the shoot. See §5.

**The quad must be blank**, which for the shoot described in §5 is the entire face.

### Glyph outlines, not font stacks

`LETTERING` currently holds CSS fallback stacks. On a director's laptop without Iowan Old Style the
name sets ~6% wider and the layout, the composite, the sheet and the order form silently disagree.
Each supplier alphabet becomes a JSON of per-glyph SVG paths and advance widths, converted once from
the manufacturer's chart. Measurement is then arithmetic — identical offline, identical on every
machine, no `measureText`.

### Projection

Neither SVG nor Canvas 2D can apply a perspective transform, and subdividing into strips on a slow
laptop GPU is not worth it. Gate instead: a quad is usable only if opposite edges agree within 5%,
which is the measurable form of "shot straight on". One affine map then takes inch-space to the quad.
Off-angle photographs are never composited.

---

## 2 · What ships first

**v1 is the procedural stone filled with real photographic granite**, sampled per colour from
`photo-library/material-crops/` — the only part of the library that may be committed. Uniform across
all twenty colours. The family sees their own words, at true scale, in their colour, within seconds.

**v2 is the photograph path**, filling colour-and-size cells behind an optional
*"See a photograph of this granite"*, changing nothing about the layout, the sheet or the order form.

This ordering is not a compromise between fidelity and effort. Even coverage at lower fidelity beats
uneven coverage at high fidelity, because families talk to each other in the same building. A product
where one family's granite has a photograph and another's does not is a product with two tiers of
truth in it.

### The promise changes with it

We stop describing this as software that shows real stone. **The drawn stone is the baseline for
every family. A photograph is an addition that some colours have today and more will have later.**

### The reveal moves; the choice does not

Colour is chosen first, as now. The family then sees **their own words on the drawn stone, in their
colour, immediately** — the main event, identical for all twenty colours. The photograph, where one
exists, appears afterwards and on request. Two days after a death the first image should be the
name, not a stranger's stone, and no family should discover theirs is the colour without.

---

## 3 · Coverage may never steer

Photograph coverage is not an input to anything the family sees before they have chosen.

**Forbidden in code.** Coverage may not sort, rank, filter, default, preselect, badge, hide behind
"more colours", grey out, or annotate the colour list. No "photo available" facet or toggle. No
"popular", "recommended" or "most requested" label derived from it. No reordering of `COLOURS` for
any reason — the supplier sheet's order is the order.

Coverage may be read **only after** a colour is chosen, and only to decide whether the optional
photograph appears.

The reason is specific to this catalogue: colour *is* a price category here, Cat 1 through 4 plus
quote-only. A coverage-shaped list is therefore a price-shaped list, and steering a grieving family
toward the granite we happen to photograph well is a commercial claim we could not defend to a
regulator or to a widow.

---

## 4 · Exhibit C — what is approved and what is hashed

The family approves **the flat dimensioned sheet**, shown beside the composite. Checking punctuation
on a textured photograph at an angle, at a dim table, in reading glasses, is a usability failure
before it is an honesty one. The sheet is black on white, at true scale, and it is the manufacturing
authority.

Three hashes and a root:

| Hash | Over | Proves |
|---|---|---|
| `H_layout` | Canonical layout JSON — inches, alphabet ids, `size_id`, colour id, motif vector ids | The views are one object |
| `H_sheet` | The sheet's **SVG source**, not a raster | The manufacturing authority, deterministically |
| `H_composite` | The in-room PNG bytes, plus `photo_id` and any redaction record | What was actually shown |

`root = sha256(H_layout ‖ H_sheet ‖ H_composite ‖ renderer_version)`, and the family signs the root.
The sheet is hashed as source because canvas output is not bit-deterministic across GPUs, and a
server re-render would hash differently from the bytes the family saw.

---

## 5 · The shoot

**Photograph a monument dealer's yard or the supplier's own stock, not a cemetery.**

Uncut blanks standing on their bases, every catalogue size, tape-measured. Estimated scope: black and
gray across 10 die sizes, 9 flats, 4 bevels and 2 slants — 50 cells at 4 frames each, roughly **200
photographs over two or three days**. Carry a tape, a laser distance meter, a grey card, a tripod, a
~50mm-equivalent lens, a clinometer, a scrim, and a per-frame log of `size_id`, `base_id`, family and
light.

What this dissolves, rather than solves: no stranger's memorial, so no redaction and no sentence
about painting out another family's name; the whole face is blank, so the quad rule is trivially
satisfied; no `companion-uncut` scarcity; no risk of two families in one town being shown the same
stone; and exact tape-measured sizes.

### Composition, for the photographer

Outdoors on ground — never a floor, never against a wall. Stone on its base, foot at ground level,
the shadow at the foot kept. Camera at standing eye height, straight on, opposite edges within 5%.
The stone fills about 70% of a portrait frame, even side margins, headroom above the top. Six to
twelve inches of ground in the foreground. Background at least thirty feet back and thrown soft, with
no legible second stone. Horizon out of frame or high and soft; no sky in frame, which also removes
the reflection that defeats any later fill.

**Nothing in frame that says inventory:** no pallets, racks, forklifts, chain link, banding, shrink
wrap, chalk marks, stickers, price tags, hoses, or other blanks in a row. The tape and the scale card
belong in a separate calibration frame, never in the delivered one.

### Flats need their own day

A flat marker standing upright on gravel is not a picture of a flat marker — it is a picture of a
small upright, and the thing families most often misjudge about flats is exactly what the yard frame
hides: how little of it you see, how the lawn crowds the edges, how the letters read at a glancing
angle. The renderer's compression is honest geometry, but a photograph that contradicts it is worse
than no photograph, because it out-argues the drawing.

So flats get one extra day, shot in grass from standing height at the angle a person actually stands.
Until that day happens, **no yard photograph of a flat ships**, and flats show the drawn stone only.
This is a v2 correctness problem rather than a v1 one: in v1 the crop is an albedo fill, the light
comes from `light`, and the squash applies to fill and lettering together. In v2 a lying polished flat
mirrors the sky and reads lighter and cooler than any vertical face, which compressing an upright
photograph cannot produce.

### Light

Overcast or scrim. The gate is **not** "even flat light" — flat light *undersells*, because frost
loses contrast and polish loses depth, and the family then sees a duller stone than they will
receive. The enemy is direct sun, and it is measurable: no specular hotspot on the face, shadow ratio
below threshold, grey-card white balance at the shoot. Open shade passes. Golden hour fails on colour
temperature.

---

## 6 · Material crops

v1's entire realism claim rests on `photo-library/material-crops/`, which is empty. This is what has
to go in it.

**One crop per render family, colour-shifted per catalogue colour.** The render family is already
this product's unit of screen truth — `stone.js` collapses four black granites on the stated grounds
that on a screen they are one dark polished rock. Texture is not identity; identity is the granite's
name and price on the dimensioned sheet, which is what is being ordered.

Four conditions, all binding:

1. Shift **within** a family only. Never tint a gray crop to stand in for rose — every family needs
   its own real source.
2. The source must be an actual stone of that family, at correct figure scale, large enough that no
   repeat is visible at preview size.
3. **Rainbow is excluded from colour-shifting** and takes a real full-face crop of its own — no
   mirror-tiling, no visible repeat at preview size — captioned every time it renders rather than on
   hover. If no such crop exists it stays procedural with the same caption rather than borrowing
   another family's pixels. Three crops, as for every family: more do not buy honesty, because the
   family's slab will differ from any crop we hold. The caption carries the claim, not the count.
4. The word **"photograph" never attaches to a crop** — not in copy, not in alt text, not in the
   director's mouth. That word is reserved for the yard photographs of §5.

### What a crop is

A whole polished face, not a swatch. The polished face of a **labelled** blank — the colour must be
known, not judged, so yard stock or a dealer's sample board rather than a cemetery guess. Camera
square within 5°, overcast or open shade with no hotspot, grey card in frame, sRGB, no sharpening, at
least 25 px/inch — a 48×32″ face lands at **1200×800**. Offline: rectify, remove the shoot's
illumination gradient, crop the card and the edges away.

**Estimate that gradient from the grey card plus a planar or quadratic fit across the frame, never
from the pixels themselves.** Dividing by a large-radius luminance blur is the obvious method and it
destroys figured stone: on Rainbow the veins *are* the low frequencies, so the blur removes the very
thing the crop exists to show. The grey-card fit is correct for every family and merely unavoidable
for this one.

Frost sampling is unchanged — frost is the same stone, lighter — but its blur radius must be at least
one cap height, so a single letter cannot straddle two tones. Legibility over Rainbow's dark veins is
genuinely poor on real stone; render it truthfully and let the dimensioned sheet be the legibility
check.

The face must be **polished when shot**. Polish is two separate things: the specular sweep is
render-time and `stone.js` already draws it, but the wet crystal contrast and saturation are baked
into the grain and cannot be added afterwards.

**No tiling.** One 1200×800 crop covers every catalogue face — the largest are a 48×28 die and a
48×18 flat — at 25 px/inch, downsampled about 2× at render size. Mirror-tiling is acceptable only for
a sample-board source, and the caption then has to say the granite was sampled rather than shot
whole. Offset-tiling is rejected outright: mottling repeats read at any scale.

### Delivery, and why it is not image files

Data URIs in one JS file per family, loaded on demand. This is not a preference. **A `file://` image
drawn into a canvas taints it, and `toDataURL` then throws** — so with separate image files the
in-room PNG could never be hashed, and `H_composite` of §4 would be unobtainable. Exhibit C decides
the asset format.

Estimated budget: JPEG q80 at ~250–350 KB per crop, ~400 KB base64, so roughly 1.2 MB per family at
three crops and ~13 MB on disk across eleven families, with **no more than ~2.5 MB ever loaded by one
page**. On a 2013 laptop with 4 GB, a 1.2 MB string literal parses in well under a tenth of a second
and one decoded 1200×800 RGBA costs 3.8 MB; hold at most two.

### Coverage, and the rule that follows

The colour must be **known**, not judged, and that is the binding constraint: the existing library
carries black and gray and nothing else, because those are the only families a photograph can be
trusted to name. Estimated, per family: black and gray are obtainable from cemetery photographs. Red, rose, mahogany,
white, blue and green need labelled stock. Marble is weathered in cemeteries and needs new stock.
**Bronze is not sampled at all** — it is cast metal with a patina, and procedural is the honest render
for it.

**Every priced colour or none.** The twenty AFM colours resolve to nine granite families, and a
dealer's sample board covers all nine in one visit. Uniformity here costs half a day, which is why it
is a requirement rather than an aspiration. Marble and bronze stay procedural: both are already
quote-only and already a visibly separate tier, so that difference is explained rather than silent.

---

## 7 · Alphabets

Glyph outlines are load-bearing (§1), and no supplier alphabet exists as outlines. Substituting a
lookalike font is the exact failure `audio-to-memorial.md` warns about — a typeface no monument
company stocks.

**Ship one clearly-marked placeholder; do not block the proof; pin everything that can be pinned.**
The dimensioned sheet states, per line, the text, the alphabet *name* as AFM lists it, the cap height,
the centre position, and the rule "centre each line". All of those survive a change of glyph outlines.
Widths are the only thing that does not, so the placeholder is required to be **wider than any real
monument alphabet**, with a 10% margin enforced: anything that fits ours fits theirs.

The sheet carries: *"Letter shapes shown are a stand-in for AFM's Traditional alphabet. Size and
position are as specified; shapes will follow the supplier's pattern."* Exhibit C then approves text,
sizes, positions and alphabet name, with letter shapes explicitly excluded until real outlines land.

### The ask to AFM

The empty supplier profiles exist so the ask is a list rather than a vague request. This is the list:

1. Alphabet names exactly as they appear on the order form.
2. For each, vector outlines (SVG, EPS or OTF) as consumed by the stencil cutter — the file the
   plotter uses, not a marketing sample.
3. Failing that, a full character chart per alphabet (A–Z, a–z, 0–9, `. , ' " - &`) cut at 2″ caps and
   photographed square-on with a rule, or the stencil software's proof PDF.
4. Minimum cap height and minimum stroke width per alphabet, per granite family.
5. Standard cut depths — sandblast, V-sunk, frosted panel — and whether depth varies by alphabet.
6. Letter- and word-spacing conventions; whether lines are centred by the shop or cut to supplied
   coordinates, and the position tolerance.
7. Lettering finish codes (frosted, painted, gilded) and which alphabets permit each.
8. Written permission to reproduce the alphabets in proofs.
9. Access to one blank per size, and a colour sample board, for a half-day photograph.

---

## 8 · Compositing order

Surface, then inscription, then the polish that belongs above it, then cast shadow.

The middle step is conditional on the material's own `engrave` mode:

- **Sandblast and carve** produce a matte, light-scattering cut. The specular sweep crossing the
  polished face does not cross the letters, so it stays beneath them.
- **Raised bronze** is the opposite: the letter faces stand proud and are polished metal, so the
  sweep crosses them like any other mirror. Bronze takes a second, reduced specular pass above the
  lettering.

`stone.js` does this, and `tests/stone.test.mjs` counts specular passes per material to keep it that
way — one for granite and marble, two for bronze.

---

## 9 · Roads not taken

**Generating the stone.** Settled in `audio-to-memorial.md` and unchanged: a generative model invents
typefaces no monument company stocks and depths that cannot be cut.

**Redacting a stranger's inscription.** Technically sound — copying a stone's own grain over its own
lettering is closer to cropping than to invention — and it would have moved the render-ready library
from roughly a tenth to over half. Rejected because the disclosure it requires is itself a wound:
*"we painted out another family's name"* is honest and is the one thing a family could later discover
and feel used by. Merchandise is a tone problem, fixable in composition; this was a dignity problem,
fixable only by a sentence that hurts. The yard shoot removes the need entirely, so redaction is **dropped
from the roadmap** rather than deferred: v1 does not need it, v2 does not need it, and a disclosed
synthesis is not worth carrying when an undisclosed nothing is available.

**Recovering size from existing photographs.** Die-on-base proportion does not work. The catalogue's
ten dies collapse into similarity classes — a 30×6×20 on base D and a 36×6×24 on base E share an
aspect of 1.5 and a die/base ratio of 0.75 — so four of ten dies, including the commonest cemetery
uprights, are indistinguishable without an absolute reference. The error between them is 20%, not
half an inch. The only absolute references in frame, 6″ versus 8″ base thickness and base exposure
above grade, are precisely what burial and settling destroy. Off-axis pitch is a non-issue at 1.5%
for 10°. And the closed set of sizes is AFM's 2025 sheet rather than the world's: a 1974 stone from
another quarry is any size at all, so snapping it to a catalogue size manufactures a false claim that
no metadata can make true.

**A weakened size claim.** "About an inch" is a number a family will hold us to. The four uniquely
identifiable die sizes may be composited under the exact rule; the ambiguous classes may never carry
an inscription, never stand beside the dimensioned sheet, and never appear in a proof. An image with
no lettering and no dimensions on it makes no size claim, so those photographs remain honest as
colour-and-finish reference and nothing else.

**Near-matched motifs.** A photographed motif is never used, *even when it matches*, because Exhibit
C approves "the exact image shown" and the motif that gets cut comes from the supplier's vector art.
No carved or etched motif may appear anywhere on the depicted face. The family reads everything
inside the stone's silhouette as theirs — the quad is our construct, not theirs.

**A photograph gallery.** Choosing the surface is never a family task. Asking a widow to browse
strangers' graves is the most damaging screen this product could have. Zero of the ten clicks go to
the rock.

**A plain photographic stone when retrieval finds nothing.** A photograph of granite that is not
their granite reads as a promise, and no sentence undoes it. Empty retrieval falls to the drawn
stone, always, with an identical layout and an identical order form.

---

## 10 · Copy

**Persistent caption, every page showing a design.** Currently missing: the §3.8 notice appears only
in `preview.html` and inside each SVG's `aria-label`, while `index.html`, `designer.html`,
`intake.html` and `thank-you.html` carry nothing visible. The README's claim that every surface says
so is false on four of five pages.

> A screen can't reproduce stone, bronze, etching or polish — the finished memorial will differ, and
> that isn't an error (Partner User Agreement §3.8).

**Provenance, for a yard photograph.**

> Photographed in the supplier's yard, uncut, before any lettering — the words are ours, set at the
> size you ordered.

**Where a colour has no photograph yet.**

> We photograph stones as we get access to them, so some colours have a photograph and some don't
> yet — it's about our camera, not about your granite, and the drawing is set to the same size and
> the same letters her stone will be cut to.

**On the surface itself, in the About panel.** §3.8 covers the *medium* — no screen reproduces
stone. It says nothing about our own choices to be less accurate than we could be, and using a
standing honesty notice to absorb a decision we made is how such notices stop being read at all.
So the choice gets its own sentence:

> The surface you're looking at is built from a photograph of real granite of this type, tinted to
> your colour — it shows you how the stone breaks up light, not the exact figuring of the slab your
> memorial will be cut from.

**Rainbow granite**, shown every time it renders.

> Rainbow is figured differently in every slab — this is one real piece of it, so treat the banding as
> a sample of the character, not a picture of your stone.

**A flat marker**, from the director.

> A flat sits level with the lawn, so you'll almost always see it at an angle from standing — that's
> why it's shown lying down here, and why the lettering is cut deeper and simpler than it would be on
> an upright.

**Bronze.**

> Bronze isn't stone — it's cast, the letters stand up off the plate, and it darkens as it weathers,
> so the screen will always be the least of it.

**The optional control**, shown only where a photograph exists, never disabled and never empty:
*"See a photograph of this granite."*

**Exhibit C approval.**

> I approve this design as shown on the dimensioned sheet, which governs: [name], [dates],
> [inscription], in [granite], [W]″ × [H]″ × [D]″, [shape].

Banned everywhere: *simulated*, *mock-up*, *for illustrative purposes only*, *actual product may
vary*. They read as legal cover, and a family that distrusts the caption distrusts the spelling.

---

## 11 · Open

One dependency, and it is external.

- **Supplier alphabets and stock artwork do not exist as outlines.** Until they do, INSCRIPTION ships
  the marked placeholder of §7 and every proof carries its caveat. AFM's own profile already lists
  minimum stroke width and inscription depth as missing. The nine-item ask in §7 is the whole of what
  is needed, and everything else in this document can be built without waiting on it.

Resolved during drafting and recorded so they are not reopened: Rainbow takes its own full-face crop
(§6); flats get a grass day and ship drawn until then (§5); depth is per layout entry with `technique`
as an enum and needs no stroke profile (§1); redaction is off the roadmap (§9).

---

## 12 · Pre-mortem — known defects in this document

Written after the fact, by the two disciplines that authored the decisions above, each attacking only
what they themselves accepted. Everything here is a defect in this spec, not a risk to the project.

### Where the crop rule is false

**Figure is identity for four colours.** §6 says texture is not identity, and that is true for the
four black granites `stone.js` already collapses. It is false for **Jet Mist**, **Bahama Blue**,
**Paradiso** and **Silver Cloud**, whose whole character is their figure. The failure is silent and
complete: a family chooses Jet Mist, sees an India Black crop tinted to a hex nobody measured against
a slab, signs a sheet that correctly reads "Jet Mist", and receives a gray-veined stone that looks
nothing like the proof. Every artifact hashes correctly and nobody in the building has seen Jet Mist.
It is worse than it looks in the catalogue, too — Jet Mist is Cat 2 and India Black is Cat 3, so the
shared pixels cross a price boundary.

The Rainbow carve-out of §6 was the right instinct scoped too narrowly. It becomes a `figured` flag:
a figured colour takes its own full-face crop or stays procedural, and **no tint value may be a
developer's guess** — measured against a slab, or the colour does not ship colour-shifted.

### Where the contract leaks

**Frost reads pixels, so SURFACE publishes five fields, not four.**
`frost = mix(blur(localPixels), family.frost, 0.6)` puts INSCRIPTION's hand into SURFACE's pixels, and
the dimensioned sheet — which has no pixels at all — already diverges from the composite in frost
tone. Under deadline a developer passes the canvas context through as the fifth field and INSCRIPTION
starts reading it for sweep position and edge avoidance too. Fix: SURFACE resolves a `frost_sample`
per layout position and publishes the colour, never the pixels. The sheet then takes the same value.

**"The quad is the whole face" is true only for rectangles.** A serpentine, a heart and a cross have
shoulder cut-outs. A bounding rectangle puts letters outside the stone on the composite while the
sheet, clipped by the outline path, shows them inside — two views of "one object" that disagree,
which is the exact failure §1 exists to prevent. The quad is a polygon clipped to the form outline,
and every glyph box is tested against it.

### Where it breaks at scale

**The root hash stops meaning anything.** `renderer_version` sits in the root, pages open from
`file://`, and branches update by copying folders. The same signed layout re-hashes differently on
head office's laptop, "root mismatch" becomes routine within a quarter, and a routine mismatch is a
waved-through mismatch.

**Two suppliers, one hash.** `alphabet` is a bare name and `size_id` is `"24x12"`; neither carries the
supplier. Both AFM and the next supplier have a "Traditional", so `H_layout` is identical across them
while the order form quietly translates the signed layout into a different alphabet and a different
thickness. Both fields must be supplier-qualified — `afm:traditional`, `afm:24x12`.

**Five thousand photographs** is a 10 MB metadata index parsed on `file://` before the colour list
paints.

### The fallbacks that must not be silent

A missing `material-crops/<family>.js` — a copied folder, a quarantined 1.2 MB base64 script — drops
one colour to procedural speckle. That room now has the two-tier product §2 forbids and **the director
cannot tell**, because the fallback looks exactly like what v1 looked like last month. Its sibling:
glyph JSON fails, `LETTERING` falls back to a CSS stack, and the sheet the family signs disagrees with
the composite by the 6% §1 names.

Both need a persistent, non-modal indicator in the director's view — never the family's.

### The number most likely to be wrong

**25 px/inch was sized for a 300×400 preview.** The sheet is at true scale and the composite gets
pinch-zoomed: a 2× DPR display at true scale is around 190 px/inch, so the crop upsamples seven or
eight times and JPEG block edges become the "grain". The realism claim inverts at the exact moment a
family leans in to look closely. The 10% alphabet width margin is second, because it bounds a set of
alphabets nobody has seen.

### Where the copy fails, because a person says it

**The "no photograph yet" line dies by week two.** Thirty-three words explaining our camera logistics
to a woman who buried her husband on Tuesday, spoken when nobody asked. A director hears it land as an
apology for the product and stops saying it — and the silence reads as *rose looks cheaper*. That is
the steering §3 forbids, arriving through the one channel §3 does not govern. It cannot be spoken. It
goes on screen, where the photograph button would otherwise sit, in the same weight as the button:

> No photograph of this granite yet — the drawing is set to the same size and the same letters.

The provenance line of §10 dies second, for the same reason: long, and said at a moment when the
family is looking rather than listening.

**The reveal has no trigger.** "Their own words within seconds" means the full name and both dates
snap onto stone while the daughter is still spelling the middle name — the moment it becomes real,
handed to a keystroke. And within a month directors learn the photograph is what makes families go
quiet, so they jump to it and the drawn stone becomes a loading screen before the good part. The
guard was the original sequence and it never reached this document: **blank stone, director-triggered,
then the inscription lands.**

**The sheet is the wrong checking instrument.** It is the right manufacturing authority, and a family
handed a black-and-white dimensioned drawing at the end of a two-hour arrangement does not proofread
it — it looks like a permit, and permits are things you sign. The daughter glances at the composite,
says "that's her", and signs the sheet while looking at the other object. What actually checks is a
readback, in the largest type on the page, above the signature:

> Read these lines back to me exactly as they should be cut.

**§3 binds code, not directors.** A director who has watched fifteen families react to the black
photograph will say "most families go with the black — and I can show you exactly how that one looks."
Nothing in §3 is violated; the code never sorted anything. The enforceable half was written and called
the rule. It survives only as an audit: colour mix per director before and after v2, with a moved
black share treated as a finding rather than a sales result.

**One rule will be ignored:** "the word photograph never attaches to a crop". Directors will say
"that's a photo of the granite", because it very nearly is. An ignored rule is worse than no rule,
because it gets cited as a safeguard and its existence stops anyone from watching.

### Two calls that are not ours to make

1. **Delete `H_composite`?** §4 hashes the sheet as source *because* canvas bytes are not
   deterministic, then hashes the composite as canvas bytes anyway. It proves only that some pixels
   were shown, which a stored PNG beside the signed root proves without entering the hash. Deleting it
   removes `renderer_version` from the root, and removes the `file://` canvas-taint constraint that
   forced 13 MB of base64 JavaScript in §6. Against that: the redaction record rides in
   `H_composite`, and redaction is off the roadmap but the field was the audit trail for anything
   retouched.
2. **Do figured colours get their own crops, or stay procedural?** Four more full-face crops is a
   larger sample-board visit; procedural for four colours is four visible exceptions. §6 currently
   says every priced colour or none, and this is the first real test of that rule.
