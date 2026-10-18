# Flats

A cosy workout game for friends. Log a workout with one tap, unpack a present, furnish
your flat, and watch your window glow brighter in the shared building. Live at
[nirpechuk.github.io/flats](https://nirpechuk.github.io/flats/). Design notes are in
[DESIGN.md](DESIGN.md).

The app connects to Supabase for shared buildings, progress, room layouts, and
reactions. Existing device-only players migrate automatically; their original local
save stays as a backup. Demo neighbours are not uploaded. Buildings refresh every
eight seconds and when you return to the app.

Settings → Copy room key lets you move a player to another device using “Already
moved in?” on the welcome screen. Keep that key private: it grants access to your
player. Several players can still share one device.

## Run it

```bash
cd apps/flats
npm install
npm run dev        # http://localhost:5173/flats/
npm test           # game rules, catalogue validation, local backend
```

The building fills the viewport. Open your window to log a workout or decorate;
use the back arrow to return. Opening a window moves the whole street toward the
room, then reveals its controls against softly shaded brickwork; going back reverses
the camera move. Reduced motion skips the travel. A present drops in only after
earning it with a workout.
Tap room objects for small, individually authored reactions: lamps flicker, books tip,
leaves rustle, cushions squish, and more. Tap your pet to say hello. Reactions also
work with Enter or Space and respect reduced motion. The layer choreography lives
in `src/art/interactions.ts`.
In neighbours' flats, treats fly to the pet before it eats them.

Add `?hour=21` to the URL to preview night lighting (any hour 0–23 works).

## Deploy

```bash
cd apps/flats
npm run build      # type-checks, builds into ../../flats/, adds Jekyll front matter
```

Commit `apps/flats` and the rebuilt `flats/` folder and push to `main`; the site's
normal GitHub Pages workflow publishes it. `apps/` is excluded from Jekyll, and
`flats/index.html` carries front matter (`nav: false`); the site header links to Flats and Structs through the
“frivolities” menu.

## Add an item

Items live in [`src/game/catalog.json`](src/game/catalog.json); no code changes needed.

```jsonc
{
  "id": "brass-lamp", // unique
  "name": "Brass desk lamp",
  "blurb": "One line of personality.",
  "category": "lighting", // furniture, plants, lighting, wallart, rugs, tech, whimsy, textiles
  "tier": 2, // 1 basic, 2 fine, 3 luxe
  "rarity": "standard", // or "seasonal" (+ "season": {"from": 12, "to": 1}) or "surprise"
  "zones": ["floor", "sill"], // ceiling, wall, wallTop, window, sill, floor, rug
  "size": 1, // must fit a slot's capacity (see SLOTS in src/game/room.ts)
  "w": 30,
  "h": 40, // art box in room units (the room is 360 × 420)
  "tags": ["light"], // nap, play, light, grow
  "palettes": [{ "name": "Brass", "p": "#c9a050", "s": "#8a6a32", "a": "#fff0c8" }],
  "layers": [
    { "t": "circle", "cx": 15, "cy": 12, "r": 24, "fill": "#ffb865", "o": 0.5, "glow": true, "flat": true },
    { "t": "rect", "x": 12, "y": 14, "w": 6, "h": 24, "fill": "s" },
    { "t": "path", "d": "M4 14 L26 14 L20 2 L10 2Z", "fill": "p" },
  ],
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
- `src/backend/`: the `Backend` interface, `SupabaseBackend`, and an optional offline backend.
- `src/art/`: SVG rendering: `RoomScene`, `ItemArt`, `Pet`, surfaces, lighting, the pet
  behaviour loop.
- `src/ui/`: screens (onboarding, home, building, visit, unpacking, sheets).

## Supabase setup

The public project URL and publishable key live in `src/backend/config.json`.
Player keys are generated on the device and stored only as hashes in the database.
Tables are private; narrowly scoped database functions authorize each operation and
validate workout, present, layout, and reaction rules.

To apply the schema or sync changed catalogue metadata, use Node 24 and a private
JSON file outside the repository containing `connectionString` (the Supabase
session-pooler URL with its password) and `caFile` (the trusted Supabase CA path):

```bash
node apps/flats/scripts/setup-supabase.mjs /private/path/connection.json
```

The setup script also adds a private Flats administration key to the existing
encrypted `research/admin.json`, using the local `.admin-password`. It preserves the
research configuration. The website admin panel can delete and restore residents;
deleted residents disappear from buildings and their room keys stop working until
restored. No database password or admin key is included in the app bundle.

Flats uses the website's existing page-view tracker, without a visible counter or
footer. Local previews do not count toward published page views.

Run the opt-in live integration suite with a dedicated disposable fixture set:

```bash
FLATS_LIVE_TEST=1 FLATS_CONNECTION_FILE=/private/path/connection.json npm test --prefix apps/flats
```

The suite removes its fixtures afterward. Ordinary `npm test` skips live tests.
For explicit device-only development, start Vite with `VITE_FLATS_OFFLINE=true`.
