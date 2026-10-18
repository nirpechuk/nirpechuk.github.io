/** Little responses authored against the catalogue's paper layers.
 * Parts sharing an origin and delay move together; frames, pots and feet stay put.
 */
export type ObjectReaction =
  | "squish"
  | "rustle"
  | "book"
  | "curtain"
  | "flicker"
  | "warm"
  | "ripple"
  | "straighten"
  | "clock"
  | "steam"
  | "flame"
  | "screen"
  | "yarn"
  | "record"
  | "note"
  | "fish"
  | "bubble"
  | "lava"
  | "swing"
  | "gleam"
  | "fan"
  | "snail"
  | "clink";

export interface ReactionPart {
  effect: ObjectReaction;
  layers: number[];
  origin?: [number, number];
  delay: number;
}

const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i);
const part = (effect: ObjectReaction, layers: number[], origin?: [number, number], delay = 0): ReactionPart => ({ effect, layers, origin, delay });
const ripple = (effect: ObjectReaction, layers: number[], stagger = 0.12): ReactionPart[] =>
  layers.map((layer, i) => part(effect, [layer], undefined, i * stagger));

export const OBJECT_REACTIONS: Record<string, ReactionPart[]> = {
  "floor-cushion": [part("squish", range(0, 3), [23, 22])],
  "succulent-pot": [part("rustle", range(0, 6), [13, 23])],
  "wooden-stool": [part("squish", [3, 4], [17, 15])],
  "plain-curtains": [part("curtain", [0, 1], [8, 0]), part("curtain", [2, 3], [122, 0], 0.15)],
  "paper-lantern": [part("flicker", [0]), part("warm", range(3, 6))],
  "woven-rug": [part("ripple", range(0, 4), [75, 20])],
  "mountain-poster": [part("straighten", range(0, 5), [23, 0])],
  "wall-clock": [part("clock", [7], [20, 20])],
  "crate-shelf": [...ripple("book", [5, 6, 7, 8]), part("rustle", [9], [45, 20], 0.35)],
  "side-table": [part("steam", [6])],
  "floor-lamp": [part("flicker", [0, 4]), part("warm", [3])],
  "eucalyptus-garland": ripple("rustle", range(1, 13), 0.05),
  "comfy-sofa": [part("squish", [4, 6], [35, 48]), part("squish", [5, 7], [82, 48], 0.16), part("squish", [8], undefined, 0.25)],
  armchair: [part("squish", [3, 5], [31, 46]), part("curtain", [8, 9, 10], [44, 22], 0.15)],
  monstera: [part("rustle", range(0, 10), [26, 70])],
  "hanging-pothos": [part("curtain", range(3, 19), [23, 34]), part("rustle", [21, 22, 23], [23, 34], 0.1)],
  "floral-curtains": [part("curtain", [0, ...range(2, 8), 16], [8, 0]), part("curtain", [1, ...range(9, 15), 17], [122, 0], 0.15)],
  "gallery-trio": [
    part("straighten", range(0, 3), [15, 0]),
    part("straighten", range(4, 6), [52, 0], 0.15),
    part("straighten", range(7, 10), [53, 30], 0.3),
    part("straighten", [11, 12], [34, 38], 0.4),
  ],
  "tall-bookshelf": [...ripple("book", range(2, 6)), ...ripple("book", range(13, 16)), part("flame", [21], undefined, 0.35)],
  "arc-lamp": [part("flicker", [0, 4]), part("warm", [3])],
  "striped-rug": [part("ripple", range(0, 5), [80, 20])],
  "tiny-tv": [part("screen", [6, 7])],
  "pet-bed": [part("squish", range(0, 2), [24, 24])],
  "wall-shelf": [...ripple("book", [4, 5, 6]), part("rustle", [2, 11, 12, 13], [14, 24]), part("rustle", [7, 8], [55, 30], 0.2)],
  "yarn-basket": [part("yarn", [0, 1], [12, 13]), part("yarn", [2, 3], [22, 11], 0.2), part("rustle", [7], [22, 17])],
  "record-player": [part("record", [3, 4, 5], [18, 17]), part("note", [12, 13], [40, 6])],
  "tiny-aquarium": [part("fish", [5, 6, 7], [18, 24]), part("fish", [8, 9], [30, 35], 0.25), part("bubble", [10]), part("rustle", [3, 4], [18, 42])],
  "canopy-bed": [part("squish", [7, 8], [40, 63]), part("curtain", [17], [8, 0]), part("curtain", [18], [116, 0], 0.15)],
  "fairy-lights": [...ripple("flicker", range(1, 5), 0.16), ...ripple("warm", range(6, 15), 0.08)],
  "garden-door": [part("rustle", range(10, 18), [49, 90]), part("gleam", [2, 3, 4])],
  "lava-lamp": [part("lava", [2], [11, 30]), part("lava", [3], [11, 30], 0.3), part("warm", [0])],
  fireplace: [part("flicker", [0]), part("flame", [4, 5], [55, 78])],
  "globe-chandelier": [part("flicker", [0]), ...ripple("warm", range(4, 9), 0.08)],
  "egg-chair": [part("swing", [3, 4, 5, 6], [33, 18])],
  telescope: [part("gleam", [4, 7])],
  pumpkin: [part("rustle", [3, 4], [15, 8])],
  "tiny-tree": [part("warm", [0]), ...ripple("gleam", [...range(5, 9), 11], 0.1)],
  "dried-roses": [part("rustle", range(0, 7), [15, 35])],
  "blossom-vase": [part("rustle", range(0, 10), [17, 39])],
  "summer-fan": [part("fan", [3, 4, 5], [17, 18])],
  "neon-moon": [part("flicker", [0, 2, 3]), part("gleam", [4])],
  "snail-terrarium": [part("snail", range(4, 7)), part("gleam", [9])],
  "candle-cluster": [part("flicker", [0]), ...ripple("flame", [7, 8, 9], 0.15)],
  "bar-cart": [part("clink", [8, 9], [39, 24]), part("clink", [10, 11], [49, 24], 0.1)],
};
