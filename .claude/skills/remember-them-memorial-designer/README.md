# remember-them-memorial-designer

A Claude Skill that guides a family or funeral home through designing a memorial — interview,
design, narrowing, proofs, and a supplier order form with estimated pricing.

Part of **Healing Partners**.

## Status

**Partial reconstruction.** The original skill was built in a different environment and is not on
this machine. This version was rebuilt from the eval harness output, which preserved the seven-step
flow, the fabrication constraints, and a number of verified price rows.

**Before using this to quote anyone, fill in `references/pricing-data.md`.** Rows marked ✓ were
verified against the real sheet; rows marked `[FILL]` are placeholders. The skill will correctly
refuse to invent the missing ones, but it cannot quote what it does not have.

If the original files can be recovered, prefer them over this and merge anything useful back.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | The seven-step flow and the absolute rules |
| `references/interview-guide.md` | Step 2 — how to draw out real stories |
| `references/design-elements.md` | Step 3 — the catalogue of what can go on a stone |
| `references/narrowing.md` | Step 4 — pairwise comparison. **The essential step.** |
| `references/design-constraints.md` | What can actually be made; accuracy traps |
| `references/pricing-data.md` | Wholesale pricing, lead times, commission tiers |
| `references/order-form-template.md` | Step 7 — the supplier form |

## Why it exists

Measured against a no-skill baseline, the original scored **100% versus 64%**, and **100% versus
20%** on the order-form scenario. The gap is fabrication. Without the skill, the model invented
$495 for a marker whose real price is $910, invented a bronze inlay price that does not exist in
any wholesale sheet, and invented a volume discount in place of the real commission model.

That is the failure this skill prevents. It is also why every rule about not inventing prices is
written as an absolute rather than a preference.

## Using it

Claude Code loads skills in `.claude/skills/` automatically when working in this repository. Ask
for a memorial design, or for an order form, and it should engage.

To use it outside this repo, copy the folder to `~/.claude/skills/`.

## Open questions

- **Commission boundaries.** Stated bands overlapped at 6 and at 20; the non-overlapping reading is
  in `pricing-data.md`. Needs confirmation.
- **Commission basis.** Retail or wholesale? Materially changes the amount.
- **Prices shown to families, or only to directors?** Changes what the product displays to whom.
- The remaining `[FILL]` rows in `pricing-data.md`.
