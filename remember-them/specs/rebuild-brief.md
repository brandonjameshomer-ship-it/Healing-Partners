# Rebuild brief — September 2026

Nine changes requested, checked against **Beta Partner Subscription Terms, Rev. 13, 9 September
2026**. This document is the brief, the gaps found in it, and the order the work should happen in.
Nothing here is built yet.

---

## 0 · What the agreement changed, and what that breaks today

Rev. 13 deletes the entire commission apparatus — §§6.4–6.7 and the commission half of 6.9 — and
replaces the price sheet.

| | Old | Rev. 13 |
|---|---|---|
| Model | subscription **+ share of marker sales** | subscription only, **no commission, no audit, no books** |
| Tiers | $150 / $350 | Essentials **$149** (50 designs) · Professional **$449** (51–200) · Unlimited **$649** |
| Beta | — | half: $75 / $225 / $325 |
| Overage | — | **$4 per Design** ($2 beta), Essentials and Professional only |
| Ceiling | — | fee + overage never exceeds the next Tier's fee (§6.2.5) |
| Seats | — | Administrator free; each **Authorized User $149** ($75 beta); a second admin counts as a User |
| Term | six-month initial term, $200 recapture | **month to month, no minimum term** (§6.10.1) |

**Everything currently live contradicts this.** The homepage published 8 September advertises "a
share of marker sales", a "six-month initial term" and the flat $200 recapture. The sales page at
`/pages/for-funeral-homes` still quotes $200 per month of recapture. **A funeral home reading the
site today is being sold a business model that no longer exists**, and the page about to be put
behind a password (item 2) is the one carrying the obsolete numbers.

**Fix the copy before building anything else.** It is the cheapest item on this list and the only
one that is actively misleading a buyer right now.

---

## 1 · Consumer homepage

`healingpartners.us` sells to **families**, whose call to action is *ask your funeral director about
Remember Them*. The funeral-home pitch — currently the homepage — moves behind the password of
item 2.

Not yet decided:

- **Whether the consumer page collects anything.** An email capture turns this into consumer PII,
  which is a different regime from the Partner-facing commitments in the agreement and needs its own
  privacy notice. A page that collects nothing and says "ask your director" is materially simpler.
- **Naming partner homes.** §6.9.2 forbids either party using the other's name or marks publicly
  without written approval. A "find a partner near you" directory needs that approval per home.
- **The store furniture.** Nav still carries Catalog, Cart and Search; Catalog resolves to an empty
  product list. A consumer landing page with a shopping cart contradicts "families never pay".

## 2 · Password-protected partner area

Interest form at the bottom generates a one-time credential; email is the username; the temporary
credential is exchanged for a password on first use; password entered twice.

**Do not hand-build this.** A bespoke credential system on a Shopify page is the highest-risk
component in the whole brief. Use Shopify customer accounts or a real identity provider. Whatever
carries it must have:

- **A one-time link rather than an emailed password.** Email is not a secure channel and an emailed
  password lives in the mailbox forever. A single-use, time-limited link that lands on a set-password
  screen is both safer and fewer steps.
- **No account enumeration.** The interest form must answer identically whether or not the address is
  already registered.
- **Rate limiting** on the form and the login, or the interest form becomes an email relay.
- **Session expiry**, and a deliberate decision about shared front-desk machines.
- **Nothing sensitive in the URL** — the same rule the intake already follows.

## 3 · Offensive content in the designer

Correct: there is no protection of any kind today.

The legal exposure is already allocated — §7.1(a) excludes content supplied by Partner or Partner's
customer from Company's indemnity, and §7.2 is the Partner's indemnity — so this is a **product and
reputation** problem rather than a liability one.

**The hard part is not detection, it is the false positive.** Religious iconography is a legitimate
and central part of memorial design: the catalogue ships cross, celtic, star, dove and rose emblems.
A filter that blocks a grieving family's cross because it pattern-matched "religious symbol" is a
worse failure than the thing it was built to prevent. Mockery is a matter of context and juxtaposition
that a classifier will not reliably see.

Two decisions needed before code: whether the check runs at **generation** or at **export/order**,
and whether a block is **hard** or a flag for the funeral director. A funeral director present in the
room is a far better filter than software, and the design already assumes their presence.

The agreement also has **no acceptable-use clause**. It should, and that is a lawyer's paragraph, not
a code change.

## 4 · Dashboard, notifications, and the overage warning

**The design counter is a billing meter, so it must match the agreement exactly.** §6.3.2 excludes
four things from the count: regenerations to correct a Company error, withdrawn or undelivered
variants, previews/thumbnails/intermediate renders, and re-rendering an existing Design at a different
size or format. §6.3.5 puts the record-keeping burden on Company and resolves good-faith disputes
**in the Partner's favour** where records are inconclusive. A counter that is merely approximate is a
contractual liability.

