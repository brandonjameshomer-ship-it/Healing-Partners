/* Remember Them — shared memorial renderer.
 *
 * Both the guided flow (index.html) and the configurator (designer.html) drew
 * their own SVG. Two copies drifted, and both carried the same faults:
 * a zero-thickness silhouette, one finish over the whole shape, a smooth
 * low-contrast noise veil standing in for granite, and — worst — an
 * inscription filled darker than the stone on every material, which made the
 * name almost vanish on the black granite that sells most.
 *
 * This is the single renderer. It models the three things that actually make
 * a memorial read as stone:
 *
 *   1. THICKNESS. A die is 4-8in deep. Straight-on with no return edge reads
 *      as a sticker. We sweep the outline back along a short vector so the
 *      top and one side show.
 *   2. TWO FINISHES. A monument is polished on the face and rock-pitched on
 *      the sides. That rough/smooth boundary is most of what the eye uses to
 *      say "stone" rather than "painted board".
 *   3. HOW THE LETTERING CATCHES LIGHT — and this is per material, not one
 *      rule for all six. See engraved() below.
 *
 * No build step, no dependencies, ES5. It has to run on a funeral director's
 * old laptop.
 *
 * NOTE ON HONESTY: a screen cannot reproduce stone, bronze, etching or polish.
 * Partner User Agreement 3.8 says that difference is not a design error. That
 * is a reason to caption the preview, which callers should do — it is not a
 * reason to render the name at low contrast.
 */
