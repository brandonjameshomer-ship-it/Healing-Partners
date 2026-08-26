# Audio to granite — the pipeline

How a recorded family conversation becomes a manufacturable granite or bronze memorial.

The design goal is not "turn speech into a picture." It is to get from a room full of people
talking about someone to a **specification a monument company can cut from**, without the family
ever filling in a form, and without a single letter of the inscription being guessed.

## The one rule everything else hangs off

**Names and dates never come from audio.**

Speech recognition will hear Kathryn as Catherine, Stephen as Steven, MacLeod as McCloud, and
"nineteen forty-three" as any of four things. A misspelled name cut into granite is not a typo. It
is a remade stone, a second delay of weeks, and a family who has to be told. The entire product
promise dies there.

So the split is absolute:

| Comes from | What |
|---|---|
| **Typed, verified intake (page one)** | Full name, spelling, dates, relationships |
| **Audio** | Everything else — stories, habits, hobbies, talents, personality, what they always said |

The transcript is explicitly told to ignore names and dates even when it hears them. Identity is
checked against a document the funeral home already holds, and again on the Exhibit C checklist at
approval. Audio carries meaning; it never carries spelling.

## The stages

### 0 · Capture

Record the meeting that already happens. The family service counselor does not change what they
do; a recorder runs. This is where the two-to-ten hours goes: the conversation *is* the intake,
so nobody transcribes it into a form afterwards.

Consent is asked once, on the record, in plain words. Under the agreement the Partner is the
controller and Healing Partners the processor, so the consent belongs to the funeral home and the
recording is Family Personal Data from the moment it exists.

### 1 · Transcribe and diarize

Speaker separation matters more than usual here. A room contains a widow, three adult children
and someone's spouse, and they disagree. "He'd have hated a photograph on it" from the widow is
not the same input as the same sentence from a nephew. Every later claim keeps its speaker and
timestamp.

### 2 · Extract a Memorial Brief

One model call turns the transcript into structured JSON: motifs, personality words, inscription
candidates in their own words, tone, and — the part usually missed — the things the family said
**not** to include. Every field carries the verbatim quote that produced it, with speaker and
timestamp.

The prompt is in `audio-extraction-prompt.md` beside this file. Provenance is not decoration: it
is what lets the designer say *"this is here because your daughter said this, at 14:22"*, and it
is what makes a wrong suggestion diagnosable instead of mysterious.

### 3 · Pre-fill the weighting, do not replace it

The intake's third page asks the family to rate each answer 1–10 for how much it should shape the
design. Keep that page — it is the narrowing mechanism, and the family should own it.

But the audio already indicates salience: what got repeated, what several people agreed on, what
someone cried about, what came up unprompted three times. Use it to **pre-fill** the sliders, and
let the family adjust. They correct a few instead of setting fifteen, which buys back clicks
against the ten-click ceiling and is a gentler thing to ask of them.

### 4 · Retrieve, do not generate

Match the brief's motifs against the photo library's motif tags — the same closed vocabulary on
both sides, which is why the tagging convention exists. Return real photographs of real
memorials, ranked by the weighted themes.

This is the step that replaces drawing. A family who talked about the river sees memorials that
actually have water cut into them, photographed on real granite in real daylight.

### 5 · Composite the proof

Take the chosen photograph and overlay the real inscription: the verified name and dates, in the
supplier's actual alphabet, at true scale for the chosen stone size, positioned where it would
really be cut.

Photographic realism and a manufacturable spec at the same time, because the stone is a
photograph and the lettering is a specification. Neither is invented.

The agreement's §3.8 notice still belongs on the surface: a screen cannot reproduce stone, bronze,
etching or polish, and that difference is not a design error.

### 6 · Specification and order form

The design is captured in neutral terms — shape, size, material, finish, alphabet, motif
placement, depth — then translated into each supplier's own vocabulary and order form. Neutral
first, supplier second, because Remember Them works with several manufacturers and each names
things differently.

### 7 · Approval gate

Nothing reaches a fabricator without a row in `proof_approvals`: approver identity, timestamp,
proof version, file hash of the exact image shown, and the Exhibit C checklist worked through.
An email saying "looks good" is not approval, and the database will refuse to move the order to
`approved` without the record.

## Why not generate the image

It is the obvious idea and it is wrong for the proof.

A generative model invents. It will produce a beautiful stone with lettering in a typeface no
monument company stocks, a shape that cannot be cut from a standard slab, a carving depth that is
physically impossible, and a polish that does not exist in any catalogue. The family approves it,
because it is beautiful. Then the fabricator says no, and the gap between what was approved and
what can be made is a problem Healing Partners created and does not have the standing to fix — it
is not the manufacturer.

There is a legitimate place for generated imagery: **exploration and marketing**, clearly labelled
as illustration, never presented as a proof and never carrying a real person's name. A prompt for
that is at the foot of `audio-extraction-prompt.md`, fenced off with that warning attached.

## What makes it reliable rather than clever

- Identity is typed and verified, never heard.
- Every extracted claim cites the sentence that produced it.
- Negative instructions are captured as first-class output, not lost.
- The model retrieves from a fixed library instead of inventing.
- The vocabulary is closed on both sides, so a match is a real match.
- The family's own rating still decides, with the audio only offering a starting position.
- Nothing ships without a recorded, hashed, checklist-backed approval.

Each of those is a place where a plausible-sounding system would otherwise put something wrong
onto a permanent object.
