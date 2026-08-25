# Cemetery Compliance & Authorization — specification

**Remember Them** · Healing Partners LLC · working draft for counsel review

This specifies two signed instruments the platform must capture before production files
are released, the data model behind them, and the evidence each must preserve. It is written
to work across US states and Canadian provinces rather than against any one jurisdiction.

> **Status:** engineering specification. The attestation wording is drafting, not legal advice.
> Have counsel review before it ships. Section 10 lists what to put in front of them.

---

## 1. Why two instruments, not one

Healing Partners' contract runs to the **Partner** (the funeral home), not to the family. A
family signature therefore cannot release Healing Partners from anything under that agreement,
and a broad release signed by a grieving consumer days after a death is the weakest document
in the file — vulnerable to unconscionability arguments in every jurisdiction here, and to
consumer-protection statutes in most of them.

So the liability is split along the line of who actually knows the facts:

| | Signed by | Attests to | Protects |
|---|---|---|---|
| **Cemetery Compliance Acknowledgement (CCA)** | Partner's Authorized Approver | Cemetery rules, section, dimensions, permitted features | Healing Partners |
| **Proof Approval (Exhibit C)** | Family Authorizing Party | Spelling, names, dates, layout, and their own authority to order | Partner, evidenced for Healing Partners |

Both are gates. Neither is a notice.

Three positions hold across every jurisdiction and must never be contradicted anywhere in the
interface:

1. Healing Partners does not manufacture, engrave, transport, set, or install memorials.
2. Healing Partners does not determine, verify, or certify cemetery compliance.
3. A screen cannot reproduce stone, bronze, etching, or polish. That difference is not a defect.

---

## 2. Designing for many jurisdictions

The platform will run in states and provinces whose rules differ in ordering and vocabulary but
draw on the same underlying concepts. Four rules keep it portable.

**Capture jurisdiction as data, never as logic.** Store ISO 3166-2 (`US-OR`, `US-TX`, `CA-ON`,
`CA-QC`). Attach documents, wording variants, and disclosures to that code. Do not branch
application code on jurisdiction.

**Never let software decide a legal question.** The platform records what a signer declares and
who declared it. It does not rank claimants, adjudicate authority, or certify compliance. This
is what makes one design work in sixty-odd jurisdictions.

**Store canonical units; display local ones.** Persist all dimensions in **millimetres**, integer.
Canada works in metric, most US cemeteries in inches, and a few in both. Rounding a cemetery's
stated maximum on the way in is how a stone ends up a quarter inch over. Display in the unit the
cemetery's own rules use, and record which unit that was.

**Store dates as ISO 8601.** `03/04/2026` is two different days on two sides of the border.
Display per locale; never persist a formatted string.

### Language

Quebec requires French for contracts of adhesion under the *Charter of the French Language*
(as amended by Bill 96); an English version binds only where the French was presented first and
the parties expressly agreed. Both attestations are adhesion contracts. New Brunswick and federal
contexts expect bilingual service. Build the attestation as **versioned, translatable templates
keyed to jurisdiction and locale**, and record which template version and language the signer
actually saw. A signature is only evidence of what was on the screen at the time.

---

## 3. The cemetery record

Cemetery rules are almost always **private contract**, not statute — which is exactly why the
Partner must obtain them and the platform must never guess. Several layers can sit on top:

- **Veterans.** US: a government-furnished headstone or marker from the VA National Cemetery
  Administration has fixed specifications that permit no deviation, and private cemeteries often
  run VA sections under separate rules. Canada: Veterans Affairs Canada and the Last Post Fund
  administer comparable markers. Where a government marker is involved, most of the design space
  disappears and the flow should say so early rather than late.
- **Provincial and state regimes.** Ontario's *Funeral, Burial and Cremation Services Act* and
  the Bereavement Authority of Ontario, BC's *Cremation, Interment and Funeral Services Act*,
  Alberta's *Cemeteries Act*, and comparable state cemetery statutes add licensing and disclosure
  duties. **Ontario licenses monument dealers**, so the Partner record needs a licence field where
  the jurisdiction requires one.
- **Endowment / perpetual care and setting fees**, which are the cemetery's, not the Partner's.
- **Seasonal installation windows.** Across Canada and the northern US the ground is frozen
  roughly November to April and setting is deferred to spring. This belongs in the record because
  a family told "twelve weeks" in October is being misled.

