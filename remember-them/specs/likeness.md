# Likeness — age progression for a child who died

A parent whose child died young asks what the child would have looked like grown. This document
says what Healing Partners does when that is asked, and what it does not do.

It is the counterpart to [`surface-inscription.md`](surface-inscription.md), and it rests on the
same rule: **never generate, always retrieve.** That rule was written about stone. It turns out to
be about faces too, and to hold harder there.

---

## 1 · The decision

**Refer to a forensic artist. Do not build software for this.**

A drawing announces itself as a proposition. A photorealistic render asserts evidence. That
difference is the whole ruling, and everything below follows from it.

The objection to synthesis was never that the image is inaccurate — accuracy is not available
either way. It is that a synthetic photograph carries an authority a counterfactual has not earned.
A keepsake says *this was.* An aged render says *this would have been*, and says it in the visual
grammar of a fact. A pencil drawing says the same thing in the visual grammar of an imagining,
which is what it is.

The economics point the same way and should not be mistaken for the reason. A freelance forensic
artist charges roughly $300–1,500 per portrait. Building the software honestly — model work, an
application, an evaluation set reviewed by a forensic artist — is an estimated $120–200k over three
to four months, and produces a worse object. **The drawing is not the cheap version. It is the
correct one.**

Everything from §2 onward applies to the referral as much as to any software, because the artist
needs the same gates, the same consent, and the same script.

---

## 2 · The three gates

"Never suggested, only answered" is necessary and is not sufficient. It governs the funeral home's
mouth. It does not govern the parent, who will ask three weeks after the death, at the worst
possible moment — and **asking is not consent to receiving.**

**Time.** Not arranged before twelve months from the death. This is not an arbitrary decency
interval: it is the threshold at which prolonged grief disorder becomes assessable in adults. Before
it, the honest answer is a deferral rather than a refusal, and it is said as one.

**A clinician, not a director.** The parent names a bereavement counsellor, grief therapist or
clergy member who knows them, and that person receives the work before the parent does and may say
*not yet.* This is the actual gate. The rest is packaging.

**The child's age at death.** Below about six, a photograph does not carry enough identity-stable
structure — eye spacing, ear morphology, philtrum, dental arch — to be the source of an adult face,
and the result is the parents' faces wearing a guess. Decline, and say why.

The published evidence supports a floor but is thinner than it first appears, so it is set out here
exactly. Best-Rowden, Hoole & Jain (*BIOSIG*, 2016) evaluated ages 0–4 and reported **47.93% TAR at
0.1% FAR over a six-month gap** — poor, at a gap of months rather than years. Deb, Nain & Jain
(*ICB*, 2018) evaluated ages 2–18 over an average 4.2-year span and reported **90.18% TAR at 0.1%
FAR at one year, degrading to 73.33% at three**, concluding that identification of missing children
*is* viable with current matchers. So: very young faces carry markedly less stable identity
information, but no published study measures a decade-long gap from early childhood, and none of
this is evidence about *generating* an adult face — only about matching one.

The floor of six is therefore a judgement informed by that evidence, not a result derived from it,
and it should be described that way to anyone who asks.

---

## 3 · Consent follows the household, not the biology

Three rules, in this order:

1. **Anyone who will live beside the image must consent.**
2. **Anyone whose face is used must consent.**
3. **Nobody may be drawn from without knowing.**

Where parents disagree, **the "no" governs.** This is not even-handedness; it is the same
reasoning that rejected retouching a stranger's memorial in `surface-inscription.md`. One parent's
keepsake becomes the other parent's ambush in a shared house. Said plainly:

> You share her. We won't hand one of you something the other has to live beside.

The cases that follow from those three rules:

| Situation | Rule |
|---|---|
| Adoption | The adoptive parents consent. The resemblance premise is void — say so rather than proceeding quietly. |
| Donor conception | A donor is not a parent and has not consented. Use the raising parents, or nobody. |
| Estranged parent | Their face is not available without them, and their *no* still governs the output. |
| Deceased parent | Their photograph may be used by the surviving parent. |
| A parent who does not know the request was made | A refusal. Every time. |
| Separated households | A parent may consent alone only where the other parent has died or the households are genuinely separate. |

The one mechanism worth building guards against the **director**, not the parents: no work begins
without a two-signature consent record, hashed the way Exhibit C is hashed, with the commission
bound to that hash. Revocation before delivery stops it. After delivery there is nothing to revoke,
which is a further reason there is one copy.

---

## 4 · Refusal is the opposite of an injury

Where a child had a visible condition — Down syndrome, a cleft repair, a birthmark, a face changed
by illness or its treatment — synthesis will erase it. Models trained on face datasets normalise
toward the mean, and the child comes back as a generic pleasant adult. A shift in skin tone along
the age axis was also reported in review; that one has not been verified against a source and
should be checked before it is repeated to anyone.

There are three possible responses and only one is defensible. **Silent erasure** is the disclosure
wound again: the parent sees the face, notices what is missing, and learns that software corrected
their child. **Warn and proceed** is worse, because it puts a parent in the position of authorising
the erasure of their child's face. **Refuse**, and say why:

> Her face was hers. This works by averaging thousands of other faces, and it would smooth out
> exactly the things that made her recognisable to you. I won't hand you something that isn't her.

A human artist can draw the condition forward instead of averaging it away. This is the strongest
single argument for the pencil, and it is a clinical argument rather than an aesthetic one.

