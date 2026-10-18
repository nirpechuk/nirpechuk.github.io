/**
 * Pet rigs as data. Each pet is a set of named parts built from the same layer primitives as items
 * (colour roles: p = body, s = belly/muzzle, a = accent). Parts are animated by CSS per state
 * (idle, walk, sleep, happy, eat), pivoting around the points in `pivots`. Coordinates face right,
 * with the origin between the pet's feet.
 */

import type { Layer, PetKind } from "../game/types";

export interface PetSpec {
  kind: PetKind;
  label: string;
  colors: { p: string; s: string; a: string };
  treat: { emoji: string; name: string };
  parts: {
    tail: Layer[];
    legsBack: Layer[];
    legsFront: Layer[];
    body: Layer[];
    earsBehind: Layer[];
    head: Layer[];
    earsFront: Layer[];
    eyesOpen: Layer[];
    eyesClosed: Layer[];
    face: Layer[];
    happy: Layer[];
  };
  pivots: { tail: [number, number]; head: [number, number]; ears: [number, number] };
  /** Height of the pet's head top, for placing hearts and Zzz. */
  top: number;
}

const INK = "#3b2c26";

function eyePair(leftX: number, rightX: number, y: number, rx = 1.15, ry = 1.45): Layer[] {
  return [
    { t: "ellipse", cx: leftX, cy: y, rx, ry, fill: INK, flat: true },
    { t: "ellipse", cx: rightX, cy: y, rx, ry, fill: INK, flat: true },
    { t: "circle", cx: leftX + 0.35, cy: y - 0.5, r: 0.32, fill: "#f5e6d0", o: 0.8, flat: true },
    { t: "circle", cx: rightX + 0.35, cy: y - 0.5, r: 0.32, fill: "#f5e6d0", o: 0.8, flat: true },
  ];
}

function closedEyes(leftX: number, rightX: number, y: number): Layer[] {
  return [
    { t: "path", d: `M${leftX - 1.6} ${y} Q${leftX} ${y + 1.6} ${leftX + 1.6} ${y}`, stroke: INK, sw: 1, fill: "none", flat: true },
    { t: "path", d: `M${rightX - 1.6} ${y} Q${rightX} ${y + 1.6} ${rightX + 1.6} ${y}`, stroke: INK, sw: 1, fill: "none", flat: true },
  ];
}



function legs(xs: number[], fill: string, height = 8): Layer[] {
  return xs.map((x) => ({ t: "rect" as const, x, y: -height, w: 5, h: height, r: 2.5, fill }));
}


