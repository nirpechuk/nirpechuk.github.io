/** Shared data model for Flats. */

export type Zone = "ceiling" | "wall" | "wallTop" | "window" | "sill" | "floor" | "rug";
export type SurfaceKind = "wallpaper" | "flooring";
export type Tier = 1 | 2 | 3;
export type Rarity = "starter" | "standard" | "seasonal" | "surprise";
export type ColorRole = "p" | "s" | "a";

export type AnimKey =
  | "sway"
  | "drift"
  | "twinkle"
  | "spin"
  | "bob"
  | "swim"
  | "glow"
  | "flicker"
  | "tick"
  | "float"
  | "wag";

interface LayerBase {
  /** Fill colour: a palette role or any CSS colour. */
  fill?: ColorRole | string;
  stroke?: ColorRole | string;
  sw?: number;
  o?: number;
  /** Skip the offset paper shadow (thin details such as eyes or strings). */
  flat?: boolean;
  /** Only drawn once a growing plant reaches this stage (0, 1 or 2). */
  minStage?: number;
  /** Hidden once a growing plant reaches this stage. */
  maxStage?: number;
  anim?: AnimKey;
  /** Glow layers fade in when the room is dim (evenings and nights). */
  glow?: boolean;
  /** Static rotation in degrees around `at` (defaults to the layer's own centre). */
  rot?: number;
  /** Pivot point (item-local coordinates) for `rot` and for the layer's animation. */
  at?: [number, number];
}

export type Layer =
  | (LayerBase & { t: "rect"; x: number; y: number; w: number; h: number; r?: number })
  | (LayerBase & { t: "circle"; cx: number; cy: number; r: number })
  | (LayerBase & { t: "ellipse"; cx: number; cy: number; rx: number; ry: number })
  | (LayerBase & { t: "poly"; pts: number[] })
  | (LayerBase & { t: "path"; d: string })
  | (LayerBase & { t: "line"; pts: number[] })
  | (LayerBase & { t: "heart"; cx: number; cy: number; r: number })
  | (LayerBase & { t: "star"; cx: number; cy: number; r: number; n?: number });

export interface Palette {
  name: string;
  p: string;
  s: string;
  a: string;
}

export interface ItemDef {
  id: string;
  name: string;
  blurb: string;
  category: "furniture" | "plants" | "lighting" | "wallart" | "rugs" | "tech" | "whimsy" | "textiles";
  tier: Tier;
  rarity: Rarity;
  /** Month range (1-12, inclusive, may wrap the new year) in which a seasonal item can appear. */
  season?: { from: number; to: number };
  zones: Zone[];
  size: number;
  w: number;
  h: number;
  palettes: Palette[];
  layers: Layer[];
  tags?: ("nap" | "play" | "light" | "grow" | "treatSpot")[];
  anim?: AnimKey;
  /** Height above the item's baseline where a napping pet sits. */
  seat?: number;
  /** Horizontal offset of the nap spot from the item's centre. */
  seatX?: number;
  /** Real-world size multiplier applied to the art (furniture is drawn at true scale). */
  scale?: number;
}

export type PatternKind =
  | "plain"
  | "stripes"
  | "dots"
  | "checker"
  | "stars"
  | "scallop"
  | "planks"
  | "herringbone"
  | "tiles"
  | "gingham"
  | "terrazzo"
  | "vines";

export interface SurfaceDef {
  id: string;
  name: string;
  blurb: string;
  kind: SurfaceKind;
  tier: Tier;
  rarity: Rarity;
  season?: { from: number; to: number };
  pattern: PatternKind;
  colors: string[];
}

export interface Catalog {
  items: ItemDef[];
  surfaces: SurfaceDef[];
}

export type PetKind = "cat" | "dog" | "bunny" | "frog" | "duck";

export type WorkoutType = "run" | "walk" | "gym" | "yoga" | "swim" | "dance" | "other";

export interface Workout {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  type?: WorkoutType;
}

export interface Unlock {
  id: string;
  /** Number of workouts logged when the item was unpacked (drives plant growth). */
  atWorkout: number;
  day: string;
}

export interface Placement {
  itemId: string;
  palette: number;
  flip: boolean;
}

export interface Layout {
  slots: Record<string, Placement>;
  wallpaper: string;
  flooring: string;
}

export type ReactionKind = "heart" | "sticker" | "treat";

export interface Reaction {
  from: string;
  to: string;
  kind: ReactionKind;
  day: string;
  /** Milliseconds since epoch, used to show reactions received since the last visit. */
  at: number;
  /** Which sticker design (index into the sticker list). */
  variant?: number;
}

export interface Player {
  id: string;
  name: string;
  petKind: PetKind;
  petName: string;
  createdDay: string;
  workouts: Workout[];
  unlocks: Unlock[];
  layout: Layout;
  /** Marks demo neighbours in device-only mode. */
  demo?: boolean;
}

export interface Group {
  code: string;
  name: string;
  memberIds: string[];
}

export interface GroupSnapshot {
  group: Group;
  players: Player[];
  reactions: Reaction[];
}
