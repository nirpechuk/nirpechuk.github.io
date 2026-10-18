/** Labelled demo neighbours so the building is lively before real friends join (device-only mode). */

import { addDays } from "../game/dates";
import type { Layout, PetKind, Placement, Player } from "../game/types";

interface DemoSpec {
  id: string;
  name: string;
  petKind: PetKind;
  petName: string;
  daysAgo: number[];
  wallpaper: string;
  flooring: string;
  slots: Record<string, [itemId: string, palette: number, flip?: boolean]>;
}

const DEMO_SPECS: DemoSpec[] = [
  {
    id: "demo-juniper",
    name: "Juniper",
    petKind: "frog",
    petName: "Pickle",
    daysAgo: [0, 1, 2, 4, 7, 8, 10, 14, 16, 21, 22, 23, 24],
    wallpaper: "vine-trellis",
    flooring: "herringbone",
    slots: {
      floorBC: ["canopy-bed", 2],
      floorBL: ["tall-bookshelf", 0],
      floorBR: ["monstera", 0],
      floorFL: ["tiny-aquarium", 1],
      floorFR: ["floor-cushion", 1],
      ceilL: ["hanging-pothos", 0],
      ceilR: ["paper-lantern", 0],
      wallTop: ["fairy-lights", 0],
      window: ["floral-curtains", 1],
      sill: ["succulent-pot", 0],
      rug: ["woven-rug", 1],
      wallR: ["mountain-poster", 0],
    },
  },
  {
    id: "demo-theo",
    name: "Theo",
    petKind: "dog",
    petName: "Waffles",
    daysAgo: [1, 3, 6, 8, 13, 15],
    wallpaper: "soft-stripes",
    flooring: "warm-planks",
    slots: {
      floorBC: ["comfy-sofa", 3],
      floorBR: ["floor-lamp", 0],
      floorFL: ["pet-bed", 2],
      wallL: ["wall-clock", 1],
      wallR: ["gallery-trio", 0, true],
      window: ["plain-curtains", 1],
      rug: ["striped-rug", 0],
      ceilC: ["globe-chandelier", 0],
      sill: ["candle-cluster", 2],
      floorFR: ["bar-cart", 0],
    },
  },
  {
    id: "demo-ama",
    name: "Ama",
    petKind: "bunny",
    petName: "Mochi",
    daysAgo: [2, 9, 16],
    wallpaper: "polka-dots",
    flooring: "bare-boards",
    slots: {
      floorBL: ["armchair", 2],
      floorBR: ["crate-shelf", 1],
      floorFR: ["yarn-basket", 0],
      wallTop: ["eucalyptus-garland", 0],
      floorBC: ["fireplace", 0],
      sill: ["candle-cluster", 0],
      floorFL: ["pumpkin", 0],
      rug: ["woven-rug", 2],
    },
  },
];

export function buildDemoNeighbours(day: string): Player[] {
  return DEMO_SPECS.map((spec) => {
    const slots: Record<string, Placement> = {};
    for (const [slotId, [itemId, palette, flip]] of Object.entries(spec.slots)) {
      slots[slotId] = { itemId, palette, flip: flip ?? false };
    }
    const layout: Layout = { slots, wallpaper: spec.wallpaper, flooring: spec.flooring };
    const ownedIds = [
      ...Object.values(slots).map((placement) => placement.itemId),
      ...[spec.wallpaper, spec.flooring].filter((id) => id !== "plain-paper" && id !== "bare-boards"),
    ];
    // Older history so every pre-furnished item is backed by a workout, as the present rules require.
    const offsets = [...spec.daysAgo];
    while (offsets.length < ownedIds.length) offsets.push(40 + offsets.length * 3);
    const workoutDays = offsets.map((offset) => addDays(day, -offset)).sort();
    return {
      id: spec.id,
      name: spec.name,
      petKind: spec.petKind,
      petName: spec.petName,
      createdDay: workoutDays[0],
      workouts: workoutDays.map((workoutDay) => ({ day: workoutDay })),
      unlocks: ownedIds.map((id) => ({ id, atWorkout: 0, day: workoutDays[0] })),
      layout,
      demo: true,
    };
  });
}
