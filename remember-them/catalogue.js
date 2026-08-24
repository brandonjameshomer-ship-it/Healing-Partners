/* Remember Them — the option catalogue.
 *
 * WHY THIS FILE EXISTS
 *
 * The renderer (stone.js) used to own the list of what you could order: six
 * stone colours, eight shapes, four lettering styles. That was a drawing
 * program's opinion about a commercial catalogue, and it was much smaller than
 * what the supplier actually sells — AFM's 2025 sheet has twenty granite
 * colours across four price categories, nine flat-marker sizes, bevels in two
 * thicknesses, slants, ten die sizes, thirteen bases, benches, sixteen
 * porcelain portraits and a vase range.
 *
 * It was also wrong in principle. Remember Them is not built on one supplier
 * (see the project notes): it works with several monument manufacturers and
 * design companies, each with its own colours, finish codes, size list, lead
 * times and order form. A catalogue keyed by supplier is the only shape that
 * survives adding the second one.
 *
 * SO THE SPLIT IS:
 *   catalogue.js — what can be ordered, from whom, at what wholesale price.
 *   stone.js     — how to draw it.
 * A colour here names a render `family`; stone.js owns what that family looks
 * like. Neither file reaches into the other's business.
 *
 * PRICES ARE WHOLESALE. Every number below is what the Partner pays the
 * supplier. Never show one to a family. Retail is wholesale × the Partner's
 * markup — 2.5 is Healing Partners' suggested retail, but Partner User
 * Agreement §6.8 makes the retail price the Partner's own decision, so the
 * multiplier is a setting, not a constant. The one carve-out is bench
 * installation, which carries no markup at all.
 *
 * Source: Affordable Family Memorials, Wholesale Price Guide for 2025,
 * dated 1 Feb 2025. Portland, Oregon.
 *
 * No build step, no dependencies, ES5.
 */
