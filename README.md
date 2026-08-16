# Healing Partners

Home of **Remember Them**.

- **Store:** https://healingpartners.us (Shopify)
- **Live site:** https://brandonjameshomer-ship-it.github.io/Healing-Partners/
- **Remember Them:** https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/

## Layout

| Path | What it is |
|---|---|
| `index.html` | Healing Partners hub page |
| `remember-them/index.html` | The Remember Them app — self-contained, no build step |
| `docs/` | Notes and planning |

## Editing

Both pages share one set of CSS design tokens (the "blue hour" palette) declared at the
top of each file. Change a colour in one, change it in the other, so the two stay one brand.

Remember Them stores everything in the browser's `localStorage`. There is no server and no
account. Clearing browser data clears the memorials.

## Saving your work

    git add .
    git commit -m "what changed"
    git push