**§6.3.4 constrains where the count may appear.** Usage is shown prominently to the owner —
dashboard, a monthly "you used 178 of 200" — and is **never shown to the counsellor during a family
session**, because that is exactly the person whose behaviour it would change in the wrong direction.
The requested overage notice therefore goes to the Administrator and owner only.

Status notifications (ordered, confirmed, delivered, installed) to the individual counsellor, by
SMS/WhatsApp/email, with a configurable interval. Not yet decided:

- **Consent.** Business SMS still needs opt-in records; WhatsApp requires pre-approved templates and
  only allows free-form replies inside a 24-hour window. Email is the only channel with no gate.
- **Cancelled memorials still count as Designs** (§6.3.1). The dashboard should say so plainly, or the
  first cancelled order becomes a billing dispute.

## 5 · Upload the home's own design book and order form

Remember Them converts the chosen design into **the funeral home's existing order form**.

**"Works every time" is not achievable against an arbitrary uploaded PDF**, and promising it invites
the failure §6.8.3 exists to limit — where an error in a Deliverable costs one billing period of
credit. The realistic shapes are:

- **A mapping step, once per funeral home.** A human maps design fields to form fields on setup. Then
  it does work every time, because the mapping was verified once by a person.
- **Or a supported-forms list**, with the top handful of monument-company forms built in.

Either is honest. Automatic field detection on any uploaded form is not, and this is the item most
likely to generate an E&O claim (§7.5).

## 6 · Screenshot detection

**There is no way to detect a screenshot in a browser.** No API exposes it, and anything built will
be a mechanism that reports nothing while implying it protects something — worse than no mechanism,
because it will be cited as a safeguard.

Worth naming the actual fear. If it is a family taking the design to a cheaper monument company, that
is a commercial question, and the answers are commercial: a visible watermark on anything not yet
approved, the production files (item 7) released only on order, and the fact that a screenshot is not
a cuttable stencil. If it is privacy, the screenshot is being taken *by* the family of *their own*
design, which is not a threat.

## 7 · Export — PDF, and files a monument company can cut

PDF, email attachment and Google Drive are straightforward. The production side is not.

Sandblast stencil cutting needs **vector outlines** — DXF, EPS, AI, SVG, or a plotter format such as
HPGL/PLT — at true size, with the lettering as closed paths rather than live text.

**This is blocked on the same dependency as the proof pipeline.** `surface-inscription.md` §7: no
supplier alphabet exists as outlines, and substituting a lookalike font produces a stencil in a
typeface no monument company stocks. A PDF proof can ship with the marked placeholder alphabet. **A
cuttable stencil cannot.** The nine-item ask to AFM in that document is the blocking dependency for
this item.

## 8 · Add and remove users

Required by §6.2.2, and the agreement's own terms shape the UI:

- **Removal takes effect at the start of the next Billing Period**, and User fees are **not prorated**.
  The interface must say this at the moment of removal, or every offboarding becomes a refund
  conversation.
- **A second administrative account is charged as a User.** Say so where the account is created.
- Designs are counted across the whole subscription, not per user.

The agreement's own review is blunt about sequencing: *don't sell seats you can't enforce* — roles,
invitations, deactivation and an audit of who did what have to exist before a seat price is real.

## 9 · Review passes

Once the above is built: a two-model pass, then a review as a coding engineer for unnecessary
complexity and structural simplification, then a review as a data security expert.

---

## What was missed

1. **Every price on the live site is now wrong.** Above, §0. Highest priority and lowest effort.
2. **Insurance is a precondition, not paperwork.** §7.5 requires Company to carry technology E&O
   including media/IP liability at $1M and cyber at $1M, and §7.1 obliges Company to *defend* partners
   against claims that a Deliverable infringes. Items 5 and 7 — generating order forms and production
   files — materially increase that exposure. The liability cap is 12 months of fees or $1,000, which
   at $75–$325 a month is small; the insurance is what stands behind it.
3. **The agreement has no acceptable-use clause**, which item 3 needs.
4. **Existing beta partners on the old terms** need a migration path and notice. Anyone who signed for
   commission and a six-month term is on a document that no longer exists.
5. **Founding Partner benefits** are referenced as the incentive for voluntary outcome marking (§6.9.1,
   80% threshold). Nothing defines or builds them.
6. **Compute cost at the Unlimited tier is uncapped.** The agreement's own review flags it: one regional
   dealer generating heavily can make $649 unprofitable. Measure cost per rendered variant before the
   beta ends; consider fair use rather than a hard cap.
7. **Tier assignment mechanics.** §6.2.5's ceiling means tiers are arrived at rather than chosen. The
   dashboard has to show a partner where they are, mid-month, without showing the counsellor.

## Order of work

1. Correct every price and term on the live site (§0).
2. Consumer homepage; move the partner pitch behind auth (1, 2).
3. User management, because seats are already being sold (8).
4. Dashboard and the design counter, built to §6.3 exactly (4).
5. Export: PDF now, production files when alphabets land (7).
6. Order-form mapping (5).
7. Content policy — clause first, then product (3).
8. Nothing for screenshots beyond watermarking (6).
