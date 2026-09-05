# Healing Partners

Healing Partners is the company. **Remember Them** is its memorial design app.

- **Store:** https://healingpartners.us (Shopify)
- **Live site:** https://brandonjameshomer-ship-it.github.io/Healing-Partners/
- **Remember Them:** https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/
- **Pricing:** https://brandonjameshomer-ship-it.github.io/Healing-Partners/pricing.html

## Layout

| Path | What it is |
|---|---|
| `index.html` | Healing Partners hub page |
| `pricing.html` | Plans — free for families; $150/month on a six-month term or $350 month-to-month for professionals |
| `remember-them/intake.html` | Three intake pages — identity, interview, weighting |
| `remember-them/index.html` | The guided flow — suggestions, narrowing, three proofs |
| `remember-them/designer.html` | Direct configurator |
| `remember-them/stone.js` | The shared renderer both pages draw with |
| `remember-them/media.js` | Photograph and proof uploads, straight from the browser to R2 |
| `dashboard/MEDIA.md` | Setting up Cloudflare R2 — where photographs and proofs actually live |

## Two audiences, two models

Families design free and pay for the memorial they order. Funeral homes and cemeteries
get a 3-day trial and then subscribe — $150/month on a six-month term with automatic
payment, or $350/month with no minimum. Leaving the discounted rate early recaptures a
flat $200 — Sec. 5.2 allows $200 for each month given at the discount, but that is waived. Quoting the $150 on its own understates the model.
A family is never shown a paywall.

## Test drive on the hub page

`index.html` carries a four-panel preview of where the product goes, behind one
picker. Each panel deep-links, so you can send someone straight to the one you
mean:

| Link | Shows |
|---|---|
| `index.html#design` | The live stone — granite and shape, no price quoted |
| `index.html#vr` | The turntable with a 5&prime;9&Prime; figure for scale |
| `index.html#voice` | The narrowing conversation, 4,120 options down to 3 |
| `index.html#plot` | Picking a space in an invented cemetery section |

Three of the four are marked **In development** in the panel itself, not only in
the caption, so the claim survives a screenshot. Nothing in them quotes a price
and nothing holds a plot — both have to come from the real sheet and the real
cemetery.

## Demo links

Send these to a prospective client to walk through the whole flow:

| Link | Shows |
|---|---|
| `remember-them/` | What a family sees — no trial, no wall |
| `remember-them/?plan=pro` | Starts a 3-day professional trial |
| `remember-them/?trial=expired` | Jumps straight to the lock screen |
| `remember-them/?unlock=1` | Behaves as a paying subscriber |
| `remember-them/?trial=reset` | Puts the three days back |

## Important: the trial is not security

The trial clock lives in the visitor's own browser. Clearing browser data or opening a
private window resets it. This is good enough to *demonstrate* the product; it will not
*enforce* payment. Enforcing it needs accounts, a server, and a payment processor —
see `Access.state()` in the designer, which is the single function to replace.

## Saving your work

    git add .
    git commit -m "what changed"
    git push