window.RememberThem = window.RememberThem || {};
window.RememberThem.Catalogue = (function () {
  "use strict";

  /* ------------------------------------------------------------- colours
   *
   * cat    — AFM price category, which selects a column in every size table.
   * family — the render family in stone.js. Several real colours share one:
   *          Academy Black, Mesabi Black, India Black and Gold Star Black are
   *          different rocks at different prices, but at preview scale on a
   *          screen they are one dark polished granite. Pretending otherwise
   *          would be inventing detail we do not have. The photo library is
   *          what fixes this properly; until then the §3.8 notice on every
   *          preview is doing real work.
   * origin  — "us" or "overseas". Overseas stock carries the long lead time.
   * overseasCat — AFM prices India-manufactured Cat 4 colours at Cat 2 with
   *          overseas lead times. See priceColumn() and the note there.
   */
  var COLOURS = [
    /* Category 1 */
    { id: "georgia-gray",    label: "Georgia Gray",     cat: 1, family: "gray",     origin: "us" },
    { id: "morning-rose",    label: "Morning Rose",     cat: 1, family: "rose",     origin: "us" },
    { id: "rustic-mahogany", label: "Rustic Mahogany",  cat: 1, family: "mahogany", origin: "us" },
    { id: "sierra-white",    label: "Sierra White",     cat: 1, family: "white",    origin: "us" },
    { id: "sunset-red",      label: "Sunset Red",       cat: 1, family: "red",      origin: "us" },

    /* Category 2 */
    { id: "academy-black",   label: "Academy Black",    cat: 2, family: "black",    origin: "us",
      etchable: true },
    { id: "barre-gray",      label: "Barre Gray",       cat: 2, family: "gray",     origin: "us" },
    { id: "carnelian",       label: "Carnelian",        cat: 2, family: "red",      origin: "us" },
    { id: "colonial-rose",   label: "Colonial Rose",    cat: 2, family: "rose",     origin: "us" },
    { id: "jet-mist",        label: "Jet Mist",         cat: 2, family: "black",    origin: "us",
      etchable: true },
    { id: "mesabi-black",    label: "Mesabi Black",     cat: 2, family: "black",    origin: "us",
      etchable: true },
    { id: "rainbow",         label: "Rainbow",          cat: 2, family: "rainbow",  origin: "us" },
    { id: "st-cloud-gray",   label: "St Cloud Gray",    cat: 2, family: "gray",     origin: "us" },
    /* Melrose Black is manufactured overseas and priced at Cat 2. */
    { id: "melrose-black",   label: "Melrose Black",    cat: 2, family: "black",    origin: "overseas",
      etchable: true },

    /* Category 3 */
    { id: "blue-pearl",      label: "Blue Pearl",       cat: 3, family: "blue",     origin: "us" },
    { id: "green-pearl",     label: "Green Pearl",      cat: 3, family: "green",    origin: "us" },
    { id: "bahama-blue",     label: "Bahama Blue",      cat: 3, family: "blue",     origin: "us",
      note: "US manufacture" },
    { id: "india-black",     label: "India Black",      cat: 3, family: "black",    origin: "overseas",
      etchable: true,
      note: "Sometimes in stock faster than the overseas lead time — ask AFM before promising a date." },
    { id: "paradiso",        label: "Paradiso",         cat: 3, family: "mahogany", origin: "overseas" },

    /* Category 4 / India */
    { id: "gold-star-black", label: "Gold Star Black",  cat: 4, family: "black",    origin: "us",
      etchable: true, overseasCat: 2 },
    { id: "imperial-red",    label: "Imperial Red",     cat: 4, family: "red",      origin: "us",
      overseasCat: 2 },

    /* No published price. Never estimate these. */
    { id: "missouri-red",    label: "Missouri Red",     cat: null, family: "red",   origin: "us", quoteOnly: true },
    { id: "salisbury-pink",  label: "Salisbury Pink",   cat: null, family: "rose",  origin: "us", quoteOnly: true },
    { id: "silver-cloud",    label: "Silver Cloud",     cat: null, family: "gray",  origin: "us", quoteOnly: true }
  ];

  /* ------------------------------------------------------------- finishes
   *
   * AFM's codes count polished faces. They are not a quality grade, and they
   * are AFM's vocabulary — another manufacturer numbers finishes differently.
   * Record the finish in plain words on the design; translate to the
   * supplier's code only on their order form.
   */
  var FINISHES = [
    { id: "p2", code: "P2", label: "Polished front and back",
      plain: "Polished front and back, rock top and sides", standardOn: ["die"] },
    { id: "p3", code: "P3", label: "Polished back, front and top",
      plain: "Polished front, back and top; rock sides" },
    { id: "p5", code: "P5", label: "All polish",
      plain: "Every face polished" },
    { id: "poltop", code: "Pol Top, BRP", label: "Polished top, balance rock pitched",
      plain: "Polished top, the rest rock pitched", standardOn: ["bevel6", "bevel8", "base"] },
    { id: "slantstd", code: "—", label: "Polished face, sawn back",
      plain: "Polished face, sawn back, 2in rock nosing, rock top and sides", standardOn: ["slant"] }
  ];

  /* ------------------------------------------------------------- products
   *
   * cols   — which price columns this table carries. Tables differ: flat
   *          markers and slants are quoted Cat 1/2/3/India, while bevels,
   *          dies and bases are quoted Cat 1/2/3/4.
   * sizes  — w is wholesale keyed by column. Extra keys per row are that
   *          product's own upgrades and are documented on the product.
   * form   — the shape stone.js should draw for this product.
   */
  var PRODUCTS = [
    {
      id: "flat", label: "Flat grass marker", form: "flat",
      blurb: "Set flush with the lawn so a mower passes over it. The cemetery section usually decides whether this is your only option.",
      cols: ["1", "2", "3", "india"],
      extras: [
        { id: "install",     label: "Setting in concrete",  from: "install" },
        { id: "noConcrete",  label: "Setting, no concrete", from: "noConcrete" }
      ],
      sizes: [
        { id: "16x8",  label: "16 × 8",  w: { "1": 340,   "2": 380,   "3": 435,   india: 455 },  install: 200, noConcrete: 110 },
        { id: "20x10", label: "20 × 10", w: { "1": 425,   "2": 480,   "3": 565,   india: 600 },  install: 255, noConcrete: 125 },
        { id: "24x12", label: "24 × 12", w: { "1": 545,   "2": 625,   "3": 755,   india: 800 },  install: 300, noConcrete: 140 },
        { id: "36x12", label: "36 × 12", w: { "1": 760,   "2": 880,   "3": 1070,  india: 1140 }, install: 400, noConcrete: 205 },
        { id: "28x16", label: "28 × 16", w: { "1": 725,   "2": 850,   "3": 1045,  india: 1120 }, install: 370, noConcrete: 205 },
        { id: "30x18", label: "30 × 18", w: { "1": 830,   "2": 980,   "3": 1215,  india: 1305 }, install: 400, noConcrete: 220 },
        { id: "48x12", label: "48 × 12", w: { "1": 960,   "2": 1120,  "3": 1370,  india: 1465 }, install: 555, noConcrete: 240 },
        { id: "40x16", label: "40 × 16", w: { "1": 1030,  "2": 1210,  "3": 1490,  india: 1595 }, install: 520, noConcrete: 270 },
        { id: "48x18", label: "48 × 18", w: { "1": 1295,  "2": 1535,  "3": 1915,  india: 2060 }, install: 610, noConcrete: 330 }
      ]
    },

    {
      id: "bevel6", label: "Bevel marker, 6in", form: "flat",
      blurb: "A low marker that stands a little proud of the lawn and slopes back, so the lettering catches light a flat marker misses.",
      finish: "poltop",
      cols: ["1", "2", "3", "4"],
      extras: [
        { id: "allPolish", label: "All polish", from: "allPolish" },
        { id: "install",   label: "Setting",    from: "install" }
      ],
      sizes: [
        { id: "20x10", label: "20 × 10", w: { "1": 525,  "2": 610,  "3": 730,  "4": 770 },  allPolish: 155, install: 345 },
        { id: "24x12", label: "24 × 12", w: { "1": 665,  "2": 790,  "3": 960,  "4": 1020 }, allPolish: 220, install: 400 },
        { id: "36x12", label: "36 × 12", w: { "1": 975,  "2": 1160, "3": 1415, "4": 1505 }, allPolish: 330, install: 525 },
        { id: "48x12", label: "48 × 12", w: { "1": 1210, "2": 1460, "3": 1805, "4": 1920 }, allPolish: 440, install: 700 }
      ]
    },

    {
      id: "bevel8", label: "Bevel marker, 8in", form: "flat",
      blurb: "The same marker in a thicker stone. It reads as more substantial from a standing height.",
      finish: "poltop",
      cols: ["1", "2", "3", "4"],
      extras: [
        { id: "allPolish", label: "All polish", from: "allPolish" },
        { id: "install",   label: "Setting",    from: "install" }
      ],
      sizes: [
        { id: "20x10", label: "20 × 10", w: { "1": 600,  "2": 700,  "3": 845,  "4": 900 },  allPolish: 175, install: 345 },
        { id: "24x12", label: "24 × 12", w: { "1": 765,  "2": 910,  "3": 1120, "4": 1195 }, allPolish: 250, install: 400 },
        { id: "36x12", label: "36 × 12", w: { "1": 1085, "2": 1300, "3": 1615, "4": 1735 }, allPolish: 370, install: 525 },
        { id: "48x12", label: "48 × 12", w: { "1": 1365, "2": 1655, "3": 2075, "4": 2230 }, allPolish: 495, install: 700 }
      ]
    },

    {
      id: "slant", label: "Slant marker", form: "slant",
      blurb: "Leans back off its own foot, so the inscribed face is turned up toward you as you stand there. Flat, oval or serpentine top.",
      finish: "slantstd",
      cols: ["1", "2", "3", "india"],
      /* A slant sits on a base like a die does, but unlike a die its setting
       * is priced in its own table rather than from the base — so the base
       * contributes stone only. The sheet says only "use sizes AA and BB"; the
       * pairing of the 24in slant to AA and the 36in to BB is the obvious one
       * (a base is always wider than what stands on it) but is an assumption,
       * not something AFM printed. Worth confirming. */
      needsBase: true, settingFromBase: false,
      extras: [
        { id: "inscrBack", label: "Inscription on the back", from: "inscrBack" },
        { id: "polBack",   label: "Polished back",           from: "polBack" },
        { id: "allPolish", label: "All polish",              from: "allPolish" },
        { id: "install",   label: "Setting",                 from: "install" }
      ],
      sizes: [
        { id: "24x16", label: "24 × 16", baseRef: ["AA"], w: { "1": 1015, "2": 1230, "3": 1445, india: 1560 },
          inscrBack: 300, polBack: 85,  allPolish: 420, install: 370 },
        { id: "36x16", label: "36 × 16", baseRef: ["BB"], w: { "1": 1480, "2": 1795, "3": 2120, india: 2290 },
          inscrBack: 450, polBack: 115, allPolish: 600, install: 490 }
      ]
    },

    {
      id: "die", label: "Upright monument", form: "upright",
      blurb: "The standing tablet most people picture. Always ordered with a base, and the base is what the installation price is calculated from.",
      finish: "p2",
      cols: ["1", "2", "3", "4"],
      needsBase: true,
      extras: [
        { id: "blastBack", label: "Inscription blasted on the back", from: "blastBack" },
        { id: "p5",        label: "All polish (P5)",                 from: "p5" }
      ],
      /* baseRef names which rows of BASES this die is cut to sit on. */
      sizes: [
        { id: "18x6x24", label: "18 × 6 × 24", baseRef: ["A"],        w: { "1": 895,  "2": 1060, "3": 1270, "4": 1415 }, blastBack: 330, p5: 190 },
        { id: "24x6x24", label: "24 × 6 × 24", baseRef: ["B", "C"],   w: { "1": 1145, "2": 1365, "3": 1645, "4": 1840 }, blastBack: 390, p5: 250 },
        { id: "24x6x30", label: "24 × 6 × 30", baseRef: ["B", "C"],   w: { "1": 1400, "2": 1675, "3": 2020, "4": 2270 }, blastBack: 450, p5: 300 },
        { id: "30x6x20", label: "30 × 6 × 20", baseRef: ["D"],        w: { "1": 1185, "2": 1415, "3": 1705, "4": 1910 }, blastBack: 400, p5: 250 },
        { id: "36x6x20", label: "36 × 6 × 20", baseRef: ["E"],        w: { "1": 1480, "2": 1755, "3": 2105, "4": 2350 }, blastBack: 540, p5: 300 },
        { id: "36x6x24", label: "36 × 6 × 24", baseRef: ["E"],        w: { "1": 1745, "2": 2075, "3": 2490, "4": 2790 }, blastBack: 615, p5: 360 },
        { id: "24x8x28", label: "24 × 8 × 28", baseRef: ["AA"],       w: { "1": 1540, "2": 1855, "3": 2380, "4": 2535 }, blastBack: 450, p5: 330 },
        { id: "36x8x24", label: "36 × 8 × 24", baseRef: ["BB"],       w: { "1": 1985, "2": 2385, "3": 3040, "4": 3180 }, blastBack: 600, p5: 390 },
        { id: "42x8x28", label: "42 × 8 × 28", baseRef: ["BB", "CC"], w: { "1": 2540, "2": 3040, "3": 3905, "4": 4195 }, blastBack: 750, p5: 535 },
        { id: "48x8x28", label: "48 × 8 × 28", baseRef: ["CC", "DD"], w: { "1": 2850, "2": 3425, "3": 4335, "4": 4670 }, blastBack: 830, p5: 600 }
      ]
    },

    {
      id: "bench", label: "Granite bench", form: "bench",
      blurb: "Somewhere to sit with them rather than stand over them. Cemeteries vary on whether a bench is allowed at the grave or only in a garden section.",
      /* Benches are priced by named colour, not by category, and installation
       * on a bench carries NO markup. Both are handled in price(). */
      byColour: true,
      sizes: [
        { id: "traditional", label: "Traditional, 48 × 14 × 4 seat, harp legs",
          colours: { "gray": 2310, "plum-rose": 3060, "black": 3060 }, install: 450 },
        { id: "garden-bevel", label: "Garden, 48 × 20 × 33, bevel back",
          colours: { "gray": 3875, "plum-rose": 3875, "pacific-coral": 3875, "black": 5063 }, install: 600 },
        { id: "garden-flat", label: "Garden, flat back",
          colours: { "gray": 3063, "black": 4063 }, install: 600 }
      ],
      warn: "Check the timeframe with AFM on every bench order."
    }
  ];

  /* Bench colours are their own short list — the sheet names four, not the
   * twenty granite colours above. */
  var BENCH_COLOURS = [
    { id: "gray",          label: "Gray",          family: "gray" },
    { id: "plum-rose",     label: "Plum Rose",     family: "rose" },
    { id: "pacific-coral", label: "Pacific Coral", family: "rose" },
    { id: "black",         label: "Black",         family: "black" }
  ];

  /* ---------------------------------------------------------------- bases
   * Installation is calculated from the base, not the die. An oversize
   * foundation adds 15% to base installation.
   */
  var BASES = [
    { id: "A",  label: "24 × 12 × 6", w: { "1": 400,  "2": 485,  "3": 690,  "4": 760 },  polish: 185, install: 535 },
    { id: "C",  label: "30 × 12 × 6", w: { "1": 480,  "2": 585,  "3": 840,  "4": 930 },  polish: 215, install: 620 },
    { id: "B",  label: "34 × 12 × 6", w: { "1": 530,  "2": 655,  "3": 945,  "4": 1040 }, polish: 230, install: 670 },
    { id: "D",  label: "40 × 12 × 6", w: { "1": 615,  "2": 755,  "3": 1095, "4": 1215 }, polish: 265, install: 750 },
    { id: "E",  label: "48 × 12 × 6", w: { "1": 745,  "2": 920,  "3": 1325, "4": 1465 }, polish: 305, install: 860 },
    { id: "AA", label: "30 × 14 × 6", w: { "1": 545,  "2": 670,  "3": 970,  "4": 1070 }, polish: 225, install: 690 },
    { id: "BB", label: "42 × 14 × 6", w: { "1": 740,  "2": 915,  "3": 1330, "4": 1475 }, polish: 305, install: 870 },
    { id: "E2", label: "48 × 14 × 6", ref: "E",  w: { "1": 855,  "2": 1055, "3": 1530, "4": 1695 }, polish: 315, install: 965 },
    { id: "AA8",  label: "30 × 14 × 8", ref: "AA", w: { "1": 690,  "2": 845,  "3": 1200, "4": 1320 }, polish: 240, install: 690 },
    { id: "AA8b", label: "34 × 14 × 8", ref: "AA", w: { "1": 770,  "2": 940,  "3": 1350, "4": 1485 }, polish: 240, install: 745 },
    { id: "BB8",  label: "48 × 14 × 8", ref: "BB", w: { "1": 1070, "2": 1315, "3": 1890, "4": 2080 }, polish: 340, install: 965 },
    { id: "CC",   label: "54 × 14 × 8", w: { "1": 1190, "2": 1465, "3": 2110, "4": 2325 }, polish: 380, install: 1065 },
    { id: "DD",   label: "60 × 14 × 8", w: { "1": 1310, "2": 1610, "3": 2330, "4": 2570 }, polish: 420, install: 1155 }
  ];

  var OVERSIZE_FOUNDATION = 0.15;   // added to base installation only

  /* ------------------------------------------------------------- add-ons */

  /* Colour porcelain. Black and white is 75% of the colour price. Installation
   * is included when bought with a memorial; onto an existing memorial it is
   * $150 for 4in or less, larger by quote. */
  var PORCELAIN = [
    { id: "OC-3",  shape: "Oval",        size: "2.25 × 2.75", w: 210 },
    { id: "OC-4",  shape: "Oval",        size: "2.625 × 3.375", w: 220 },
    { id: "OC-5",  shape: "Oval",        size: "3.25 × 4.25", w: 245 },
    { id: "OC-6",  shape: "Oval",        size: "3.75 × 5",    w: 260 },
    { id: "OC-7",  shape: "Oval",        size: "3.94 × 5.13", w: 275 },
    { id: "OC-8",  shape: "Oval",        size: "4.25 × 6",    w: 280 },
    { id: "OC-9",  shape: "Oval",        size: "5 × 7",       w: 305 },
    { id: "OC-11", shape: "Oval",        size: "8 × 10",      w: 465 },
    { id: "RC-1",  shape: "Round",       size: "3.54",        w: 245 },
    { id: "RC-2",  shape: "Round",       size: "6",           w: 315 },
    { id: "HC-1",  shape: "Heart",       size: "4 × 4",       w: 245 },
    { id: "HC-2",  shape: "Heart",       size: "6 × 6",       w: 315 },
    { id: "RT-1",  shape: "Rectangular", size: "3.54 × 4.72", w: 260 },
    { id: "RT-2",  shape: "Rectangular", size: "5.13 × 7.09", w: 305 },
    { id: "ST-1",  shape: "Square",      size: "3.93 × 3.93", w: 245 },
    { id: "ST-6",  shape: "Square",      size: "6 × 6",       w: 315 }
  ];
  var PORCELAIN_BW = 0.75;
  var PORCELAIN_RETROFIT = { small: 150, note: "4in or less onto an existing memorial; larger by quote." };

  var VASES = [
    { id: "perma",        label: "Perma Vase, vase only",                          w: 85 },
    { id: "perma-block",  label: "Perma Vase set in a concrete block, installed",  w: 150 },
    { id: "bronze-6",     label: "Bronze vase, 6in core hole, bottom mounted",     w: 600 },
    { id: "granite-block",label: "Granite vase block 12 × 12, Cat 1, installed",   w: 350,
      note: "Includes the Perma Vase." },
    { id: "surround-1",   label: "Perma Vase, granite surround 12 × 12 with inscription — Cat 1", w: 485 },
    { id: "surround-2",   label: "— Cat 2", w: 540 },
    { id: "surround-3",   label: "— Cat 3", w: 600 },
    { id: "surround-4",   label: "— Cat 4", w: 625 },
    { id: "turned",       label: "Turned, inverted and taper vases", quoteOnly: true }
  ];

  /* Standard/stock art is included in every marker price. Only custom art and
   * portraits carry the $25. Foreign lettering is free. */
  var ARTWORK = [
    { id: "standard", label: "Standard artwork", w: 0,
      note: "Included in the marker price." },
    { id: "custom",   label: "Custom artwork or portrait", w: 25 },
    { id: "foreign",  label: "Foreign lettering", w: 0,
      note: "No charge." },
    { id: "etch",     label: "Photo etching", w: null, requires: "etchable",
      note: "Black granite only." }
  ];

  var INSCRIPTIONS = [
    { id: "final-date",  label: "Final date only",                       w: 190, without: 240 },
    { id: "name-dates",  label: "Name and dates",                        w: 220, without: 270 },
    { id: "emblem",      label: "Emblems or porcelains inserted",        w: 150 },
    { id: "niche",       label: "Niche engraving to 12 × 12, incl. name, dates and art", w: 260 },
    { id: "full",        label: "Full monument inscription", quoteOnly: true }
  ];

  /* --------------------------------------------------------- lead times */
  var LEAD_TIMES = {
    us:       { label: "3–4 months",  note: "Standard granite receipt." },
    overseas: { label: "7–10 months", note: "India or China manufactured." },
    inscription: { label: "6–8 weeks", note: "Weather dependent." }
  };

  /* --------------------------------------------- categories with no price
   *
   * Roughly half the product list Brandon named is here: a category name and
   * a vendor, with no sheet behind it. The rule is absolute — flag as pending
   * a supplier quote and never estimate. A guessed number that reaches a
   * grieving family and then moves is worse than no number.
   */
  var QUOTE_ONLY = [
    { id: "cast-glass",   label: "Cast glass",              vendor: "Lundgren Monuments",     url: "lundgrenmonuments.com" },
    { id: "glass-art",    label: "Glass art",               vendor: "OMS",                    url: "myomstone.com/glass-art" },
    { id: "stained-glass",label: "Stained glass",           vendor: null,                     url: null },
    { id: "granite-inlay",label: "Granite inlay",           vendor: "Pacific Coast Memorials", url: "pacificcoastmemorials.com" },
    { id: "glass-inlay",  label: "Glass inlay",             vendor: "Pacific Coast Memorials", url: "pacificcoastmemorials.com" },
    { id: "bronze-inlay", label: "Bronze inlays and medallions", vendor: "Matthews Cemetery Products", url: "matthewscemeteryproducts.com" },
    { id: "bronze",       label: "Bronze",                  vendor: "Matthews Cemetery Products", url: "matthewscemeteryproducts.com" },
    { id: "pedestal",     label: "Cremation pedestals",     vendor: "Matthews Granite",       url: "matthewsgranite.com" },
    { id: "statuary",     label: "Statuary",                vendor: "Matthews Granite",       url: "matthewsgranite.com" },
    { id: "custom-shape", label: "Custom shape work",       vendor: "Monuments.com",          url: "monuments.com" },
    { id: "outside-metro",label: "Installation outside the Portland Metro area", vendor: "Affordable Family Memorials", url: null }
  ];

  /* ------------------------------------------------------------ lettering
   *
   * PLACEHOLDER, and worth saying so plainly. A real monument order names a
   * specific alphabet out of the manufacturer's book — not "Traditional".
   * These four are web fonts standing in until AFM's lettering chart is in
   * hand, and any order form generated from them needs a human to pick the
   * real alphabet. Same story for the emblems in stone.js.
   */
  var LETTERING = [
    { id: "traditional", label: "Traditional", placeholder: true,
      css: 'ui-serif, "Iowan Old Style", Georgia, serif', weight: 600, track: ".02em" },
    { id: "modern", label: "Modern", placeholder: true,
      css: 'system-ui, "Segoe UI", Helvetica, Arial, sans-serif', weight: 500, track: ".06em" },
    { id: "script", label: "Script", placeholder: true,
      css: '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive', weight: 500, track: ".01em" },
    { id: "gothic", label: "Gothic", placeholder: true,
      css: '"UnifrakturCook", "Old English Text MT", Luminari, serif', weight: 600, track: ".01em" }
  ];

  /* ================================================================ AFM */

  var AFM = {
    id: "afm",
    name: "Affordable Family Memorials",
    contact: { people: "Angie & Jason Pope", phone: "503-515-7640",
               email: "afmemorials@comcast.net",
               address: "6615 SE Harold St, Portland, OR 97206" },
    sheet: "Wholesale Price Guide for 2025, dated 1 Feb 2025",
    region: "Portland Metro, Oregon — anything outside is quote only",
    /* Suggested retail. The Partner may set its own — Agreement §6.8. */
    markup: 2.5,
    /* Free proofs are a selling point worth repeating to families: it removes
     * the pressure to settle for a design they are not sure about. */
    freeProofs: true,
    colours: COLOURS, benchColours: BENCH_COLOURS, finishes: FINISHES,
    products: PRODUCTS, bases: BASES, porcelain: PORCELAIN, vases: VASES,
    artwork: ARTWORK, inscriptions: INSCRIPTIONS, lettering: LETTERING,
    leadTimes: LEAD_TIMES, quoteOnly: QUOTE_ONLY,
    oversizeFoundation: OVERSIZE_FOUNDATION,
    porcelainBW: PORCELAIN_BW, porcelainRetrofit: PORCELAIN_RETROFIT
  };

  /* Other suppliers are declared but empty. That is deliberate: an empty
   * profile makes the shape of the missing information visible, so the ask to
   * each vendor is a list rather than a vague request. */
  function stub(id, name, url, sells) {
    return { id: id, name: name, url: url, sells: sells, markup: 2.5,
             colours: [], products: [], bases: [], quoteOnly: [],
             lettering: [], leadTimes: {},
             needs: ["price sheet", "shape and size list", "colour and finish names",
                     "minimum stroke width and inscription depth", "lead time", "order form"] };
  }

  var SUPPLIERS = {
    afm: AFM,
    lundgren:     stub("lundgren", "Lundgren Monuments", "lundgrenmonuments.com", ["Cast glass"]),
    oms:          stub("oms", "OMS", "myomstone.com/glass-art", ["Glass art"]),
    pacificcoast: stub("pacificcoast", "Pacific Coast Memorials", "pacificcoastmemorials.com", ["Granite inlay", "Glass inlay"]),
    matthews:     stub("matthews", "Matthews Cemetery Products", "matthewscemeteryproducts.com", ["Bronze", "Bronze inlays and medallions"]),
    matthewsgranite: stub("matthewsgranite", "Matthews Granite", "matthewsgranite.com", ["Cremation pedestals", "Statuary"]),
    monuments:    stub("monuments", "Monuments.com", "monuments.com", ["Granite benches", "Custom work"])
  };

  var DEFAULT_SUPPLIER = "afm";

  /* ============================================================= lookups */

  function supplier(id) { return SUPPLIERS[id || DEFAULT_SUPPLIER] || AFM; }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function colour(id, sup) { return byId(supplier(sup).colours, id); }
  function product(id, sup) { return byId(supplier(sup).products, id); }
  function base(id, sup)    { return byId(supplier(sup).bases, id); }

  function size(productId, sizeId, sup) {
    var p = product(productId, sup);
    return p ? byId(p.sizes, sizeId) : null;
  }

  /* Colours grouped for a picker: category order, quote-only last. */
  function coloursByCategory(sup) {
    var out = [], seen = {};
    supplier(sup).colours.forEach(function (c) {
      var k = c.quoteOnly ? "quote" : String(c.cat);
      if (!seen[k]) { seen[k] = { key: k, label: c.quoteOnly ? "Priced on request" : "Category " + c.cat, colours: [] }; out.push(seen[k]); }
      seen[k].colours.push(c);
    });
    return out;
  }

  /* Products the supplier prices for a given rendered shape. Several products
   * share one shape — a flat marker and both bevels are all drawn lying in the
   * lawn — so this returns a list, and a shape with nothing behind it (heart,
   * cross, plaque, serpentine) returns empty, which is the honest answer:
   * those are custom shape work and carry no published price. */
  function productsForForm(formId, sup) {
    return supplier(sup).products.filter(function (p) { return p.form === formId; });
  }

  /* Every priced size across the products sharing one shape, flattened for a
   * single picker. The label is qualified by product only when more than one
   * product is in play, so an upright reads "24 x 6 x 24" rather than
   * "Upright monument - 24 x 6 x 24". */
  function sizesForForm(formId, sup) {
    var ps = productsForForm(formId, sup), many = ps.length > 1, out = [];
    ps.forEach(function (p) {
      p.sizes.forEach(function (s) {
        out.push({ product: p.id, size: s.id, def: s,
                   label: many ? p.label + " \u2014 " + s.label : s.label });
      });
    });
    return out;
  }

  /* Bases a given die size is cut to sit on. */
  function basesFor(productId, sizeId, sup) {
    var s = size(productId, sizeId, sup);
    if (!s || !s.baseRef) return [];
    var all = supplier(sup).bases;
    return all.filter(function (b) {
      return s.baseRef.indexOf(b.ref || b.id) !== -1;
    });
  }

  /* ============================================================= pricing
   *
   * priceColumn — which column of a size table a colour reads.
   *
   * The one genuinely ambiguous rule on the sheet. Category 4 is printed as
   * "4 / India", and the flat-marker and slant tables carry an "India" column
   * priced ABOVE Cat 3 — so on those tables, India is the Cat 4 column. But
   * the sheet also says all India colours and Melrose Black manufactured
   * overseas take Cat 2 prices with overseas lead times, and that
   * US-manufactured Gold Star Black and Imperial Red take Cat 4.
   *
   * Read literally that means Gold Star Black is Cat 4 when cut in the US and
   * Cat 2 when cut overseas, which is the reading implemented here via
   * `overseasCat`. It is worth confirming with AFM before a real order goes
   * out on it — the two prices differ by roughly a third.
   */
  function priceColumn(col, cols, manufacture) {
    var cat = col.cat;
    if (cat == null) return null;                       // quote only
    if (manufacture === "overseas" && col.overseasCat) cat = col.overseasCat;
    var key = String(cat);
    if (cols.indexOf(key) !== -1) return key;
    /* Tables that print "india" instead of a 4th numbered column. */
    if (key === "4" && cols.indexOf("india") !== -1) return "india";
    /* A Cat 4 colour on a table that stops at 3 has no published price. */
    return null;
  }

  function leadTimeFor(col, sup) {
    var lt = supplier(sup).leadTimes;
    return col && col.origin === "overseas" ? lt.overseas : lt.us;
  }

  /* price(spec) -> { lines, wholesale, retail, quotes, leadTime, ok }
   *
   * spec: { supplier, product, size, colour, base, extras[], manufacture,
   *         oversizeFoundation, markup }
   *
   * Every line carries both numbers so a Partner-facing view can show margin
   * and a family-facing view can show retail only. Callers must never render
   * `wholesale` to a family.
   *
   * `quotes` collects anything with no published price. A spec that produces
   * quotes is still returned — the design is orderable, the number just is not
   * known yet — but `ok` is false so callers can refuse to present a total.
   */
  function price(spec) {
    spec = spec || {};
    var sup    = supplier(spec.supplier);
    var markup = typeof spec.markup === "number" ? spec.markup : sup.markup;
    var p      = product(spec.product, spec.supplier);
    var lines  = [], quotes = [], wholesale = 0, retail = 0;

    function add(label, w, mk) {
      var m = typeof mk === "number" ? mk : markup;
      wholesale += w; retail += w * m;
      lines.push({ label: label, wholesale: w, retail: w * m, markup: m });
    }

    if (!p) return { lines: [], wholesale: 0, retail: 0, quotes: ["Unknown product"], ok: false };

    var s = byId(p.sizes, spec.size) || p.sizes[0];
    var col;

    /* ---- benches: priced by their own colour list, install unmarked-up ---- */
    if (p.byColour) {
      col = byId(sup.benchColours, spec.colour) || sup.benchColours[0];
      var bw = s.colours[col.id];
      if (bw == null) {
        quotes.push(p.label + ", " + s.label + " in " + col.label);
      } else {
        add(p.label + " — " + s.label + ", " + col.label, bw);
      }
      /* Agreement aside: this is the one line on the whole sheet that is
       * passed through at cost. Marking it up would be a quiet error worth
       * hundreds of dollars, so it is spelled out rather than defaulted. */
      if (spec.extras && spec.extras.indexOf("install") !== -1 && s.install) {
        add("Setting — " + s.label, s.install, 1.0);
      }
      return finish();
    }

    /* ---- everything else: category-column pricing ---- */
    col = colour(spec.colour, spec.supplier) || sup.colours[0];
    var mfr = spec.manufacture || col.origin || "us";
    var key = priceColumn(col, p.cols, mfr);

    if (key === null) {
      quotes.push(p.label + " in " + col.label);
    } else {
      add(p.label + " — " + s.label + ", " + col.label, s.w[key]);
    }

    /* Neither a die nor a slant is ordered alone: the base is a separate line
     * of granite. For a die the base is also what installation is priced from;
     * a slant carries its own setting price, so settingFromBase turns that
     * half off and the product's own install extra covers it. */
    var b = null;
    if (p.needsBase) {
      var options = basesFor(p.id, s.id, spec.supplier);
      b = (spec.base && base(spec.base, spec.supplier)) || options[0] || null;
      if (b) {
        var bkey = priceColumn(col, ["1", "2", "3", "4"], mfr);
        if (bkey === null) quotes.push("Base " + b.label + " in " + col.label);
        else add("Base — " + b.label + ", " + col.label, b.w[bkey]);

        if (p.settingFromBase !== false) {
          var inst = b.install;
          if (spec.oversizeFoundation) inst = Math.round(inst * (1 + sup.oversizeFoundation));
          add("Setting" + (spec.oversizeFoundation ? " (oversize foundation)" : ""), inst);
        }
      }
    }

    (spec.extras || []).forEach(function (ex) {
      var def = p.extras ? byId(p.extras, ex) : null;
      if (!def) return;
      var amt = s[def.from];
      if (amt == null) { quotes.push(def.label); return; }
      add(def.label, amt);
    });

    return finish();

    function finish() {
      return {
        lines: lines,
        wholesale: wholesale,
        retail: Math.round(retail),
        quotes: quotes,
        ok: quotes.length === 0,
        leadTime: leadTimeFor(col, spec.supplier),
        colour: col,
        size: s,
        base: b || null,
        product: p
      };
    }
  }

  /* Retail for a single wholesale figure — for add-ons priced outside price(). */
  function retail(w, sup, markup) {
    var m = typeof markup === "number" ? markup : supplier(sup).markup;
    return Math.round(w * m);
  }

  /* How many distinct orderable combinations a supplier carries, before
   * lettering, emblems and add-ons. Used by the preview page to make the point
   * that the catalogue is deep and what the family sees is not. */
  function combinationCount(sup) {
    var s = supplier(sup), n = 0;
    s.products.forEach(function (p) {
      if (p.byColour) {
        p.sizes.forEach(function (z) { n += Object.keys(z.colours).length; });
        return;
      }
      var colours = s.colours.filter(function (c) {
        return p.sizes.length && priceColumn(c, p.cols, c.origin) !== null;
      }).length;
      n += p.sizes.length * colours;
    });
    return n;
  }

  return {
    SUPPLIERS: SUPPLIERS, DEFAULT_SUPPLIER: DEFAULT_SUPPLIER,
    supplier: supplier, colour: colour, product: product, base: base,
    size: size, basesFor: basesFor, coloursByCategory: coloursByCategory,
    productsForForm: productsForForm, sizesForForm: sizesForForm,
    priceColumn: priceColumn, leadTimeFor: leadTimeFor,
    price: price, retail: retail, combinationCount: combinationCount,
    byId: byId
  };
})();
