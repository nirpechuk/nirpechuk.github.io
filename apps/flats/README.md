# Flats

A cosy workout game for friends. Log a workout with one tap, unpack a present, furnish
your flat, and watch your window glow brighter in the shared building. Live at
[nirpechuk.github.io/flats](https://nirpechuk.github.io/flats/). Design notes are in
[DESIGN.md](DESIGN.md).

Right now the app runs in **device-only mode**: everything is saved in the browser's
localStorage, and three labelled demo neighbours keep the building lively. Several
people can share one device (Settings → Add a player). Cross-device groups arrive with
the online backend (see below).

## Run it

```bash
cd apps/flats
npm install
npm run dev        # http://localhost:5173/flats/
npm test           # game rules, catalogue validation, local backend
```

Add `?hour=21` to the URL to preview night lighting (any hour 0–23 works).

## Deploy

```bash
cd apps/flats
npm run build      # type-checks, builds into ../../flats/, adds Jekyll front matter
```

Commit `apps/flats` and the rebuilt `flats/` folder and push to `main`; the site's
normal GitHub Pages workflow publishes it. `apps/` is excluded from Jekyll, and
`flats/index.html` carries front matter (`nav: true`) so the page appears in the site
header.

## Add an item

Items live in [`src/game/catalog.json`](src/game/catalog.json); no code changes needed.

```jsonc
{
  "id": "brass-lamp",              // unique
  "name": "Brass desk lamp",
  "blurb": "One line of personality.",
  "category": "lighting",          // furniture, plants, lighting, wallart, rugs, tech, whimsy, textiles
  "tier": 2,                       // 1 basic, 2 fine, 3 luxe
  "rarity": "standard",            // or "seasonal" (+ "season": {"from": 12, "to": 1}) or "surprise"
  "zones": ["floor", "sill"],      // ceiling, wall, wallTop, window, sill, floor, rug
  "size": 1,                       // must fit a slot's capacity (see SLOTS in src/game/room.ts)
  "w": 30, "h": 40,                // art box in room units (the room is 360 × 420)
  "tags": ["light"],               // nap, play, light, grow
  "palettes": [{ "name": "Brass", "p": "#c9a050", "s": "#8a6a32", "a": "#fff0c8" }],
  "layers": [
    { "t": "circle", "cx": 15, "cy": 12, "r": 24, "fill": "#ffb865", "o": 0.5, "glow": true, "flat": true },
    { "t": "rect", "x": 12, "y": 14, "w": 6, "h": 24, "fill": "s" },
    { "t": "path", "d": "M4 14 L26 14 L20 2 L10 2Z", "fill": "p" }
  ]
}
```

- Layers draw in order. Shapes: `rect` (`x y w h r`), `circle`, `ellipse`, `poly`
  (`pts`), `path` (`d`), `line` (`pts`, needs `stroke`), `heart`, `star`.
- Colours: `"p"`, `"s"`, `"a"` come from the active palette (that's how recolouring
  works); hex colours stay fixed.
- `flat: true` skips the soft layer shadow (use it for thin details).
- `glow: true` marks light: the layer is drawn blurred in the room's light pass and
  flickers. Warm colours like `#ffb865` look best.
- `anim`: `sway`, `drift`, `twinkle`, `spin`, `bob`, `swim`, `glow`, `flicker`,
  `tick`, `float`, `wag`. Add `"at": [x, y]` to pivot around a point (clock hands, fan
  blades); `rot` rotates a layer statically.
- Plants tagged `grow` can show layers at `minStage` 1 or 2 as their owner keeps
  logging workouts.
- `seat` / `seatX` set where a napping pet sits on `nap` items.

Wallpapers and floors go in the `surfaces` list with a `pattern` (`plain`, `stripes`,
`dots`, `gingham`, `checker`, `stars`, `scallop`, `vines`, `planks`, `herringbone`,
`tiles`, `terrazzo`) and `colors`.

`npm test` validates the catalogue (unique ids, known colours, every item fits a slot),
so a typo fails loudly. Run `npm run dev` and unpack or seed the item to see it.

## Add a pet

Pets are data in [`src/art/pets.ts`](src/art/pets.ts). Copy an existing entry, give it
a new `kind` (also add it to `PetKind` in `src/game/types.ts`), and adjust its colours
and parts. Parts use the same layer shapes as items; the rig animates them by name
(`tail`, `legsBack`, `legsFront`, `body`, `earsBehind`, `head`, `earsFront`, `eyesOpen`,
`eyesClosed`, `face`, `happy`) around the pivots in `pivots`. Idle, walk, sit, sleep,
happy and eat animations come for free from `styles.css`.

## Code map

- `src/game/`: rules (`progression.ts`), room slots and placement (`room.ts`),
  dates, types, catalogue.
- `src/backend/`: the `Backend` interface, `LocalBackend`, demo neighbours.
- `src/art/`: SVG rendering: `RoomScene`, `ItemArt`, `Pet`, surfaces, lighting, the pet
  behaviour loop.
- `src/ui/`: screens (onboarding, home, building, visit, unpacking, sheets).

## Going online (next step)

Shared groups across devices need a small backend. The plan is Supabase (free tier):
tables for groups, players, workouts, unlocks, layouts and reactions; row-level
security denying direct access; and `SECURITY DEFINER` functions that check each
player's secret token and enforce one log per day and the present rules. A
`SupabaseBackend` implementing `src/backend/types.ts` then replaces `LocalBackend` in
`src/backend/index.ts`.