**Record per cemetery, and per section within it** — rules vary by section far more often than
operators expect:

`cemetery_name` · `address` · `jurisdiction` (ISO 3166-2) · `section` · `block` · `lot` · `space`
· `rules_source` (uploaded document, written correspondence, verbal) · `rules_document_hash` ·
`rules_obtained_on` · `rules_unit` (in/mm) · `permitted_categories[]` (against the eight) ·
`max_length_mm` `max_width_mm` `max_height_mm` · `material_restrictions` · `colour_restrictions`
· `permitted_features[]` (vase, porcelain portrait, bronze emblem, glass, photograph, bench,
kerbing) · `foundation_requirement` · `foundation_by` (cemetery / Partner / fabricator) ·
`permit_required` · `permit_obtained_on` · `pre_approval_required` · `pre_approval_document` ·
`setting_fee` · `seasonal_window_note` · `government_marker_programme`

---

## 4. Category permission matrix

The eight memorial categories are cross-referenced against what a section allows. In a
lawn-level-only section, six of eight are impossible, and showing them to a family is worse than
useless.

| # | Category | Typically restricted by |
|---|---|---|
| 1 | Lawn Level (individual & companion) | Rarely restricted — the safe default |
| 2 | Uprights (individual & companion) | Height limits; whole sections often prohibit |
| 3 | Monubenches | Footprint; bench-specific bans; setting method |
| 4 | Ledgers (full & half) | Full-grave coverage rules; mowing and settlement policy |
| 5 | Sculpture | Height and projection; frequently prohibited outright |
| 6 | Family Estate | Dedicated mausoleum sections only; separate approval |
| 7 | Bronze (individual & companion) | Some sections mandate bronze; others prohibit it |
| 8 | Unique (cast glass, glass art, stained glass, inlay, carving, bronzestone) | Breakable-material and vandalism policies |

Attributes crossing all eight — `occupancy` (individual / companion / companion-reserved) and
`disposition` (casket burial / cremation burial / niche / pedestal) — are filtered separately.
Niche fronts in particular carry their own dimensional rules set by the columbarium, not the
grounds.

---

## 5. The Cemetery Compliance Acknowledgement

**Placement:** after the design is locked, before production files release. Files do not download
until it is signed.

**Signed by:** the Partner's designated Authorized Approver. Never "whoever was logged in."

### Interaction rules

- **One affirmative control per item**, each displaying the actual recorded value beside it. Never
  a single checkbox at the foot of a wall of text. A click that means nothing is worth nothing.
- **Hard-block, never soft-warn.** If the design exceeds the maximum the Partner themselves
  entered, refuse the signature and return them to the design. The platform is not asserting
  compliance — it is declining to record an attestation its own data contradicts.
- **No pre-ticked boxes**, no "select all", no defaulted values on any compliance field.
- The signer must be able to **decline and route to a manual process** without losing the design.

### Attestation text

Templated per jurisdiction and locale; values in brackets are populated from the record.

> **Cemetery Compliance Acknowledgement**
>
> Before production files are released for **[Decedent]**, please confirm each statement below.
> These are your confirmations, not ours. Remember Them has not contacted this cemetery and
> cannot verify its rules.
>
> ☐ I obtained the current written rules for **[Cemetery] — Section [X], Lot [Y], Space [Z]**.
> ☐ That section permits a **[Category]** memorial.
> ☐ This design measures **[L × W × H]**. The section's stated maximum is **[L × W × H]**. The
>   design is within it.
> ☐ **[Granite colour, finish / bronze specification]** is permitted in this section.
> ☐ Every added feature is permitted: **[vase, porcelain portrait, bronze emblem, glass inlay]**.
> ☐ I understand the foundation and setting requirements and who is responsible for them.
> ☐ Any required cemetery permit, pre-approval, setting fee, or dealer licence has been obtained,
>   or obtaining it is my responsibility.
> ☐ Where a government-furnished veteran's marker is involved, I have confirmed its programme
>   specifications separately. *(shown only when flagged)*
>
> **HEALING PARTNERS LLC does not manufacture, engrave, transport, set, or install memorials, and
> has not reviewed this design against any cemetery's rules. Cemetery compliance is my
> responsibility as Partner. If this memorial is rejected, altered, or removed by the cemetery,
> Healing Partners is not responsible for the cost of remaking, re-cutting, re-shipping, or
> re-setting it.**
>
> Typed full legal name · Role · Partner · Date

