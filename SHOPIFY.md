# Putting this on healingpartners.us

Everything already lives on GitHub Pages. The job is to connect Shopify to it, not to rebuild
anything inside Shopify.

**The two URLs:**

| Page | URL |
|---|---|
| Sales page for funeral homes | `https://brandonjameshomer-ship-it.github.io/Healing-Partners/for-funeral-homes.html` |
| The prototype | `https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/` |

---

## Before anything else — take the store out of "Opening soon"

healingpartners.us is password-protected right now, so nobody can reach it.

**Shopify admin → Online Store → Preferences → Password protection** → uncheck it.

Nothing below works until that's off.

---

## Option A — Link out (do this first)

**Ten minutes. Nothing can break.**

Shopify holds the sales page; the demo opens in a new tab. Not clever, but it works on every
device and there is nothing to debug in front of a funeral director.

1. **Online Store → Pages → Add page**
2. Title: `For Funeral Homes`
3. Click the **`< >`** button in the editor toolbar to switch to HTML view
4. Paste this:

```html
<div style="max-width:42rem;margin:0 auto;padding:2rem 0;font-size:1.0625rem;line-height:1.65">
  <h1 style="font-size:2.5rem;line-height:1.1;margin:0 0 1rem">
    You spend two to ten hours designing one headstone.
  </h1>
  <p style="font-size:1.25rem;color:#4A5473;margin:0 0 2rem">
    Multiple meetings with the family. Paper order forms. Then the proof comes back from the
    monument company wrong, and you start again. Remember Them does it with the family in
    about ten minutes.
  </p>
  <p>
    <a href="https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/"
       target="_blank" rel="noopener"
       style="display:inline-block;background:#A8761F;color:#2A1E08;font-weight:600;
              padding:.875rem 1.5rem;border-radius:12px;text-decoration:none">
      Try it yourself — no sign-up
    </a>
  </p>
  <p style="color:#7C85A0;font-size:.9375rem">Takes about two minutes.</p>
</div>
```

5. **Save**, then **Online Store → Navigation** → add it to your main menu.

Your page is now at `healingpartners.us/pages/for-funeral-homes`.

---

## Option B — Embed the demo in the page

**Twenty minutes.** The prototype runs *inside* your Shopify page, so the address bar stays on
healingpartners.us throughout. Better for a click-through; slightly more that can go wrong.

Same steps as above, but paste this instead:

```html
<div style="max-width:60rem;margin:0 auto;padding:1rem 0">
  <h1 style="font-size:2.25rem;line-height:1.1;margin:0 0 .5rem">Remember Them</h1>
  <p style="color:#4A5473;margin:0 0 1.5rem">
    Design a memorial in about ten minutes. Try it below — nothing is saved, nothing is ordered.
  </p>

  <iframe
    src="https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/"
    title="Remember Them demo"
    loading="lazy"
    style="width:100%;height:820px;border:1px solid #DEE3EF;border-radius:12px;background:#F6F7FB">
  </iframe>

  <p style="color:#7C85A0;font-size:.9375rem;margin-top:.75rem">
    Trouble seeing it?
    <a href="https://brandonjameshomer-ship-it.github.io/Healing-Partners/remember-them/"
       target="_blank" rel="noopener">Open it in its own tab</a>.
  </p>
</div>
```

**Always keep that fallback link.** If the iframe fails on someone's phone, they still have a way
through — and you are not troubleshooting in front of a customer.

**On the height:** `820px` suits the interview. If it scrolls awkwardly on your theme, adjust it.
An iframe cannot resize itself to its content across domains, so this is a fixed number you tune
by eye.

---

## Which to use

**Use Option A for your first funeral home meeting.** Fewer moving parts, and the demo opening in
its own tab is actually cleaner on a tablet — full screen, no theme chrome around it.

Move to Option B once you've watched a few people go through it and know it holds up.

---

## Optional — put the sales page on your own domain

Right now the full sales page lives on the GitHub URL, which is long and doesn't say
healingpartners.us. Two ways to fix that:

**Simplest:** rebuild the sales page as a Shopify page using your theme's sections. It'll look like
the rest of your store. Copy the words out of `for-funeral-homes.html`.

**Or:** point a subdomain at GitHub Pages. In your Shopify domain settings add a CNAME record for
`demo` pointing at `brandonjameshomer-ship-it.github.io`, then commit a file named `CNAME`
containing `demo.healingpartners.us` to the repo root. Then the demo lives at
`demo.healingpartners.us` and looks like yours.

The subdomain route is worth doing before you send links to people you don't know.

---

## Before you show anyone

- [ ] Password protection **off**, or they see nothing
- [ ] Open the demo on **your own phone** and walk all ten clicks
- [ ] Try it once on **the tablet you'd actually use** in the arrangement room
- [ ] Check the page on **mobile** — Shopify themes handle iframes differently
- [ ] Have the direct GitHub URL in your pocket as a backup

---

## What to say about what it is

Be straightforward — directors respect it more than polish:

> "The pricing is real, straight off my supplier's 2025 sheet. The stone colours are stand-ins
> until I photograph the actual samples. Nothing saves yet, and there's no login. It's a working
> demonstration of how the conversation goes, not a finished product."

Then let them use it themselves. Don't drive.

**The question worth asking afterwards:** *"Where does this get it wrong?"* — not "what do you
think?" The first invites the truth; the second invites politeness.
