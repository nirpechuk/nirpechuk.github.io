# Brownstone design kit (raw exports)

Design exploration for the "Brownstone" visual direction of Flats. Nothing here is wired into the app or the site build
(`apps/` is excluded from Jekyll, and this folder is in `.prettierignore`). Files are kept exactly as exported.

- `spec.html` — the formal design writeup: lighting model, four-stage progression, variety levers, street, asset
  inventory, implementation notes, open questions. A page body only; it relies on a host adding the doctype/head.
- `canvas/` — every artboard from the design canvas, as `.dc.html` files, plus `canvas.json` (board positions, titles,
  section notes).
- `asset-brief.md` — the shared brief the asset sheets were drawn from (palette, lighting technique, room projection,
  catalogue references).

## The `.dc.html` format

Each board is plain HTML with inline styles and hand-written inline SVG, inside a thin design-canvas wrapper:

- `<script src="./support.js"></script>` in `<head>` (the canvas runtime; not included here),
- `<x-dc>` around the content, with a `<helmet>` block holding the Google Fonts links and basic styles,
- a trailing `<script type="text/x-dc" data-dc-script>` with a `DCLogic` class whose `renderVals()` returns `{}`.

No board uses template holes, loops or conditionals, so stripping the wrapper (drop `support.js`, unwrap `x-dc`, move
the `helmet` contents into `<head>`, drop the `text/x-dc` script) yields a static page that renders the same.

## Boards

| Section | Files |
| --- | --- |
| Cover | `Main` |
| Showcases | `Brownstone-Street`, `-Day1`, `-Unpacked`, `-Settled`, `-Homey`, `-Maya`, `-Priya`, `-Theo` |
| City and building | `City-Skyline`, `Street-States`, `Building-Parts` |
| Windows and moonlight | `Windows-Glow`, `Windows-Treatments`, `Moonlight-Shapes` |
| Furniture | `Furniture-Seating`, `Furniture-Storage` |
| Light | `Lights-Catalog`, `Light-System` |
| Plants, textiles, art | `Decor-Plants`, `Decor-Textiles-Art` |
| Pets | `Pets-Moods`, `Pets-Moments` |
| Surfaces and colour | `Surfaces`, `Palette-Harmony` |
| Presents and interface | `Presents`, `UI-Kit`, `Flow-PlaceLamp` |

Showcase phones are 390×844; asset sheets are 1440×900 (`Flow-PlaceLamp` 1440×960, `Brownstone-Street` 1440×800).

## Things that are invented, not from the game

Proposed items are tagged "new" on the sheets. Also made up for the mockups: tiers and ids for wallpapers and floors,
the stage item counts (0 / 6 / 14 / 23), the light specs (radius, kelvin, pattern), the "frames itself at Getting homey"
poster rule, seasonal labels on blossom-vase and dried-roses, and the 8 → 9 items story in `Flow-PlaceLamp`.
