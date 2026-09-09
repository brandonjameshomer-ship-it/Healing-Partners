# The AI designer — what to build, and what not to

Three questions were asked: how to take audio from anywhere, which image-generation approach to
use, and how to train a model on a thousand headstone photographs. This is the answer to all
three, and one of the three answers is "don't."

It should be read against `remember-them/specs/audio-to-memorial.md`, which already settles the
pipeline, and `docs/photo-library.md`, which already settles the filing. Neither is superseded
here. What follows fills the gaps they left and corrects one idea that would have been expensive
to discover later.

## 1 · Audio in, from anything

The goal was "accept audio from most any input." That is a solved problem and should not absorb
design attention. Put `ffmpeg` in front of everything:

```
ffmpeg -i <whatever> -ac 1 -ar 16000 -c:a pcm_s16le normalized.wav
```

A phone voice memo, a Zoom recording, a video file from a tablet propped on the table, a
twenty-year-old digital recorder, a conference-room MP3 — all of them become the same 16 kHz mono
WAV, and every downstream stage sees one format. Accept the upload, normalize, discard nothing.

What actually constrains the choice of transcription vendor is **diarization**, not format.
`audio-to-memorial.md` is right that speaker separation carries real weight here: the widow saying
"he'd have hated a photograph on it" is a different input from a nephew saying it, and the brief
keeps speaker and timestamp on every claim. So the requirement is a service that returns speaker
labels and word-level timestamps natively. Deepgram and AssemblyAI both do; raw Whisper does not,
and bolting `pyannote` onto it is work you would be doing for no reason.

**Cost is not a constraint and should not be optimized.** A ten-hour recording transcribes for
roughly two to four dollars. The resulting transcript is on the order of 130k tokens, which fits
in Claude's context with room to spare and extracts to a brief for well under a dollar. The whole
audio-to-brief path costs about the price of a coffee per family, against a $150–350/month
subscription or a monument sale. Engineer it for correctness and never for cost.

The real constraint is legal, not technical. Under the Partner agreement the funeral home is the
controller and Healing Partners the processor, and the recording is Family Personal Data from the
moment it exists. A transcription vendor is therefore a **subprocessor**, and needs to be named as
one, with a DPA, before the first real family is recorded. That is a contract task with a lead
time, and it should start before the engineering does.

## 2 · Generating the imagery — five approaches

The question was which to use and why. All five, honestly assessed:

| | Approach | Gets you | Costs you |
|---|---|---|---|
| **A** | Text-to-image (Midjourney, Imagen, Flux, Ideogram) | Photorealism immediately, unlimited variety, no infrastructure | Cannot cut correct lettering; invents shapes no slab yields and depths no tool cuts; no dimensional truth; no supplier mapping |
| **B** | Retrieval from the photo library | Real photorealism, zero hallucination, feasibility guaranteed because every image was actually manufactured | Bounded by coverage — no photograph, no option; the stone shown belongs to someone else |
| **C** | Retrieval + composited lettering | Photoreal stone *and* exact specified lettering, both true at once | Compositing quality is real, uncosted work — perspective, light match, engraving shadow |
| **D** | Image-to-image / ControlNet on a real photo | Structure from a real memorial, model does surface only; fills coverage gaps without inventing geometry | Infrastructure to run and maintain; still cannot be trusted with letters |
| **E** | Fine-tune / LoRA on the library | House style learned into weights | Expensive, needs hundreds of clean labels, goes stale as the catalogue moves, *and bakes real decedents' names and faces into model weights* |

**The recommendation is B and C as the spine, A fenced off, D later, E never.**

B and C are already what `audio-to-memorial.md` specifies, and the reasoning there holds up: a
generated stone gets approved because it is beautiful, and then the fabricator says no, and the
gap between what was approved and what can be made is a problem Healing Partners created and has
no standing to fix. Retrieval inverts that. Every candidate is a photograph of a memorial that
someone actually cut, so feasibility is true by construction rather than by checking.

