# Brownstone kit — shared brief for asset-sheet artboards

You are drawing asset sheets for "Flats", a cosy mobile workout game for friends. Each friend has a flat in one
brownstone building on a night street. Logging a workout earns a present (tier 1/2/3 by workouts that week) holding
furniture/decor; you place items into slots in a one-point-perspective room cutaway. A pet lives in the flat
(kinds: cat, dog, bunny, frog, duck; moods: perky = worked out today, content, sleepy = 7+ days idle). Plants grow
3 stages (0,1,2 at 0/2/5 workouts after unpacking). Cosiness titles by items placed: 0 "Bare little box", 1 "Moving in",
3 "Getting homey", 6 "Snug nook", 9 "Cosy nest", 13 "Dreamy den", 17 "Storybook flat". Friends visit and leave a
heart, star or treat (one each per day); stars stay on the window frame seen from the street; the pet eats treats.
Item zones: ceiling, wall, wallTop, window, sill, floor, rug. Items have palettes with colour roles p (primary),
s (shade), a (accent). No punishment for missed weeks.

## The Brownstone look (the user loves it — match it closely)
Detailed, realistic, adult, warm. Night. Dark-academia interiors. The signature is LIGHT:
- A cold moonlit window: cool blue-white patch on the floor with mullion shadows + a faint shaft (#9FB6E8-ish, low opacity).
- Warm lamp light: radial gradients #FFC77A (0.9) -> #FF9F45 (0.35) -> #FF8A30 (0), drawn in a `<g style="mix-blend-mode: screen">`.
- A darkness layer: `<rect fill="#080504" opacity="0.6" mask="url(#xxDark)">` where the mask is a white rect plus
  black radial-gradient "holes" at each light source, so lit corners stay bright.
- Early/bare rooms get a cool multiply tint (#22304E); homey rooms get none.
- Vignette + film grain: `<filter id="xxGrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"></feTurbulence><feColorMatrix type="saturate" values="0"></feColorMatrix><feComponentTransfer><feFuncA type="linear" slope="0.18"></feFuncA></feComponentTransfer></filter>` on a rect with `style="mix-blend-mode: overlay"`.
- Materials: cognac leather (#B56A38 -> #8C4422 -> #4E2410), brass (#F0CF86 -> #B5893F -> #6E4E1E), walnut (#5A3820 -> #2E1B0F),
  oxblood velvet (#6E2222 / #3A1010), mustard velvet (#C08A3E), bottle-green walls (#1E2F25 -> #2E4636), navy (#23304A),
  terracotta limewash (#A8583A-ish), plum (#3D2A40), cream knit (#E6D8C0). Use gradients for form, small highlights, and
  soft contact shadows (dark ellipses, low opacity) under every object. Intricate details: tufting, piping, wood grain,
  book spines of varied heights/colours, leaf veins, fabric folds.
- UI chrome: background #120D0A, text #F3E6D0, secondary #B8A68A, tertiary #9C8B70, amber accent #E8A24A
  (button gradient #F0B25C -> #D98F37 with dark text #1D130B). Fonts: Fraunces (display, 500/600, italic allowed) and DM Sans (UI).

Reference boards (READ at least Brownstone-Homey.dc.html and one other before drawing, to copy technique and quality):
/private/tmp/claude-501/-Users-npechuk-src-nirpechuk-github-io/ff7cd458-7790-407f-b76c-3df01713412c/scratchpad/flats-canvas/project/
  Brownstone-Street.dc.html (street + building), Brownstone-Day1 / -Unpacked / -Settled / -Homey (my flat, 4 stages),
  Brownstone-Maya (oxblood jazz den, shutters, pierced lantern), -Priya (terracotta conservatory, arched window, wicker),
  -Theo (navy atelier, easel, filament bulbs, greyhound).
Room projection used in all flats (390x600 SVG): P(X,Y,Z) = [195 + X*s, 280 + (1.92 - Y)*s], s = 62.5*5/(5 - Z).
Back wall rect 70,120 -> 320,400. Floor polygon 0,466.9 70,400 320,400 390,466.9 390,600 0,600. Left wall 0,30.4 70,120 70,400 0,466.9.

## Asset-sheet board layout (all sheets share this so the kit reads as one system)
- Root: `<div style="position: relative; width: 1440px; height: 900px; overflow: hidden; background: #120D0A; color: #F3E6D0; font-family: 'DM Sans', system-ui, sans-serif">` (height = the board's h).
- Header at top-left, padding 48px 56px: eyebrow (11px, letter-spacing 0.14em, uppercase, #C9A27A) like "Brownstone kit · 05 · Light";
  H1 in Fraunces 600 40px; one-sentence description 15px #B8A68A, max-width ~720px. Optional legend chips on the right.
- Content: a grid of cards (display grid, gap 16-20px). Card: background #1A130F, 1px border rgba(243,230,208,0.08), radius 14px,
  holding a "stage" (an inline SVG with its own small dark backdrop — a hint of wall + floor + soft light) and a caption:
  name in Fraunces 500 16px, then a meta line 12px #9C8B70 (e.g. "lighting · ceiling · tier 1 · light r 70 · 2400K").
  Use the real catalogue names/ids where an item exists (list below); mark new proposals with a small "new" tag
  (11px, #E8A24A text, 1px #E8A24A55 border, radius 999px). Show palette variants as 3 small swatch dots where useful.
- Fill the board richly — this is a "bunch of assets" kit — but keep breathing room; nothing clipped at the edges.

## Format rules (the canvas silently breaks if these are broken)
Each board is ONE file `<root>/project/<Name>.dc.html` with exactly this skeleton:
```
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Short name</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&amp;family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&amp;display=swap" rel="stylesheet">
<style>
body{margin:0}
a{color:#E8A24A}a:hover{color:#ffd28f}
</style>
</helmet>
<div style="...root...">
  ... markup ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
```
- Close EVERY non-void element explicitly, including SVG shapes: `<circle ...></circle>`, `<path ...></path>`, `<stop ...></stop>`. No self-closing `/>`.
- Quote every attribute. Inline `style="..."` for layout; `<helmet><style>` only for body/a basics.
- All SVG ids must be unique within the file AND prefixed with the board's 2–3 letter code (e.g. `lcWarm`, `lcGrain`) because boards may be imported together.
- No emoji, no `<iframe>`, no external images, no JS that builds DOM. `{{hole}}` is a plain dotted lookup into renderVals only;
  static markup is preferred. If you repeat with `<sc-for list="{{items}}" as="it" hint-placeholder-count="N">`, compute everything
  (including style strings) in renderVals. Keep the script block exactly as shown otherwise.
- Accessibility: decorative SVG `aria-hidden="true"`; illustration SVGs `role="img" aria-label="..."`. Real `<button>` for buttons.
- Text contrast >= 4.5:1 for small text on the dark ground (the colours above pass).
- Write each file directly with the Write tool. Do NOT publish, render, screenshot, open a browser, or verify. Do not touch any git repo.
  Do not read or modify other boards' files in brownstone-kit/project except your own.

## Real catalogue (src/game/catalog.json) — id | category | tier | zones | palettes
floor-cushion furniture t1 floor (Oxblood velvet, Emerald velvet, Ochre linen) · succulent-pot plants t1 sill/floor grow ·
wooden-stool t1 · plain-curtains textiles t1 window (Oatmeal linen, Midnight, Rust) · paper-lantern lighting t1 ceiling (Rice paper, Amber, Rose) ·
woven-rug rugs t1 · mountain-poster wallart t1 · wall-clock t1 (Brass, Black, Emerald) · crate-shelf t1 · side-table t1 (Walnut, Black marble, Brass) ·
floor-lamp lighting t1 floor (Linen & brass, Emerald & black, Oxblood) · eucalyptus-garland plants t1 wallTop ·
comfy-sofa t2 (Emerald velvet, Oxblood velvet, Midnight velvet, Cognac leather) · armchair t2 (Cognac, Teal velvet, Plum) ·
monstera plants t2 floor grow · hanging-pothos plants t2 ceiling grow (Macramé, Terracotta, Smoke glass) · floral-curtains t2 window ·
gallery-trio wallart t2 (Gilt, Black frames, Walnut) · tall-bookshelf t2 · arc-lamp lighting t2 (Brass, Black, Copper) · striped-rug t2 (Kilim, Indigo, Moss) ·
tiny-tv tech t2 · pet-bed t2 (Wool, Moss, Rust) · wall-shelf t2 · yarn-basket whimsy t2 · record-player tech t3 (Walnut, Oxblood, Teal) ·
tiny-aquarium t3 · canopy-bed t3 (Midnight, Oxblood, Moss) · fairy-lights lighting t3 wallTop (Warm, Ember, Starlight) · garden-door t3 ·
lava-lamp lighting t3 floor/sill · fireplace t3 floor light (Emerald tile, Oxblood tile, Plaster) · globe-chandelier lighting t3 ceiling ·
egg-chair t3 (Rattan, Black cane, Natural) · telescope tech t3 · seasonal: pumpkin, tiny-tree (light), dried-roses, blossom-vase, summer-fan ·
surprise: neon-moon (wall light; Rose neon, Amber neon), snail-terrarium · candle-cluster lighting t1 sill/floor (Ivory, Black, Oxblood) ·
bar-cart t2 · pressed-flowers t1 · postcard-string t1 · woven-wall-hanging t1 · scalloped-mirror t2 · cuckoo-clock t2 · quilt-bunting t2.
Surfaces: walls — Bare plaster #4a3f45 (starter), Oxblood stripe #5a2a30/#4c2328, Midnight dots #23304a+#c9a96b, Moss tweed #33473b,
Night sky #1d2340+#e0c07a, Plum scallop #3d2a40/#57405a, Botanical #1f3a32/#4f7a5e/#c98f6d. Floors — Bare boards #3b2f2a (starter),
Walnut planks, Bistro tiles #2a2526/#c9b9a3, Herringbone parquet #7a5236/#5e3f2a, Dark terrazzo.

## Design direction notes from the writeup (keep consistent)
Stages: Day 1 (bare, cold bulb, moonlight dominant) -> Unpacked (paper shade, tripod lamp + mustard armchair = first warm pool) ->
Settled (bottle-green paint, velvet curtains narrow the moonlight, items carry over) -> Homey (many small warm sources; moon is an accent).
Lighting model: every light item has position, radius, warmth (K) and a pattern; it cuts a hole in the darkness layer. Darkness ~0.66 + cool
tint on Day 1 easing to ~0.55 and amber when homey. Curtains/shutters/blinds SHAPE the moonlight. Missed weeks dim lamps toward candle level;
nothing is ever lost. Variety levers: wall colour (green, oxblood, terracotta, navy, ochre, plum), one hero piece per flat, signature light
pattern, window position fixed by unit (left / centre / right), floor + rug, auto-matched item palettes.

When done, reply with 2–4 lines per board: what is on it. Nothing else.