window.RememberThem = window.RememberThem || {};
window.RememberThem.Stone = (function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------------------------------------------------------- stones
   *
   * engrave tells the renderer how light behaves in the cut, which differs by
   * material and is the single biggest realism win:
   *
   *   "sandblast" — the blast micro-fractures the surface into a frosted,
   *      diffuse texture while the face around it stays a mirror. On dark
   *      granite the letters come out PALE. This is why black granite is the
   *      premium choice and why photo etching is restricted to it.
   *   "carve" — on white marble a frosted cut is the same value as the stone,
   *      so there is no contrast to have. The letter reads as its own shadow,
   *      i.e. darker.
   *   "raised" — bronze is cast, not cut. Letters stand proud of a stippled
   *      ground, then the raised faces are polished bright while the
   *      background oxidises dark. It is the inverse of everything above.
   *
   * frost = the colour of the cut surface itself.
   * sky   = what the polish reflects. polish = how mirror-like, 0..1.
   */
  /* FAMILIES is keyed by the render family a catalogue colour names, not by
   * the colour itself. AFM sells four different black granites at four
   * different prices; on a 300px preview they are one dark polished rock, and
   * inventing four palettes would be inventing detail we do not have. The
   * commercial distinction is real and lives in catalogue.js, where it belongs.
   *
   * The honest caveat stays on the preview either way — Agreement 3.8, a
   * screen cannot reproduce stone. The photo library is what actually closes
   * this gap; these palettes are the floor, not the ceiling.
   */
  var FAMILIES = {
    black:    { base: "#26262B", hi: "#42424B", cut: "#0E0E12", lip: "#5A5A64",
                engrave: "sandblast", frost: "#C6C8CE", sky: "#8FA6C4", polish: 0.95,
                fleckL: "#7C7C88", fleckD: "#08080B" },

    gray:     { base: "#84888D", hi: "#A6AAB0", cut: "#4E5257", lip: "#B6BAC0",
                engrave: "sandblast", frost: "#DCDFE3", sky: "#A9BCD4", polish: 0.72,
                fleckL: "#E2E5E9", fleckD: "#3A3E43" },

    /* A light speckled granite, not marble: it takes a blast cut and holds a
     * polish, so the lettering behaves like granite even though the value is
     * close to marble's. */
    white:    { base: "#C3C0B8", hi: "#DEDBD3", cut: "#8A877F", lip: "#EDEAE3",
                engrave: "sandblast", frost: "#F2F0EB", sky: "#C6D2E0", polish: 0.6,
                fleckL: "#FFFFFF", fleckD: "#6E6B63" },

    rose:     { base: "#A2807B", hi: "#BE9B95", cut: "#6B504C", lip: "#CBAAA4",
                engrave: "sandblast", frost: "#E6D2CC", sky: "#B9AEBE", polish: 0.7,
                fleckL: "#EBD8D2", fleckD: "#4E3A36" },

    red:      { base: "#7E3B34", hi: "#9C5049", cut: "#4A1F1A", lip: "#B3675E",
                engrave: "sandblast", frost: "#E4C6C0", sky: "#A895A6", polish: 0.8,
                fleckL: "#C98A80", fleckD: "#33120E" },

    mahogany: { base: "#6E4A38", hi: "#8B6149", cut: "#3F2920", lip: "#A87A5E",
                engrave: "sandblast", frost: "#DCC4B4", sky: "#A69488", polish: 0.74,
                fleckL: "#B98C6C", fleckD: "#2A1810" },

    blue:     { base: "#36415A", hi: "#4F5C7B", cut: "#1C2233", lip: "#6D7C9E",
                engrave: "sandblast", frost: "#C8D0E0", sky: "#93A9CA", polish: 0.92,
                fleckL: "#8FA0C6", fleckD: "#141A28" },

    green:    { base: "#33463C", hi: "#4A6155", cut: "#1B2620", lip: "#688073",
                engrave: "sandblast", frost: "#C6D4CB", sky: "#93B0A6", polish: 0.9,
                fleckL: "#86A896", fleckD: "#111A15" },

    /* Rainbow is banded rather than evenly flecked. The palette leans on a
     * wide light/dark fleck spread to hint at that; it is the family most
     * obviously waiting on a real photograph. */
    rainbow:  { base: "#8A7F82", hi: "#ADA1A4", cut: "#544A4D", lip: "#C4B7BA",
                engrave: "sandblast", frost: "#E4DBDD", sky: "#AEB6C6", polish: 0.78,
                fleckL: "#F0E4E6", fleckD: "#2E2628" },

    /* Not on AFM's sheet. Kept because the cut behaves differently: on white
     * marble a frosted cut is the same value as the stone, so the letter reads
     * as its own shadow rather than as a pale frost. */
    marble:   { base: "#DEDAD2", hi: "#F1EEE8", cut: "#A49F94", lip: "#FFFFFF",
                engrave: "carve", frost: "#8C8679", sky: "#CFD8E2", polish: 0.22,
                fleckL: "#FFFFFF", fleckD: "#B8B2A6" },

    /* Bronze is cast, not cut. Letters stand proud of a stippled ground; the
     * raised faces are polished bright while the background oxidises dark. It
     * is the inverse of everything above. Priced by Matthews, quote only. */
    bronze:   { base: "#5E4622", hi: "#7E6130", cut: "#33260F", lip: "#C9A24E",
                engrave: "raised", frost: "#E2BE68", sky: "#9A8A5E", polish: 0.45,
                fleckL: "#8A6C34", fleckD: "#241A0A" }
  };

  /* Materials the supplier sheet does not carry, appended after it so the
   * designer can still offer them and mark them for quote. */
  var OFF_SHEET = [
    { id: "marble", label: "White marble", family: "marble", cat: "Quote", quoteOnly: true },
    { id: "bronze", label: "Bronze",       family: "bronze", cat: "Quote", quoteOnly: true }
  ];

  /* STONES is derived, not authored. Every granite colour the supplier prices
   * becomes a renderable material; nothing here decides what is for sale. If
   * catalogue.js has not loaded, fall back to one stone per family so the
   * renderer still works standing alone (preview.html relies on this).
   */
  function buildStones() {
    var cat = window.RememberThem && window.RememberThem.Catalogue, out = [];

    function make(id, label, family, catLabel, extra) {
      var pal = FAMILIES[family] || FAMILIES.gray, s = { id: id, label: label,
        family: family, cat: catLabel };
      for (var k in pal) if (pal.hasOwnProperty(k)) s[k] = pal[k];
      if (extra) for (var j in extra) if (extra.hasOwnProperty(j)) s[j] = extra[j];
      return s;
    }

    if (cat) {
      cat.supplier().colours.forEach(function (c) {
        out.push(make(c.id, c.label, c.family,
          c.quoteOnly ? "Quote" : "Cat " + c.cat,
          { etchable: !!c.etchable, quoteOnly: !!c.quoteOnly, origin: c.origin }));
      });
    } else {
      for (var f in FAMILIES) if (FAMILIES.hasOwnProperty(f) && f !== "marble" && f !== "bronze") {
        out.push(make(f, f.charAt(0).toUpperCase() + f.slice(1) + " granite", f, "—"));
      }
    }

    OFF_SHEET.forEach(function (m) {
      out.push(make(m.id, m.label, m.family, m.cat, { quoteOnly: true }));
    });
    return out;
  }

  var STONES = buildStones();

  /* Lettering is the catalogue's, not the renderer's — "Traditional" is a
   * placeholder standing in for a real alphabet out of the manufacturer's
   * book. The fallback here exists only so the renderer runs standalone. */
  var LETTERING = (window.RememberThem && window.RememberThem.Catalogue)
    ? window.RememberThem.Catalogue.supplier().lettering
    : [{ id: "traditional", label: "Traditional", placeholder: true,
         css: 'ui-serif, "Iowan Old Style", Georgia, serif', weight: 600, track: ".02em" }];

  /* ------------------------------------------------------------ geometry
   *
   * lift    — how far to raise the die so a base fits under it.
   * thick   — foreshortened depth of the return edge, in view units.
   * baseW   — half-width of the base slab; a base is always wider than its die.
   * lying   — the marker lies in the lawn rather than standing, so it is drawn
   *           foreshortened and its inscription is squashed with it.
   */
  var FORMS = [
    { id: "upright", label: "Upright", dims: "24 × 30 × 4 in",
      d: "M35,370 L35,90 A115,115 0 0,1 265,90 L265,370 Z",
      lift: 30, thick: 11, base: true, baseW: 148,
      emblemY: 118, nameY: 190, dateY: 228, epiY: 266, scale: 1, w: 200 },

    { id: "serpentine", label: "Serpentine", dims: "28 × 22 × 4 in",
      d: "M25,360 L25,130 C25,60 90,88 150,88 C210,88 275,60 275,130 L275,360 Z",
      lift: 30, thick: 11, base: true, baseW: 152,
      emblemY: 138, nameY: 206, dateY: 242, epiY: 278, scale: 1, w: 210 },

    /* A flat marker is set flush with the lawn. Drawing it upright was simply
     * the wrong object. It is a trapezoid receding from the viewer. */
    { id: "flat", label: "Flat marker", dims: "24 × 12 × 4 in",
      d: "M34,344 L266,344 L228,248 L72,248 Z",
      lift: 0, thick: 7, base: false, lying: true, squash: 0.58,
      emblemY: 268, nameY: 292, dateY: 312, epiY: 330, scale: 0.82, w: 230 },


    /* A slant leans back off a wide foot, so the top face is a large part of
     * what you see. The guided flow used to draw it with the serpentine path,
     * which is a different product entirely. */
    { id: "slant", label: "Slant marker", dims: "24 × 16 × 10 in",
      d: "M30,352 L30,198 L270,198 L270,352 Z",
      lift: 8, thick: 22, base: false,
      emblemY: 224, nameY: 268, dateY: 298, epiY: 324, scale: 0.84, w: 220 },

    /* A granite bench: seat slab on two plinths. Inscription runs along the
     * seat edge, which is where it is actually cut. */
    { id: "bench", label: "Granite bench", dims: "48 × 18 × 16 in",
      d: "M20,250 L280,250 L280,292 L20,292 Z M46,292 L86,292 L86,358 L46,358 Z M214,292 L254,292 L254,358 L214,358 Z",
      lift: 0, thick: 15, base: false,
      emblemY: 236, nameY: 274, dateY: 288, epiY: 306, scale: 0.62, w: 250 },

    { id: "plaque", label: "Plaque", dims: "18 × 12 in",
      d: "M35,120 L265,120 L265,330 L35,330 Z",
      lift: 6, thick: 5, base: false,
      emblemY: 158, nameY: 206, dateY: 240, epiY: 276, scale: 0.88, w: 200 },

    { id: "heart", label: "Heart", dims: "26 × 22 × 4 in",
      d: "M150,368 C40,285 18,175 62,128 C104,84 150,120 150,158 C150,120 196,84 238,128 C282,175 260,285 150,368 Z",
      lift: 26, thick: 9, base: true, baseW: 122,
      emblemY: 168, nameY: 224, dateY: 258, epiY: 292, scale: 0.86, w: 170 },

    { id: "cross", label: "Cross", dims: "22 × 34 × 4 in",
      d: "M118,372 L118,215 L28,215 L28,140 L118,140 L118,28 L182,28 L182,140 L272,140 L272,215 L182,215 L182,372 Z",
      lift: 24, thick: 9, base: true, baseW: 112,
      emblemY: 88, nameY: 186, dateY: 250, epiY: 288, scale: 0.78, w: 130 }
  ];

  var EMBLEMS = {
    none:   { label: "None", path: null },
    cross:  { label: "Cross", path: "M-4,-22 h8 v12 h12 v8 h-12 v24 h-8 v-24 h-12 v-8 h12 z" },
    celtic: { label: "Celtic", path: "M-3.5,-22 h7 v10 h11 v7 h-11 v27 h-7 v-27 h-11 v-7 h11 z M0,-11.5 m-13,0 a13,13 0 1,0 26,0 a13,13 0 1,0 -26,0 M0,-11.5 m-9,0 a9,9 0 1,1 18,0 a9,9 0 1,1 -18,0" },
    star:   { label: "Star", path: "M0,-22 L12.7,0 L-12.7,0 Z M0,22 L12.7,0 L-12.7,0 Z" },
    heart:  { label: "Heart", path: "M0,18 C-18,4 -18,-14 0,-6 C18,-14 18,4 0,18 Z" },
    tree:   { label: "Tree", path: "M-2.5,20 h5 v-16 h-5 z M0,-20 m-14,6 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0" },
    dove:   { label: "Dove", path: "M-18,4 C-10,-6 4,-10 16,-8 C10,-2 12,4 18,6 C8,12 -6,12 -18,4 Z M6,-8 C8,-14 2,-16 -2,-12" },
    rose:   { label: "Rose", path: "M0,-12 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M0,-12 m-3.5,0 a3.5,3.5 0 1,1 7,0 a3.5,3.5 0 1,1 -7,0 M-1.5,-4 h3 v22 h-3 z M1.5,6 C8,4 11,-1 12,-5 C6,-5 2,-1 1.5,4 Z" },
    hands:  { label: "Hands", path: "M-3,20 C-9,12 -11,2 -10,-8 C-9.5,-14 -6,-16 -5,-11 L-3,2 Z M3,20 C9,12 11,2 10,-8 C9.5,-14 6,-16 5,-11 L3,2 Z" }
  };

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function form(id) { return byId(FORMS, id); }
  function stone(id) { return byId(STONES, id); }
  function outline(id) { return form(id).d; }

  /* --------------------------------------------------------------- helpers */

  function wrap(text, perLine) {
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + " " + words[i] : words[i];
      if (t.length > perLine && cur) { lines.push(cur); cur = words[i]; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }

  /* Shift a hex colour toward black (t<0) or white (t>0). Saves carrying a
   * dozen more colour fields per stone. */
  function shade(hex, t) {
    var n = parseInt(hex.slice(1), 16),
        r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255,
        to = t < 0 ? 0 : 255, k = Math.abs(t);
    r = Math.round(r + (to - r) * k);
    g = Math.round(g + (to - g) * k);
    b = Math.round(b + (to - b) * k);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ----------------------------------------------------------- inscription
   *
   * The light source is upper-left throughout.
   *
   * A recess lit from above puts its UPPER inner wall in shadow, so a carved
   * letter carries a dark fringe along its top edge. A raised letter does the
   * reverse and throws a shadow down-right. Getting this backwards is what
   * makes engraving read as an embossed sticker.
   */
  function engraved(txt, x, y, size, st, font, anchor) {
    if (!txt) return "";
    var common = 'x="' + x + '" y="' + y + '" text-anchor="' + (anchor || "middle") + '" ' +
                 'font-family=\'' + font.css + '\' font-size="' + size + '" ' +
                 'font-weight="' + font.weight + '" letter-spacing="' + font.track + '"';

    if (st.engrave === "raised") {
      /* Cast bronze: proud of the ground, so it casts down and right. */
      return '<text ' + common + ' dx="0.9" dy="1.4" fill="' + shade(st.cut, -0.35) + '" opacity=".75">' + esc(txt) + '</text>' +
             '<text ' + common + ' fill="' + st.frost + '">' + esc(txt) + '</text>' +
             '<text ' + common + ' dx="-0.35" dy="-0.5" fill="' + shade(st.frost, 0.45) + '" opacity=".55">' + esc(txt) + '</text>';
    }

    if (st.engrave === "carve") {
      /* Light matte stone: the cut reads as its own shadow, with the lower
       * lip of the incision catching sun. */
      return '<text ' + common + ' dy="1.0" fill="' + st.lip + '" opacity=".8">' + esc(txt) + '</text>' +
             '<text ' + common + ' fill="' + st.frost + '">' + esc(txt) + '</text>';
    }

    /* Sandblasted: frosted and PALER than the polished face around it. */
    return '<text ' + common + ' dy="-0.95" fill="' + shade(st.cut, -0.5) + '" opacity=".85">' + esc(txt) + '</text>' +
           '<text ' + common + ' dy="0.7" fill="' + shade(st.frost, -0.35) + '" opacity=".5">' + esc(txt) + '</text>' +
           '<text ' + common + ' fill="' + st.frost + '">' + esc(txt) + '</text>';
  }

  /* An emblem is cut the same way the letters are, so it gets the same logic. */
  function emblemMark(em, cx, cy, sc, st) {
    if (!em || !em.path) return "";
    var g = '<g transform="translate(' + cx + ',' + cy + ') scale(' + sc + ')">';
    if (st.engrave === "raised") {
      g += '<path d="' + em.path + '" fill="' + shade(st.cut, -0.35) + '" opacity=".75" transform="translate(0.9,1.4)"/>' +
           '<path d="' + em.path + '" fill="' + st.frost + '"/>';
    } else if (st.engrave === "carve") {
      g += '<path d="' + em.path + '" fill="' + st.lip + '" opacity=".8" transform="translate(0,1)"/>' +
           '<path d="' + em.path + '" fill="' + st.frost + '"/>';
    } else {
      g += '<path d="' + em.path + '" fill="' + shade(st.cut, -0.5) + '" opacity=".85" transform="translate(0,-1)"/>' +
           '<path d="' + em.path + '" fill="' + st.frost + '"/>';
    }
    return g + '</g>';
  }

  /* ---------------------------------------------------------------- surface
   *
   * Granite needs two textures at once and the old renderer had neither:
   *
   *   MOTTLING — broad, soft variation across the slab, several inches per
   *     feature. This is the layer that was missing entirely.
   *   FLECKS — discrete crystals, roughly an eighth of an inch, hard-edged and
   *     high contrast: pale feldspar and near-black biotite. The old filter
   *     produced smooth cloud at 16% alpha, which reads as paper tooth. The
   *     "discrete" transfer is what turns noise into countable grains.
   */
  function surfaceDefs(uid, st) {
    return (
      '<filter id="mot' + uid + '" x="0" y="0" width="100%" height="100%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="3" seed="11" result="n"/>' +
        '<feColorMatrix in="n" type="matrix" values="' +
          '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.34 0.34 0.34 0 -0.17"/>' +
      '</filter>' +

      '<filter id="fkL' + uid + '" x="0" y="0" width="100%" height="100%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.52" numOctaves="1" seed="4" result="n"/>' +
        '<feColorMatrix in="n" type="matrix" values="' +
          '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.45 0.45 0.45 0 -0.30"/>' +
        '<feComponentTransfer><feFuncA type="discrete" tableValues="0 0 0 0.35 0.7 1"/></feComponentTransfer>' +
      '</filter>' +

      '<filter id="fkD' + uid + '" x="0" y="0" width="100%" height="100%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="1" seed="19" result="n"/>' +
        '<feColorMatrix in="n" type="matrix" values="' +
          '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.45 0.45 0.45 0 -0.32"/>' +
        '<feComponentTransfer><feFuncA type="discrete" tableValues="0 0 0 0.4 0.85"/></feComponentTransfer>' +
      '</filter>' +

      /* Rock-pitched sides: the split face is irregular, so the return edge
       * gets pushed around rather than sitting perfectly straight. */
      '<filter id="pit' + uid + '" x="-10%" y="-10%" width="120%" height="120%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="2" seed="6" result="t"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="t" scale="3.2" ' +
          'xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter>'
    );
  }

  /* Sweep the outline back along the view vector. Stepping a copy at a time
   * is crude, but it works for any path — including the heart and the cross,
   * which no amount of offsetting a single outline would solve. */
  function sweepSide(d, dx, dy, fill, steps) {
    var out = "", i;
    for (i = steps; i >= 1; i--) {
      out += '<path d="' + d + '" transform="translate(' +
             (dx * i / steps).toFixed(2) + ',' + (dy * i / steps).toFixed(2) + ')" fill="' + fill + '"/>';
    }
    return out;
  }

  /* ------------------------------------------------------------------ main */

  var seq = 0;

  function render(o) {
    o = o || {};
    var f  = form(o.form || "upright");
    var st = stone(o.stone || "grey");
    var ft = byId(LETTERING, o.lettering || "traditional");
    var em = EMBLEMS[o.emblem] || EMBLEMS.none;
    var feats = o.features || [];
    var uid = (o.uid || ("s" + (++seq)));

    var name  = o.name || "Their Name";
    var dates = o.dates || "";
    var lift  = f.lift || 0;

    /* Viewer stands a little left of centre and slightly above, so the return
     * edge shows on the right and the top face is just visible. */
    var dx = f.thick, dy = -(f.thick * 0.62);
    if (f.lying) { dx = 0; dy = -f.thick; }

    var sideBase = shade(st.base, -0.34);
    var topLit   = shade(st.base, 0.10);

    var svg = '<svg viewBox="0 0 300 400" role="img" aria-label="Preview of the memorial for ' +
              esc(name) + '. A screen cannot show real stone or polish.">' +
      '<defs>' +
        surfaceDefs(uid, st) +
        /* Polished face. Granite is a mirror outdoors: sky above, ground below. */
        '<linearGradient id="face' + uid + '" x1="0.15" y1="0" x2="0.5" y2="1">' +
          '<stop offset="0" stop-color="' + shade(st.hi, 0.12) + '"/>' +
          '<stop offset="0.42" stop-color="' + st.base + '"/>' +
          '<stop offset="1" stop-color="' + shade(st.cut, 0.06) + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="sky' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + st.sky + '" stop-opacity="' + (0.42 * st.polish).toFixed(3) + '"/>' +
          '<stop offset="0.38" stop-color="' + st.sky + '" stop-opacity="' + (0.10 * st.polish).toFixed(3) + '"/>' +
          '<stop offset="0.52" stop-color="#000000" stop-opacity="0"/>' +
        '</linearGradient>' +
        /* The specular sweep is what actually says "polished". */
        '<linearGradient id="spec' + uid + '" x1="0" y1="0" x2="1" y2="0.85">' +
          '<stop offset="0.10" stop-color="#fff" stop-opacity="0"/>' +
          '<stop offset="0.30" stop-color="#fff" stop-opacity="' + (0.20 * st.polish).toFixed(3) + '"/>' +
          '<stop offset="0.44" stop-color="#fff" stop-opacity="0"/>' +
          '<stop offset="0.70" stop-color="#fff" stop-opacity="' + (0.09 * st.polish).toFixed(3) + '"/>' +
          '<stop offset="0.86" stop-color="#fff" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<linearGradient id="grass' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#5F6E4A"/>' +
          '<stop offset="1" stop-color="#43512F"/>' +
        '</linearGradient>' +
        '<radialGradient id="cast' + uid + '" cx="0.5" cy="0.5" r="0.5">' +
          '<stop offset="0" stop-color="#1A1B15" stop-opacity=".55"/>' +
          '<stop offset="1" stop-color="#1A1B15" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<clipPath id="clip' + uid + '">' +
          '<path d="' + f.d + '" transform="translate(0,' + (-lift) + ')"/>' +
        '</clipPath>' +
      '</defs>';

    /* Ground. It stops the stone floating, which no amount of face detail
     * can compensate for. */
    svg += '<rect x="0" y="336" width="300" height="64" fill="url(#grass' + uid + ')"/>' +
           '<ellipse cx="150" cy="352" rx="150" ry="26" fill="#6B7A54" opacity=".35"/>';

    var dieT = 'translate(0,' + (-lift) + ')';

    /* Contact shadow, tight under the stone and thrown to the right. */
    svg += '<ellipse cx="164" cy="' + (f.lying ? 348 : 372 - lift + 6) + '" rx="' +
           (f.lying ? 130 : (f.baseW || 120) + 12) + '" ry="' + (f.lying ? 16 : 13) +
           '" fill="url(#cast' + uid + ')"/>';

    /* Base slab. Monuments are built die-on-base and the base is always wider;
     * without it an upright looks like a board pushed into the lawn. */
    if (f.base) {
      var bw = f.baseW, bx = 150 - bw, by = 344 - lift, bh = 30;
      svg += sweepSide('M' + bx + ',' + by + ' h' + (bw * 2) + ' v' + bh + ' h' + (-bw * 2) + ' z',
                       dx, dy, shade(st.base, -0.42), 8) +
             '<rect x="' + bx + '" y="' + by + '" width="' + (bw * 2) + '" height="' + bh + '" ' +
               'fill="' + shade(st.base, -0.16) + '"/>' +
             '<rect x="' + bx + '" y="' + by + '" width="' + (bw * 2) + '" height="3.5" ' +
               'fill="' + shade(st.hi, 0.1) + '" opacity=".55"/>';
    }

    /* The die: rock-pitched return sweeping back, then the polished face. */
    svg += '<g transform="' + dieT + '">' +
             '<g filter="url(#pit' + uid + ')">' +
               sweepSide(f.d, dx, dy, sideBase, Math.max(6, Math.round(f.thick))) +
             '</g>' +
             /* Top arris catches the light along the swept edge. */
             '<path d="' + f.d + '" transform="translate(' + (dx * 0.5).toFixed(2) + ',' + (dy * 0.98).toFixed(2) + ')" ' +
               'fill="none" stroke="' + topLit + '" stroke-width="1.6" opacity=".5"/>' +
             '<path d="' + f.d + '" fill="url(#face' + uid + ')"/>' +
           '</g>';

    /* Everything from here sits on the polished face, so it clips to it. */
    svg += '<g clip-path="url(#clip' + uid + ')">' +
             '<rect width="300" height="400" filter="url(#mot' + uid + ')" fill="' + st.fleckD + '" opacity=".30"/>' +
             '<rect width="300" height="400" filter="url(#fkD' + uid + ')" fill="' + st.fleckD + '" opacity=".42"/>' +
             '<rect width="300" height="400" filter="url(#fkL' + uid + ')" fill="' + st.fleckL + '" opacity=".38"/>' +
             '<rect width="300" height="400" fill="url(#sky' + uid + ')"/>' +
             '<rect width="300" height="400" fill="url(#spec' + uid + ')"/>' +
           '</g>';

    /* A polished edge is a bright line where the face meets the pitched side. */
    svg += '<path d="' + f.d + '" transform="' + dieT + '" fill="none" stroke="' +
           shade(st.lip, 0.15) + '" stroke-width="1.1" opacity=".45"/>';

    /* ---- what is cut into the face ---- */

    var m = { emblemY: f.emblemY, nameY: f.nameY, dateY: f.dateY, epiY: f.epiY, scale: f.scale, w: f.w };
    var y = m.nameY - lift;
    var inner = "";

    /* Inlays and applied ornament, which sit ON the face rather than in it. */
    if (feats.indexOf("photo") !== -1 && !f.lying) {
      inner += '<ellipse cx="150" cy="' + (y - 48) + '" rx="33" ry="41" fill="' + shade(st.cut, -0.2) + '" opacity=".9"/>' +
               '<ellipse cx="150" cy="' + (y - 48) + '" rx="29.5" ry="37.5" fill="' + shade(st.sky, -0.25) + '" opacity=".55"/>' +
               '<ellipse cx="150" cy="' + (y - 48) + '" rx="29.5" ry="37.5" fill="none" stroke="' + st.lip + '" stroke-width="1.4" opacity=".85"/>';
      y += 22;
    }
    if (feats.indexOf("glass") !== -1 && !f.lying) {
      inner += '<rect x="112" y="' + (y - 80) + '" width="76" height="50" rx="3" fill="#7FA8C4" opacity=".6"/>' +
               '<rect x="112" y="' + (y - 80) + '" width="76" height="50" rx="3" fill="none" stroke="' + st.lip + '" stroke-width="1.4"/>';
      y += 12;
    }
    if (feats.indexOf("bronze") !== -1) {
      inner += '<rect x="95" y="' + (y + 62) + '" width="110" height="11" rx="2" fill="#B08A45" opacity=".85"/>' +
               '<rect x="95" y="' + (y + 62) + '" width="110" height="2" rx="1" fill="#E2BE68" opacity=".7"/>';
    }

    if (em.path) inner += emblemMark(em, 150, m.emblemY - lift, 0.9 * m.scale, st);

    var nameSize = 30 * m.scale;
    if (name.length > 14) nameSize *= 14 / name.length;
    if (nameSize < 13) nameSize = 13;

    inner += engraved(name, 150, y, nameSize, st, ft);
    if (dates) inner += engraved(dates, 150, m.dateY - lift + (y - (m.nameY - lift)), 15 * m.scale, st, ft);

    if (o.epitaph) {
      var lines = wrap(o.epitaph, Math.round(m.w / 5.4));
      for (var i = 0; i < lines.length; i++) {
        inner += engraved(lines[i], 150, m.epiY - lift + i * (17 * m.scale), 12.5 * m.scale, st, ft);
      }
    }

    /* A marker lying in the lawn is seen at a glancing angle, so its lettering
     * is compressed the same way the stone is. */
    if (f.lying) {
      var pivot = 300;
      inner = '<g transform="translate(0,' + pivot + ') scale(1,' + f.squash + ') translate(0,' + (-pivot) + ')">' +
              inner + '</g>';
    }

    svg += inner + '</svg>';
    return svg;
  }

  /* Flat silhouette for the shape-picker buttons. */
  function thumb(formId) {
    return '<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet">' +
           '<path d="' + outline(formId) + '" fill="currentColor" opacity=".8"/></svg>';
  }

  return {
    render: render, thumb: thumb, outline: outline, wrap: wrap, shade: shade,
    STONES: STONES, FORMS: FORMS, LETTERING: LETTERING, EMBLEMS: EMBLEMS,
    form: form, stone: stone, byId: byId
  };
})();
