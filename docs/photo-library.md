# Photo library — folders, filenames, and what may be committed

Brandon has photographs of over a thousand headstones. They are the render source for the
designer, which makes them a primary project asset on par with the AFM price sheet. This is the
convention for filing them.

Sort into the eight memorial categories. **These are product types — what gets manufactured and
set at the grave — not design styles.**

## The folders

```
photo-library/
├── 01-memorials/        lawn level, flush with the ground
├── 02-uprights/
├── 03-monubenches/      upright with a bench attached on the side
├── 04-ledgers/          granite, or granite and bronze, covering the grave space
├── 05-sculpture/        upright with a bronze or granite sculpture beside or over it
├── 06-family-estate/    "a little granite house for caskets"
├── 07-bronze/           mounted on a granite foundation stone
├── 08-unique/           cast glass, glass art, stained glass, inlay, carvings, bronzestone
├── material-crops/      identity-free surface crops — the only tree that may be committed
└── manifest.csv
```

The numeric prefixes hold the categories in the order above rather than letting the file manager
sort them alphabetically. Nothing else depends on the numbers.

**Do not create individual/companion subfolders.** That distinction is an attribute, not a
category — it cuts across most of the eight, so splitting on it would roughly double both the
folder count and the library. It goes in the filename instead.

**Do not sort by material either.** Bronze and glass are each their own category *and* elements
inside others — bronze in ledgers and sculpture, glass throughout unique memorials. Several
categories are defined by configuration rather than by what they are made of, so material is the
wrong axis for the tree. It goes in the filename too.

## Filenames

```
<category>_<occupancy>_<material>_<variant>_<nnn>.jpg
```

| Field | Values |
|---|---|
| `category` | `memorial` · `upright` · `monubench` · `ledger` · `sculpture` · `estate` · `bronze` · `unique` |
| `occupancy` | `individual` · `companion` · `companion-uncut` |
| `material` | `granite` · `bronze` · `granite-bronze` · `marble` · `cast-glass` · `glass-art` · `stained-glass` · `inlay` · `carved` · `bronzestone` |
| `variant` | free short tag — `flush`, `half`, `serp-top`, `slant`, `book`, `heart`, `bevel`, or `x` if none applies |
| `nnn` | zero-padded sequence within the folder |

```
upright_companion_granite_serp-top_014.jpg
ledger_individual_granite-bronze_half_003.jpg
memorial_companion-uncut_bronze_flush_027.jpg
unique_individual_cast-glass_x_009.jpg
```

`companion-uncut` is the common third state: a companion stone for a surviving spouse whose death
date is left uncut until later. It is worth distinguishing because those stones photograph
differently — one side finished, one side blank — and they are the wrong reference for showing a
family a completed companion memorial.

Lowercase throughout, underscores between fields, hyphens inside a field. Keep the original file
alongside if a shot has been cropped or corrected; the convention describes the working copy.

## Motif tags — what connects a photograph to a family's answers

This is the part that makes the library do work rather than just sit there.

The designer reads a family's interview answers and derives **themes**. If every photograph
carries motif tags drawn from the same vocabulary, a family who spent the interview talking about
the river can be shown memorials that actually have water on them, instead of the same drawn
stone everyone else sees. The join is the vocabulary below, so tag against it rather than
inventing words per photo.

**Tag what is visible on the stone, never what you infer about the person.** A fishing rod etched
into the granite is `fishing`. Knowing the deceased fished is not a tag — that fact lives in the
family's interview, and matching the two is the app's job, not the filer's.

Two to five motifs per photograph. Most have one or two. Blank is a legitimate answer: a plain
upright with lettering and nothing else is the most ordered memorial there is, and the library
needs plenty of them.

| Theme | Motif tags |
|---|---|
| `land` | `fishing` · `hunting` · `boat` · `lake` · `river` · `mountains` · `woods` · `farm` · `ranch` · `horse` · `garden` · `flowers` · `tree` · `sunset` |
| `work` | `tools` · `truck` · `tractor` · `workbench` · `welding` · `books` · `nurse` · `teacher` · `trade-emblem` |
| `service` | `military-emblem` · `flag` · `veteran-marker` · `fire` · `police` |
| `faith` | `cross` · `crucifix` · `praying-hands` · `rosary` · `church` · `angel` · `dove` · `star-of-david` · `scripture` |
| `music` | `guitar` · `piano` · `notes` · `choir` · `fiddle` · `drums` |
| `family` | `portrait-photo` · `wedding-rings` · `children` · `hearts` · `pets` · `dog` · `cat` |
| `sport` | `golf` · `baseball` · `football` · `hunting-dog` · `cards` · `motorcycle` · `car` |
| *(craft elements)* | `etching` · `laser-portrait` · `porcelain-cameo` · `shape-carve` · `glass-inlay` · `bronze-inlay` · `sculpture-figure` · `vase` · `bench-attached` |