export const PETS: PetSpec[] = [
  {
    kind: "cat",
    label: "Cat",
    colors: { p: "#8c8494", s: "#c9c0cc", a: "#6b6375" },
    treat: { emoji: "🐟", name: "fishy treat" },
    pivots: { tail: [-13, -14], head: [8, -16], ears: [11, -30] },
    top: -40,
    parts: {
      tail: [{ t: "path", d: "M-13 -14 C-24 -16 -27 -28 -20 -35", stroke: "p", sw: 4.5, fill: "none" }],
      legsBack: legs([-11, 3], "a"),
      legsFront: legs([-16, 8], "p"),
      body: [
        { t: "ellipse", cx: -3, cy: -12, rx: 14, ry: 9.5, fill: "p" },
        { t: "ellipse", cx: 0, cy: -8.5, rx: 8, ry: 4.5, fill: "s", flat: true },
        { t: "path", d: "M-10 -20.5 Q-9 -16.5 -11 -13.5 M-5 -21.5 Q-4 -17.5 -6 -14.5", stroke: "a", sw: 1.6, fill: "none", flat: true },
      ],
      earsBehind: [
        { t: "poly", pts: [2.5, -27, 4.5, -38.5, 11, -31], fill: "p" },
        { t: "poly", pts: [12, -31, 18, -38.5, 20, -27], fill: "p" },
        { t: "poly", pts: [4.6, -29, 5.6, -35, 9, -31], fill: "#c98f96", flat: true },
        { t: "poly", pts: [14, -31, 17.2, -35, 18, -29], fill: "#c98f96", flat: true },
      ],
      head: [{ t: "circle", cx: 11, cy: -23, r: 10, fill: "p" }],
      earsFront: [],
      eyesOpen: eyePair(7.8, 14.6, -24),
      eyesClosed: closedEyes(7.8, 14.6, -23.6),
      face: [
        { t: "poly", pts: [10.5, -21.4, 12.3, -21.4, 11.4, -20.3], fill: "#f08a8a", flat: true },
      ],
      happy: [],
    },
  },
  {
    kind: "dog",
    label: "Dog",
    colors: { p: "#c9a27e", s: "#ead8c0", a: "#7a5238" },
    treat: { emoji: "🦴", name: "crunchy bone" },
    pivots: { tail: [-14, -15], head: [8, -16], ears: [11, -30] },
    top: -36,
    parts: {
      tail: [{ t: "path", d: "M-14 -15 C-21 -18 -23 -25 -19 -28", stroke: "p", sw: 4.2, fill: "none" }],
      legsBack: legs([-11, 3], "a"),
      legsFront: legs([-16, 8], "p"),
      body: [
        { t: "ellipse", cx: -3, cy: -12, rx: 14.5, ry: 10, fill: "p" },
        { t: "ellipse", cx: 0, cy: -8.5, rx: 8, ry: 4.5, fill: "s", flat: true },
        { t: "ellipse", cx: -8, cy: -16, rx: 4.5, ry: 3.2, fill: "a", flat: true },
      ],
      earsBehind: [],
      head: [
        { t: "circle", cx: 11, cy: -23, r: 10.5, fill: "p" },
        { t: "ellipse", cx: 11.5, cy: -19, rx: 5.2, ry: 3.6, fill: "s", flat: true },
      ],
      earsFront: [
        { t: "ellipse", cx: 2.2, cy: -22, rx: 3.6, ry: 7.2, fill: "a", rot: 18 },
        { t: "ellipse", cx: 20, cy: -22, rx: 3.6, ry: 7.2, fill: "a", rot: -18 },
      ],
      eyesOpen: eyePair(7.6, 15.2, -25),
      eyesClosed: closedEyes(7.6, 15.2, -24.6),
      face: [
        { t: "ellipse", cx: 11.5, cy: -20.6, rx: 1.7, ry: 1.15, fill: INK, flat: true },
        { t: "path", d: "M11.5 -19.5 L11.5 -18.5 M9.8 -17.9 Q11.5 -16.6 13.2 -17.9", stroke: INK, sw: 0.8, fill: "none", flat: true },
      ],
      happy: [
        { t: "ellipse", cx: 12, cy: -16.4, rx: 1.4, ry: 1.9, fill: "#f28c8c", flat: true },
      ],
    },
  },
  {
    kind: "bunny",
    label: "Bunny",
    colors: { p: "#d9cfc4", s: "#f1ebe3", a: "#c9959c" },
    treat: { emoji: "🥕", name: "tiny carrot" },
    pivots: { tail: [-15, -13], head: [7, -15], ears: [9.5, -30] },
    top: -46,
    parts: {
      tail: [{ t: "circle", cx: -16, cy: -13, r: 4, fill: "s" }],
      legsBack: [{ t: "ellipse", cx: -9, cy: -4.5, rx: 6.5, ry: 4.5, fill: "#c9bfb3" }],
      legsFront: legs([4, 9], "p", 7),
      body: [
        { t: "ellipse", cx: -3, cy: -12, rx: 13, ry: 10.5, fill: "p" },
        { t: "ellipse", cx: 1, cy: -8.5, rx: 7, ry: 4.5, fill: "s", flat: true },
      ],
      earsBehind: [
        { t: "ellipse", cx: 6, cy: -37, rx: 3.1, ry: 9.5, fill: "p", rot: -12 },
        { t: "ellipse", cx: 13.5, cy: -37, rx: 3.1, ry: 9.5, fill: "p", rot: 12 },
        { t: "ellipse", cx: 6, cy: -37, rx: 1.5, ry: 6.8, fill: "a", rot: -12, flat: true },
        { t: "ellipse", cx: 13.5, cy: -37, rx: 1.5, ry: 6.8, fill: "a", rot: 12, flat: true },
      ],
      head: [{ t: "circle", cx: 10, cy: -22, r: 9.5, fill: "p" }],
      earsFront: [],
      eyesOpen: eyePair(7, 13.6, -23),
      eyesClosed: closedEyes(7, 13.6, -22.6),
      face: [
        { t: "poly", pts: [9.4, -20.5, 11.2, -20.5, 10.3, -19.4], fill: "#f08a8a", flat: true },
      ],
      happy: [],
    },
  },
  {
    kind: "frog",
    label: "Frog",
    colors: { p: "#7f9c6b", s: "#c9d6a8", a: "#5f7a50" },
    treat: { emoji: "🍓", name: "wild strawberry" },
    pivots: { tail: [-12, -10], head: [6, -14], ears: [6, -27] },
    top: -34,
    parts: {
      tail: [],
      legsBack: [
        { t: "ellipse", cx: -12, cy: -4.5, rx: 6.5, ry: 4.2, fill: "a" },
        { t: "ellipse", cx: -10, cy: -0.8, rx: 5, ry: 1.6, fill: "a" },
      ],
      legsFront: legs([2, 8], "a", 6),
      body: [
        { t: "ellipse", cx: -2, cy: -10, rx: 14, ry: 9.5, fill: "p" },
        { t: "ellipse", cx: 1, cy: -7, rx: 8, ry: 4.8, fill: "s", flat: true },
        { t: "circle", cx: -9, cy: -14, r: 1.4, fill: "a", flat: true },
        { t: "circle", cx: -5, cy: -17, r: 1, fill: "a", flat: true },
      ],
      earsBehind: [
        { t: "circle", cx: 0, cy: -26.5, r: 5, fill: "p" },
        { t: "circle", cx: 12, cy: -26.5, r: 5, fill: "p" },
      ],
      head: [{ t: "ellipse", cx: 6, cy: -20, rx: 12, ry: 8.5, fill: "p" }],
      earsFront: [
        { t: "circle", cx: 0, cy: -27, r: 3.2, fill: "#ffffff", flat: true },
        { t: "circle", cx: 12, cy: -27, r: 3.2, fill: "#ffffff", flat: true },
      ],
      eyesOpen: eyePair(0.4, 12.4, -27, 1.7, 1.9),
      eyesClosed: closedEyes(0, 12, -26.6),
      face: [
        { t: "path", d: "M2 -17.6 Q6 -15.6 10 -17.6", stroke: "#3b5b34", sw: 0.8, fill: "none", flat: true },
      ],
      happy: [],
    },
  },
  {
    kind: "duck",
    label: "Duck",
    colors: { p: "#d8b45a", s: "#efdca0", a: "#c9773e" },
    treat: { emoji: "🍞", name: "bread crumb" },
    pivots: { tail: [-13, -15], head: [6, -17], ears: [9, -30] },
    top: -36,
    parts: {
      tail: [{ t: "poly", pts: [-13, -14, -21, -23, -11, -19], fill: "p" }],
      legsBack: [
        { t: "line", pts: [-4, -4, -4, 0], stroke: "a", sw: 2 },
        { t: "ellipse", cx: -2.5, cy: -0.5, rx: 3, ry: 1.2, fill: "a", flat: true },
      ],
      legsFront: [
        { t: "line", pts: [3, -4, 3, 0], stroke: "a", sw: 2 },
        { t: "ellipse", cx: 4.5, cy: -0.5, rx: 3, ry: 1.2, fill: "a", flat: true },
      ],
      body: [
        { t: "ellipse", cx: -2, cy: -11, rx: 13, ry: 9, fill: "p" },
        { t: "ellipse", cx: 1, cy: -8, rx: 7, ry: 4, fill: "s", flat: true },
        { t: "ellipse", cx: -5, cy: -12, rx: 7, ry: 4.6, fill: "#c9a24a", rot: -12 },
      ],
      earsBehind: [{ t: "path", d: "M8 -31.5 Q9 -36 11.5 -33", stroke: "p", sw: 1.6, fill: "none" }],
      head: [{ t: "circle", cx: 9, cy: -24, r: 8, fill: "p" }],
      earsFront: [{ t: "ellipse", cx: 17, cy: -22.5, rx: 4.6, ry: 2.2, fill: "a" }],
      eyesOpen: eyePair(6.5, 12, -25.5, 1.3, 1.7),
      eyesClosed: closedEyes(6.5, 12, -25.2),
      face: [],
      happy: [],
    },
  },
];

const PET_BY_KIND = new Map(PETS.map((pet) => [pet.kind, pet]));

export function petSpec(kind: PetKind): PetSpec {
  const spec = PET_BY_KIND.get(kind);
  if (!spec) throw new Error(`Unknown pet kind: ${kind}`);
  return spec;
}

export const PET_NAME_IDEAS = ["Biscuit", "Mochi", "Pickle", "Noodle", "Waffles", "Bean", "Pudding", "Tofu", "Clover", "Dumpling"];
