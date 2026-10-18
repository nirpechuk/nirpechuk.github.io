# Flats — design

A cosy, mobile-first workout game for adults. Friends each furnish a little flat in a
shared building; every workout earns a present, presents hold furniture and decor, and
a pet lives in the flat and reacts to how the week is going. Seen from the street, each
friend's window glows brighter the more they moved that week. Served at
`nirpechuk.github.io/flats/`.

## Priorities

1. Moody, warm and glowy: rich jewel tones, lamplight that flickers and pulses.
2. Unpacking and placing items feels like opening a present.
3. Logging takes one tap. No reps, calories, wearables, guilt or punishment.

## Rules

- **Logging.** One log per local calendar day. The big button logs immediately; the
  workout type (run, walk, gym, yoga, swim, dance, other) can be picked afterwards
  and is never required.
- **Presents.** Every workout earns one present. Its tier is fixed by where that
  workout falls in its week (weeks start Monday): 1st → basic, 2nd–3rd → fine,
  4th+ → luxe. Unpacking offers three not-yet-owned items drawn with a seeded RNG
  (player id + present index + month), so refreshing never rerolls. Items up to the
  present's tier are eligible, at least one is from its exact tier when possible,
  in-season seasonal items join the pool, and a rare find can appear.
- **Ownership.** Unlocked items are kept forever. Tiers only gate new picks.
- **Flourishing.** Plants grow through three stages as more workouts are logged
  after they were unpacked. A cosiness title grows with the number of placed items.
- **No punishment.** Missing a week only makes the pet sleepy; the next log perks it
  up. The weekly streak counts consecutive weeks with at least one workout.

## Apartment

A front-on cutaway room with named snap slots. Each item lists the zones it fits
(`ceiling`, `wall`, `wallTop`, `window`, `sill`, `floor`, `rug`) and a size; a slot
accepts items of its zone whose size fits its capacity. Wallpapers and floorings are
items applied to the room surfaces instead of slots. Editing: drag (or tap an item,
then tap a glowing slot) to place, tap a placed item to flip or recolour, long-press
to store it away. Dropping onto an occupied slot swaps the occupant back to storage.

## Lighting and art

- Rooms are always a little dim (more at night) under a vignette, so light sources
  carry the mood. Every layer marked `glow` is drawn again in a blurred, screen-blended
  light pass on top of the dimming, with a candle-like flicker. A bare bulb lights the
  room until a ceiling lamp replaces it.
- Item art is JSON: layered primitives (`rect`, `circle`, `ellipse`, `poly`, `path`,
  `line`, `heart`, `star`) with colour roles `p`/`s`/`a` resolved from the item's
  palettes, so recolouring swaps a palette.
- Primitives become paths with a very slight deterministic irregularity and a soft
  contact shadow under each layer (no per-element SVG filters, so animated rooms
  stay cheap on phones).
- Ambient animation keys (`sway`, `drift`, `twinkle`, `spin`, `bob`, `swim`, `glow`,
  `flicker`, `tick`, `float`, `wag`) are CSS keyframes, disabled under
  `prefers-reduced-motion`.
- Pets are data-driven rigs (body, head, ears, tail, face variants) with idle, walk,
  sit, sleep, happy and eat states. The pet wanders, naps on `nap` items and plays
  near `play` items.
- UI: dark aubergine surfaces, amber accents, Fraunces for headings and DM Sans for
  text. Logging is celebrated with rising embers.

## Social

A group has a short invite code. The group view is the building at night: one window
per friend (a live miniature of their room) whose glow and window-box flowers follow
that week's workouts, with a name tag below. Tapping a window swings its panes open
and zooms into the flat. Visitors can leave a heart, a star or a pet treat (one of each
per friend per day); treats are eaten by the friend's pet the next time they open the
app, and stars stay on the room's frame. A weekly recap celebrates everyone and
highlights the brightest windows (ties share the highlight); nobody is singled out for
doing less.

## Architecture

- React + TypeScript + Vite, CSS animations, no other runtime dependencies yet.
- Source in `apps/flats/`, built output committed to `flats/` (the site deploy is
  unchanged). A post-build step adds Jekyll front matter so the page joins the nav.
- `Backend` interface with a `LocalBackend` (localStorage; multiple players per
  device plus labelled demo neighbours) that ships first. A Supabase backend with
  token-checked `SECURITY DEFINER` functions replaces it once a project exists.
- PWA manifest and a small service worker for an offline shell.
- Reminders are an optional daily calendar event (.ics), off by default.
