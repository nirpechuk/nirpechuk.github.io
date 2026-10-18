# Brownstone implementation

The reviewed source is [design/brownstone](design/brownstone/README.md). Flats now uses
its architecture, material palette, detailed furniture, window treatments, plants,
pets and three present wrappers. The production app stays on GitHub Pages with its
existing Supabase project. No resident reset or data migration is required.

## Product decisions

- Rooms stay at night. The street can have dusk tint, rain, winter snow or autumn
  leaves. Weather is decorative and deterministic by date, not a weather forecast.
- Warmth is continuous, based on placed objects. Four visual milestones—Moving in,
  Unpacked, Settled and Homey—mark 0, 6, 14 and 20 placed objects, matching the 20
  available spots. These are progress markers, not unlock gates; workout tiers stay
  unchanged. Laptop rooms pair a large scene with an illustrated progress and
  activity panel; the furniture drawer becomes a shelf beside the room.
- The room cools gently after quiet weeks (70% lamp strength after seven days, 45%
  after 21). Logging a workout restores full strength. Belongings never disappear.
- Six paints coexist with all existing wallpapers. Nine additional surfaces and
  sixteen new items bring the catalogue to 66 things and 21 surfaces. Existing item
  identifiers, unlocks and layout slots remain valid.
- Three stable window positions vary by resident ID. The sill moves with its window;
  nearby wall anchors and the large floor position adapt. The one size-3 floor slot
  remains the statement-piece slot. Window treatments shape the floor's moonlight.
- Furniture material picks up a very small amount of the wall's colour. Hardware,
  brass and glass stay intact. Alternate palettes change the material itself.
- Stars persist on the facade. Hearts, stars and treats retain their once-per-day
  rules. Window flowers and warmth represent this week's workouts.
- The automatic poster-framing rule was a mockup idea and is not an extra unlock.
  The taped print keeps its identity. Existing seasonal availability is preserved.
- Keyboard users can choose a stored item, choose a slot, edit placed items, move,
  flip, recolour and store them. Modal sheets use native dialog focus isolation.

## Art and lighting

`npm run art` uses Python's standard library to compile reviewed child ranges from
inline SVG boards into `src/art/brownstone/assets.json`. It follows referenced SVG
resources, rejects executable/external markup and namespaces every definition at
render time. It also exports the street and a fixed, deterministic grain texture.
Raw exports remain untouched. The runtime never accepts player-supplied markup.

Rooms use the kit's tall 390×600 proportion, expressed as 360×554 scene units.
The scene layers architecture, rugs, treatment-specific moonlight, furniture and
pets, then cool multiply tint, a shared darkness mask with holes at actual emitters,
warm screen-blended light, vignette and cached grain. Floor moonlight now fades to
zero at Homey, following the product review; the moon stays visible in the window.
The floor patch is drawn above rugs but below solid furnishings and pets, and its
mullion shadows subtract light instead of painting a dark cross over the scene.
Light coordinates follow the same projection, scale and flip as their objects. Source patterns include dapple,
stars, stripes, cones and candle flicker. Reduced motion disables ambient animation
and camera travel. Miniature street rooms don't run pet movement timers.

Some existing seasonal/whimsical items that have no standalone production extraction
retain their original layer art. The detailed kit is used for the core furniture,
lighting, plants, wall art, textiles and all new items.

## Catalogue and deployment

Changing reward metadata requires updating both the browser and database catalogue:

1. Edit `src/game/catalog.json` and compile art if needed.
2. Run `npm run catalog:sql`. This regenerates the idempotent
   `supabase/migrations/003_brownstone_catalog.sql`.
3. Apply that SQL to the existing project, or run the existing database setup script
   with its private connection file. It updates only catalogue metadata and order;
   no player rows, credentials or permissions change.
4. Run `npm test` and `npm run build`. Commit both `apps/flats` and `flats`.
5. Push to `main`; the normal GitHub Pages workflow publishes the site.

The catalogue test checks every metadata row and ordering against the browser. This
is essential because reward choices are deterministic on both client and server.
The new worker cache is scoped to Flats and does not delete other site caches.
Vendor code, art and application code have separate fingerprinted bundles.

## Review tools

Use `VITE_FLATS_OFFLINE=true npm run dev` for disposable local testing. `?studio`
provides a development-only catalogue and room review with all colour variants,
three furnished personalities, the empty room and quiet-week lighting. The studio
is removed from the production bundle. Ordinary local mode has labelled demo
neighbours; shared production buildings have only real residents.

Automated checks cover the original game/backend contract, deterministic catalogue
synchronisation, all material variants, safe SVG references, unique rendered IDs,
emitter projection, architecture variation, quiet-week behaviour and full room
rendering. Live database tests are separately opt-in and require a connection file.

## Release verification

The production catalogue was applied with 87 entries (66 things and 21 surfaces).
Twelve read-only database fixtures covering every month, all three tiers and existing
ownership matched browser reward choices exactly; catalogue row-level security remained
enabled. Automated checks pass (36 tests); the separate nine-test live account suite
requires a private connection file and was not run. Browser review covered onboarding,
workout logging, unwrapping, keyboard placement, recolouring, saved layouts, invitations
and neighbour reactions at phone and desktop sizes, including 320×568.