Note two things about that table.

**`sport` is not a theme the designer currently knows.** Neither are hobbies, talents, childhood
or parenting, all of which the intake asks about at length. The designer reads only seven themes
today, so those answers score nothing. Tag the photographs for the full list anyway — the
vocabulary should describe what is actually out there in the library, and the designer should be
made to catch up to it, not the other way round.

**`humour` has no motifs, deliberately.** You cannot photograph a sense of humour. It reaches a
memorial through the inscription — the thing they always said — which is why `words` is one of
the concepts the designer offers. Some themes land in text, not imagery, and the library should
not pretend otherwise.

The last row is craft elements rather than a theme: what technique produced the image, not what
it depicts. Those tags are what let the designer show a family what cast glass or a porcelain
cameo actually looks like in daylight on real granite, which no drawing has ever managed.

## What may be committed, and what may not

`Healing-Partners` is a public repository, and a photograph of a finished memorial carries a real
person's name and dates on its face.

- **Never commit** anything from `01-` through `08-`. Those are real people. They live in private
  storage.
- **Safe to commit**: `material-crops/` — crops showing only stone surface, with no lettering, no
  emblem tied to a person, and no legible dates. These are what the designer needs for granite
  colour and finish swatches, and they carry no identity.

A crop qualifies only if you could not tell whose memorial it came from. When unsure, treat it as
identifiable and leave it out.

## Where the library lives

Keep the master library in **Google Drive**, where the working files already are, and where a
Chromebook is not paying for the storage. Push only the curated, app-facing images — the ones the
designer actually renders — into the **private Cloudflare R2 bucket**, `remember-them-media`,
described in `dashboard/MEDIA.md`.

Two stages, in other words: Drive is where a thousand photographs get sorted, R2 is where the few
hundred good enough to show a family end up.

R2 rather than Supabase Storage, which this document previously named. Supabase's free tier is 1GB
total with a 50MB cap per file, and a few hundred scanned memorials at 4–20MB each does not fit;
R2 gives 10GB and charges nothing for downloads, which matters when the same reference photograph
is fetched on every designer session. The access rule is unchanged — the bucket is private, and
`memorial_media` rows sit behind the same row level security as the rest of the data, so a signed
URL is only ever minted for someone `can_see_memorial()` already allows.

Library reference photographs are not a family's own upload: they belong to no one memorial. File
them under a `library/` key prefix rather than `memorials/`, and keep them out of `memorial_media`,
which is keyed to a memorial by design.

## The manifest

`manifest.csv`, one row per photograph, so the library can be matched to catalogue entries later
without reopening every file:

```csv
file,category,occupancy,material,variant,motifs,granite_color,finish,supplier,has_lettering,quality,render_ready,notes
```

`motifs` is semicolon-separated, from the vocabulary above: `fishing;boat;etching`. It is the
column the designer matches against, so it is the one worth being careful with.

`has_lettering` is the safety gate — it is what tells you a file can never be committed.

`quality` is `a`, `b` or `c`, judged only on whether the photograph is usable as an example
shown to a grieving family: **a** — straight on, whole memorial in frame, even light, no clutter;
**b** — usable but flawed, off-angle or hard shadow; **c** — reference only, keep for the record
but never show. Judge the photograph, not the memorial. A beautiful stone shot at dusk from
forty-five degrees is a `c`.

`render_ready` is the curation flag that decides what gets promoted to Supabase. In practice it
should mean `quality = a` and `has_lettering = no`, or lettering that has been cropped out.

Leave `granite_color` and `supplier` blank rather than guessing. A wrong colour name is worse
than an empty cell, because the supplier catalogues use those names as order codes — an
"Academy Black" that is really Mesabi Black becomes a wrong stone quoted at a wrong price.

### Fill these while sorting, not after

`motifs`, `has_lettering` and `quality` all require looking at the photograph. If they are left
for later, every one of a thousand files has to be opened a second time. Category, occupancy and
material you can read off the filename afterwards; these three you cannot.

## On findagrave.com

Raised earlier as a possible source. Its photographs are contributed by volunteers who retain
copyright, the terms prohibit automated collection, and every image shows a real named decedent.
The library above is the source to build on instead.

## Why photographs at all

The procedurally drawn SVG stone — vector outlines, gradients, granite speckle, extruded
thickness, lighting-modelled engraving — was judged underwhelming after it had already been
through a substantial realism pass. That verdict was about the approach, not the execution.

It matters more than an ordinary polish note because the promise is **"Show them. Don't ask them
to imagine."** The render quality *is* the product. A preview that reads as an icon rather than a
photograph fails the pitch however correct its geometry is.