A is legitimate for **exploration and marketing** — clearly labelled illustration, never a proof,
never carrying a real name. The prompt at the foot of `audio-extraction-prompt.md` already does
this and already carries the warning. Leave it there.

D is the answer to B's one real weakness. With eight categories crossed against sixty-odd motifs,
some combinations will return nothing — a family who talked about welding and cast glass may have
no photograph at all. Conditioning image-to-image on the nearest real memorial keeps the geometry
honest while filling the gap. It is a phase-two capability, worth building only once retrieval is
live and you can see which queries actually come back empty. Do not build it speculatively.

**The largest unpriced risk in the whole plan is C's compositing.** Flat text laid over a
photograph looks pasted on, and the product promise is "Show them. Don't ask them to imagine." A
proof that reads as a mockup fails that promise exactly as the procedural SVG did, and for the
same reason. Perspective-matching the inscription to the stone's plane, matching the light, and
rendering a credible sandblast shadow is the piece of engineering that decides whether this works.
It deserves a spike of its own before anything else in stage 5 is built.

## 3 · "Training the model on the photographs" — the correction

This is the one to change. "Feed a thousand photographs to the model so it knows what is possible"
describes three quite different things, and the intended one is the worst of them.

**Fine-tuning is disqualified on privacy alone.** `docs/photo-library.md` states that folders
`01-` through `08-` may never be committed, because those are real people with real names and
dates on their faces. Training on them does something strictly worse than committing them: it
copies those names and faces into model weights, where they cannot be deleted, audited, or
answered for when a family asks what was done with their mother's memorial. Under an agreement
where Healing Partners is a processor, that is not a defensible use of Family Personal Data. Every
other objection to fine-tuning — cost, labelling burden, staleness as the catalogue moves, the
fact that it still cannot cut a name correctly — is true and secondary. The privacy objection
alone ends it.

What was actually wanted is available two other ways, both cheap and both reversible:

**Photographs as vocabulary.** Run a vision model over the library and have it produce the
`manifest.csv` row for each photograph — category, occupancy, material, motifs, quality, and the
`has_lettering` safety gate. This is the step that turns a thousand files into something
queryable, and it is the actual bottleneck in the plan: `photo-library.md` correctly notes that
`motifs`, `has_lettering` and `quality` each require looking at the photograph, which is a
thousand manual openings before the designer can do anything at all. A model doing the first pass
with a human confirming turns weeks into an afternoon. The prompt is in
`remember-them/specs/photo-labeling-prompt.md`.

**Photographs as context at query time.** Retrieval — stage 4, already specified. The model sees
the relevant photographs when it needs them, rather than having absorbed them permanently. New
photographs work the moment they are tagged, a bad one is fixed by editing a row, and nothing
about a real person ends up anywhere it cannot be removed from.

The distinction worth holding onto: **the photographs should teach the catalogue, not the
weights.** A model that has memorized a thousand headstones is not more useful than one that can
look them up, and it is considerably harder to correct.

## Where Soup fits

`trysoup.dev` is blocked by this environment's egress proxy, so this could not be read and no
claim is made about what Soup does. If it generates typed schemas or client code from a
specification, the natural slot is the **neutral design specification** at stage 6 — the
shape/size/material/finish/alphabet/placement/depth record that gets translated into each
supplier's own vocabulary and order form. That object is written once, read by the designer, the
proof compositor, the order form and the approval gate, and it changes whenever a supplier is
added. It is the one place in the pipeline where generated types would carry their weight.

It is not the right tool for teaching a model headstone design. Nothing is: that job belongs to
the manifest and to retrieval, per the section above.

## What to do next, in order

1. Name the transcription subprocessor and start the DPA. It has the longest lead time and
   blocks recording a real family.
2. Label the library with the vision prompt. Everything downstream is gated on the manifest, and
   it is currently a thousand manual file openings.
3. Spike the lettering compositor. It is the piece that decides whether the proof reads as a
   photograph or as a mockup, and it is the only major unknown left.

Stages 0–4 are specified and unblocked once the manifest exists. Stage 5 is the risk. Stage 6 is
where a schema tool would earn its place.