---

## 5 · Delivery

**Never alone. Never first.** The named counsellor or clergy sees the work before the parent does.

**Printed. One matte copy. On paper.** Never a screen, never a file, never a phone. A screen is
infinite and pocketable; paper can be put in a drawer and shut.

**It cannot be un-seen, and the parent is told so in those words before consenting.** This is the
one disclosure in the whole product that is not a wound, because it precedes the harm rather than
describing a past one.

**One image, not a set.** A grid of alternatives is a lineup: the parent picks, and picking is a
judgment about their own child that they will second-guess for years. Where uncertainty must be
shown, it belongs in the medium — a drawing is visibly an imagining — not in a choice handed to a
grieving parent. *(This is the one point on which the review did not converge; see §9.)*

**Which photograph** is the parent's choice, and the counsellor names the stakes before they make
it, never the director and never at the arrangement table:

> Whichever one you give, that's the face this comes from. A lot of people find the last
> photographs are the ones they can't get out of their head already.

---

## 6 · What a director says

Verbatim, when asked and only when asked:

> That exists. It's not something we make here, and it's not something I'd put in front of you
> today. If you still want it a year from now, call me and I'll tell you exactly who does it and
> how it works.

**Never say:** that it is accurate; that it shows what the child *would* have looked like — only one
way they might have; that it will help; that other families found it comforting. Never the price in
the same breath. And never the word **"see"** — *"you could see her at 25"* is the sentence that
does the damage.

---

## 7 · The boundary with the memorial

**A likeness never enters the proof pipeline.**

The catalogue carries sixteen porcelain portraits. A likeness fired onto porcelain and set in
granite is a permanent object bearing a face that never existed, approved under Exhibit C as "the
exact image shown" — every artifact hashing correctly, and the thing itself untrue. That is the
failure this section exists to prevent.

Three mechanisms, because each fails at a different range:

- **A caption in the pixels.** *"Imagined, not photographed."* A relative in twenty years sees
  pixels, not metadata. The caption strip also breaks porcelain aspect templates, which makes the
  boundary physical rather than procedural.
- **A print-robust watermark** of the StegaStamp class, which survives print-then-photograph where
  DWT-DCT does not. **The portrait intake runs the detector and refuses on a hit** — a check, not a
  policy.
- **A signed C2PA manifest** where a digital file exists at all, marking it algorithmic media.

None of this makes the artifact un-shareable. Paper is photographed with a phone; a photograph of a
print carries no metadata, and only what is burned into the pixels survives. **One copy is a social
convention with technical friction, and it must be described that way** rather than promised as a
guarantee.

---

## 8 · If it is built anyway

Kept because the constraints are real and the decision above may be revisited by someone who does
not have this document.

**Licensing rules out the obvious route.** SAM and Lifespan Age Transformation Synthesis sit on
StyleGAN2/FFHQ weights under NVIDIA's non-commercial terms, and LATS is CC BY-NC-SA. Shipping them
in a paid product is a licence violation before it is a design question. LATS is also 256px across
six discrete age buckets, and neither supports conditioning on other faces.

**The licensed path** is PhotoMaker (Apache-2.0) on SDXL (OpenRAIL++-M), whose stacked-ID embedding
averages the identities of its inputs — so two or three photographs of the child plus one or two of
each parent pull the result toward the family with no training. Avoid InstantID and
IP-Adapter-FaceID: both depend on insightface ArcFace models that are research-only. Use an openly
licensed encoder — AdaFace or FaceNet — for the checks below.

**It is a desktop application on one offline machine.** About 8 GB of weights; 12 GB VRAM or Apple
Silicon with 16 GB+. Not WebGPU, not a browser, and not a funeral home's laptop.

**Parent-capture is detectable, so refuse on it.** Embed the output, held-out photographs of the
child, and each parent; refuse any result sitting closer to a parent than to the child. Expect 20–40%
of seeds to fail this at equal photo counts, because adult-to-adult embeddings cohere better than
child-to-adult. Never use a parent photograph taken at the target age — that is precisely how "the
parent at thirty" leaks in. Measure on a public families dataset before touching anyone's child.

**What persists on the machine** is not model tensors, which leave nothing. It is the scanner's
output folder, OS thumbnail caches, the print spool (CUPS keeps job files unless `PreserveJobFiles
No`; the Windows spooler keeps `.SPL`), swap, the recycle bin, and SSD blocks awaiting TRIM. Full
disk encryption, a RAM disk for working files, spool preservation off, and a machine that networks
with nothing. The honest sentence, which admits its own limit:

> Your photographs and the picture we made were held on one encrypted machine connected to nothing.
> The working copies were deleted before you left. The only copy is the one in your hands. I cannot
> promise no trace remains inside the machine's operating system — that is why the disk is
> encrypted and the machine does nothing else.

---

## 9 · Unresolved

**How uncertainty is shown.** The engineering view is that diffusion's stochasticity gives the
uncertainty for free: four to six seeds with pose and lighting pinned, spread measured with a face
encoder, four rendered at equal size with no favourite — costing nothing but the illusion of one
answer. The experience view is that a grid is a lineup and makes a parent responsible for choosing
their own child's face. Both are right about different rooms, and the referral in §1 avoids the
question rather than answering it. Anyone who builds this has to answer it.