Two drafting principles hold this together. **Specificity beats breadth**: a narrow attestation
of facts the signer is uniquely positioned to know survives challenge where "I release you from
all liability" does not. And **the signer must be the person who can actually know** — which is
why this instrument is the Partner's and not the family's.

---

## 6. Authorization — closing the authorizer gap

Two separate authorizations, both of which put the consequence on the person who signs.

### 6.1 Partner Authorized Approver

Designated **in advance** by the Partner in settings, not inferred at signing time.

`partner_id` · `full_name` · `role_title` · `email` · `designated_by` · `designated_at` ·
`revoked_at` · `active`

Rules: at least one active approver before any proof can be approved. Only an active approver may
sign a CCA or countersign a proof. Revocation is never retroactive — a signature stands with the
approver as they were at that moment, which is why designation history must be preserved rather
than overwritten. Where the jurisdiction licenses monument dealers (Ontario, and others), the
licence number and expiry sit on the Partner record and block signing when lapsed.

### 6.2 Family Authorizing Party

Every jurisdiction here has a priority order for who controls disposition and may order a
memorial. The orders differ, the vocabulary differs, and they change. **The platform must not
encode any of them.** It records what the signer declares.

The categories below cover the field across US states and Canadian provinces, since the statutes
draw from the same small set even where they rank it differently:

| `authority_basis` | Covers |
|---|---|
| `designated_agent` | Decedent's written designation — funeral planning declaration, disposition directive, appointment in a will, or a power of attorney where recognized |
| `personal_representative` | Executor, administrator, estate trustee — first in line in Ontario and much of Canada |
| `spouse` | Spouse, civil union partner, registered domestic partner, common-law partner, *conjoint de fait* |
| `adult_child` | |
| `parent_or_guardian` | |
| `sibling` | |
| `next_of_kin` | Remoter degree of kinship |
| `court_order` | Order resolving a dispute |
| `public_authority` | Coroner, medical examiner, municipality, public trustee, or the establishment acting under statute |

**Concurrence is where disputes actually start.** Many statutes require a majority of a class —
of adult children, of siblings — and many bar proceeding over a *known* objection regardless of
majority. So capture, in the signer's own declaration:

- `same_class_total` — how many others share your position
- `same_class_concurring` — how many agree
- `known_objection` — is anyone with equal or greater standing known to object

`known_objection = true` **halts the flow**. It does not warn. A memorial ordered over a known
objection is the most expensive mistake available in this industry, and the platform should not
be the instrument of it.

Record separately, because they are frequently different people and that difference is a common
source of dispute: **who has authority** (`authorizing_party`) and **who is paying**
(`responsible_party`).

### 6.3 Family attestation text

> **Authorization to Order**
>
> ☐ I am the person authorized to order this memorial for **[Decedent]**, as: **[basis]**.
> ☐ There are **[n]** other people with the same relationship to **[Decedent]**. **[m]** of them
>   have agreed to this order.
> ☐ No one with an equal or greater right to decide has told me they object.
> ☐ I have checked every name, date, word, and mark on this proof, including spelling and
>   punctuation, and confirm it is correct.
> ☐ I understand this memorial is permanent, and that once it is cut, changes require a new
>   memorial at full price.
> ☐ I understand a screen cannot show real stone, bronze, etching, or polish, and that the
>   finished memorial will differ in appearance from what I have seen here.
>
> **I understand that if this information is wrong, or if I did not have the authority to place
> this order, I am responsible for the cost of correcting it.**
>
> Typed full legal name · Relationship · Date

The verification items track Exhibit C: names, dates, inscription text and punctuation,
dimensions, materials and finishes, placement of photographs and emblems, cemetery requirements,
and the authority of the person ordering.

---

## 7. Signature mechanics and evidence

### Legal basis

Electronic signatures are valid throughout the territory, on consistent principles.

- **United States** — federal ESIGN (15 U.S.C. § 7001), and UETA as enacted in nearly every
  state. New York uses its own Electronic Signatures and Records Act to the same effect. A typed
  name with a per-item affirmative control and captured intent is sufficient; a drawn signature
  is not required and adds nothing legally.
