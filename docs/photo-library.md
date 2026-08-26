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
designer actually renders — into a **private Supabase Storage bucket** on the Remember Them
project, so they sit behind the same row level security as the rest of the data.

Two stages, in other words: Drive is where a thousand photographs get sorted, Supabase is where
the few hundred good enough to show a family end up.

## The manifest

`manifest.csv`, one row per photograph, so the library can be matched to catalogue entries later
without reopening every file:

```csv
file,category,occupancy,material,variant,granite_color,supplier,has_lettering,render_ready,notes
```

`has_lettering` is the safety gate — it is what tells you a file can never be committed.
`render_ready` is the curation flag that decides what gets promoted to Supabase. Leave
`granite_color` and `supplier` blank rather than guessing; a wrong colour name is worse than an
empty cell, because the supplier catalogues use those names as order codes.

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
