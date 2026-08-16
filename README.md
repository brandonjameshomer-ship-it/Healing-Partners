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
| `pricing.html` | Plans — free for families, $150/month for professionals |
| `remember-them/index.html` | The designer — self-contained, no build step |

## Two audiences, two models

Families design free and pay for the memorial they order. Funeral homes and cemeteries
get a 7-day trial and then subscribe at $150/month. A family is never shown a paywall.

## Demo links

Send these to a prospective client to walk through the whole flow:

| Link | Shows |
|---|---|
| `remember-them/` | What a family sees — no trial, no wall |
| `remember-them/?plan=pro` | Starts a 7-day professional trial |
| `remember-them/?trial=expired` | Jumps straight to the lock screen |
| `remember-them/?unlock=1` | Behaves as a paying subscriber |
| `remember-them/?trial=reset` | Puts the seven days back |

## Important: the trial is not security

The trial clock lives in the visitor's own browser. Clearing browser data or opening a
private window resets it. This is good enough to *demonstrate* the product; it will not
*enforce* payment. Enforcing it needs accounts, a server, and a payment processor —
see `Access.state()` in the designer, which is the single function to replace.

## Saving your work

    git add .
    git commit -m "what changed"
    git push