- **Canada** — PIPEDA Part 2 federally, and provincial and territorial Electronic Commerce Acts
  built on the Uniform Electronic Commerce Act. **Quebec is the outlier**, governed by the *Act
  to establish a legal framework for information technology*, which is stricter about integrity
  and attribution.

All of them require the same four things, which is what makes one implementation portable:
**intent to sign**, **consent to transact electronically**, **association of the signature with
the record signed**, and **retention in a form that can be accurately reproduced**.

### Consumer disclosures (the commonly missed part)

Before the family signs: consent to transact electronically, notice of the right to a paper copy,
the ability to withdraw consent, and **actual delivery of a copy** after signing. Cheap to
implement, routinely forgotten, and the first thing challenged.

### Build recommendation

- **Partner-side CCA: build natively.** It is a gate inside a session the Partner is already
  authenticated in, and the agreement already contemplates "the designated approval function in
  the platform."
- **Family-side proof approval: use an e-signature provider** (Dropbox Sign, DocuSign, or
  Documenso self-hosted). That document leaves the platform and reaches relatives with no
  account, and a third-party audit certificate is worth considerably more than one you would have
  to authenticate yourself.

### Evidence bundle

Every signature preserves, at minimum:

`signer_user_id` · `typed_name` · `role` · `authentication_method` · `signed_at_utc` ·
`signed_at_local` + IANA timezone · `ip_address` · `user_agent` · `template_id` +
`template_version` + `locale` · `proof_version` · `proof_file_sha256` ·
`cemetery_rules_sha256` · **`rendered_pdf`** · `rendered_pdf_sha256` · per-item responses

`rendered_pdf` is the one that decides arguments: a rendering of **exactly what was on the screen
at signing**, not a database row that says a box was ticked. Store it in object storage with the
hash in the row, and make the whole record append-only — no update or delete policy for anyone,
including the founder.

### Retention

Seven years minimum, and longer where the limitation period is longer. Memorials get disputed
years later, when the second date is cut.

> **This needs an explicit carve-out in the agreement.** §9 gives the Partner export rights and
> commits Healing Partners to deletion within 90 days of termination. Applied literally to signed
> attestations, that obligation destroys the exact evidence the attestations exist to preserve —
> and it would do so precisely when a relationship has ended badly. Signed compliance records are
> **Healing Partners' own legal records**, not Partner Content, and the agreement and the DPA
> should say so. Under PIPEDA and Quebec's Law 25, retention for the establishment of a legal
> claim is a recognized basis, but it must be stated, not assumed.

---

## 8. What the platform may and may not say

**May:** display the values the Partner recorded · compare the design's dimensions against the
maximum the Partner entered and refuse a contradictory attestation · surface the section's
permitted categories as a filter · flag a lapsed licence or insurance expiry · show a seasonal
setting note.

**May never:** state or imply that a design complies with a cemetery's rules · describe itself as
having checked, verified, approved, or certified anything · rank family members by legal priority
· advise on who has authority · imply it manufactures, engraves, transports, sets, or installs ·
present a rendering as an accurate depiction of finished material.

The distinction is consistent: the platform is a **recorder and a gate**, never an authority.

---

## 9. Implementation

Data model and policies: [`dashboard/compliance.sql`](../../dashboard/compliance.sql).

Order of the gates:

```
design locked
  → cemetery record complete            (hard block on missing rules)
  → category permitted in section       (hard block)
  → dimensions within stated maximum    (hard block)
  → Authorized Approver designated      (hard block)
  → family authorization declared       (hard block on known_objection)
  → family proof approval signed
  → CCA signed by Authorized Approver
  → production files released
```

---

## 10. For counsel

1. Does the CCA's limitation of liability survive in the states and provinces where Partners will
   operate, and does it need jurisdiction-specific variants?
2. Consumer-facing wording: enforceability of the family attestation in jurisdictions with strong
   consumer-protection regimes, and against grieving-consumer unconscionability arguments.
3. The retention carve-out in §7 — amend §9 and the DPA so signed attestations are Healing
   Partners' own records rather than Partner Content subject to deletion on termination.
4. Quebec: French-language requirements for both instruments, and LCCJTI integrity requirements.
5. Whether declining to proceed on a declared `known_objection` creates any duty we do not want,
   versus the risk of proceeding.
6. Whether recording a family's declaration of authority creates any reliance we should disclaim
   more explicitly.
