import { describe, expect, it } from "vitest";

import { CATALOG, validateCatalog } from "./catalog";
import { addDays, weekStart } from "./dates";
import { cosinessTitle, drawChoices, nextPresent, petMood, plantStage, presentTiers, presentsWaiting, weekRecap, weekStreak } from "./progression";
import { emptyLayout, placeItem, SLOTS, storedItemIds, validSlots } from "./room";
import type { Catalog, Player } from "./types";

const MONDAY = "2026-10-12";

function makePlayer(workoutDays: string[], overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    name: "Nir",
    petKind: "cat",
    petName: "Biscuit",
    createdDay: "2026-10-01",
    workouts: workoutDays.map((day) => ({ day })),
    unlocks: [],
    layout: emptyLayout(),
    ...overrides,
  };
}

describe("dates", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("catalogue", () => {
  it("has enough content in every tier", () => {
    const standardItems = CATALOG.items.filter((item) => item.rarity === "standard");
    expect(standardItems.length).toBeGreaterThanOrEqual(30);
    for (const tier of [1, 2, 3]) {
      expect(standardItems.filter((item) => item.tier === tier).length).toBeGreaterThanOrEqual(8);
    }
  });

  it("gives every item at least one valid slot", () => {
    for (const item of CATALOG.items) expect(validSlots(item).length).toBeGreaterThan(0);
  });

  it("lets every wall decoration move between all three walls", () => {
    for (const item of CATALOG.items.filter((entry) => entry.zones.includes("wall") || entry.zones.includes("wallTop"))) {
      let layout = emptyLayout();
      for (const wall of ["back", "left", "right"] as const) {
        const slot = validSlots(item).find((candidate) => candidate.wall === wall);
        expect(slot, `${item.id} should fit the ${wall} wall`).toBeDefined();
        layout = placeItem(CATALOG, layout, slot!.id, { itemId: item.id, palette: 0, flip: false }).layout;
        expect(Object.keys(layout.slots)).toEqual([slot!.id]);
      }
    }
  });

  it("rejects duplicate ids and unknown colours", () => {
    const item = CATALOG.items[0];
    const broken: Catalog = {
      items: [item, { ...item, layers: [{ t: "circle", cx: 1, cy: 1, r: 1, fill: "teal" }] }],
      surfaces: [],
    };
    expect(() => validateCatalog(broken)).toThrow(/Duplicate id[\s\S]*unknown colour/);
  });
});

describe("presents", () => {
  it("earns better tiers with more workouts in the same week", () => {
    const player = makePlayer([MONDAY, addDays(MONDAY, 1), addDays(MONDAY, 2), addDays(MONDAY, 3), addDays(MONDAY, 7)]);
    expect(presentTiers(player)).toEqual([1, 2, 2, 3, 1]);
  });

  it("counts waiting presents from workouts minus unlocks", () => {
    const player = makePlayer([MONDAY, addDays(MONDAY, 1)], {
      unlocks: [{ id: "floor-cushion", atWorkout: 1, day: MONDAY }],
    });
    expect(presentsWaiting(player)).toBe(1);
    expect(nextPresent(player)).toEqual({ index: 1, tier: 2 });
  });

  it("offers three unowned items no better than the present tier, deterministically", () => {
    const player = makePlayer([MONDAY], { unlocks: [] });
    const present = { index: 0, tier: 1 as const };
    const choices = drawChoices(CATALOG, player, present, "2026-07-01");
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
    expect(drawChoices(CATALOG, player, present, "2026-07-02")).toEqual(choices);
    for (const id of choices) {
      const entry = [...CATALOG.items, ...CATALOG.surfaces].find((candidate) => candidate.id === id)!;
      if (entry.rarity === "standard") expect(entry.tier).toBe(1);
      expect(entry.rarity).not.toBe("starter");
    }
  });

  it("only offers seasonal items in season", () => {
    const seasonalIds = new Set(CATALOG.items.filter((item) => item.rarity === "seasonal").map((item) => item.id));
    for (let index = 0; index < 40; index++) {
      const player = makePlayer([MONDAY], { id: `p${index}` });
      const april = drawChoices(CATALOG, player, { index: 0, tier: 1 }, "2026-04-10");
      for (const id of april) {
        if (seasonalIds.has(id)) expect(id).toBe("blossom-vase");
      }
    }
  });

  it("falls back to higher tiers when the eligible pool is exhausted", () => {
    const tierOneIds = [...CATALOG.items, ...CATALOG.surfaces]
      .filter((entry) => entry.tier === 1 || entry.rarity !== "standard")
      .map((entry) => entry.id);
    const player = makePlayer(
      Array.from({ length: tierOneIds.length + 1 }, (_, index) => addDays(MONDAY, index * 7)),
      {
        unlocks: tierOneIds.map((id) => ({ id, atWorkout: 0, day: MONDAY })),
      }
    );
    const choices = drawChoices(CATALOG, player, { index: tierOneIds.length, tier: 1 }, "2026-10-12");
    expect(choices).toHaveLength(3);
  });
});

describe("streaks, mood and growth", () => {
  it("counts consecutive active weeks without breaking on an empty current week", () => {
    const player = makePlayer([addDays(MONDAY, -14), addDays(MONDAY, -7), addDays(MONDAY, -6)]);
    expect(weekStreak(player, addDays(MONDAY, 2))).toBe(2);
    expect(weekStreak(player, addDays(MONDAY, 9))).toBe(0);
  });

  it("makes the pet sleepy after a quiet week and perky on workout days", () => {
    const player = makePlayer([MONDAY]);
    expect(petMood(player, MONDAY)).toBe("perky");
    expect(petMood(player, addDays(MONDAY, 3))).toBe("content");
    expect(petMood(player, addDays(MONDAY, 7))).toBe("sleepy");
  });

  it("grows plants with workouts logged after unpacking", () => {
    const unlock = { id: "monstera", atWorkout: 1, day: MONDAY };
    expect(plantStage(unlock, makePlayer([MONDAY, "2026-10-13"]))).toBe(0);
    expect(plantStage(unlock, makePlayer(["a", "b", "c"].map((_, index) => addDays(MONDAY, index))))).toBe(1);
    expect(plantStage(unlock, makePlayer(Array.from({ length: 6 }, (_, index) => addDays(MONDAY, index))))).toBe(2);
  });

  it("names cosiness levels", () => {
    expect(cosinessTitle(0)).toBe("Bare little box");
    expect(cosinessTitle(20)).toBe("Storybook flat");
  });

  it("recaps a week with shared stars and no ranking of zeros", () => {
    const players = [
      makePlayer([MONDAY, addDays(MONDAY, 2)], { id: "a" }),
      makePlayer([MONDAY, addDays(MONDAY, 1)], { id: "b" }),
      makePlayer([], { id: "c" }),
    ];
    const recap = weekRecap(players, MONDAY);
    expect(recap.total).toBe(4);
    expect(recap.stars).toEqual(["a", "b"]);
    expect(weekRecap([makePlayer([], { id: "c" })], MONDAY).stars).toEqual([]);
  });
});

describe("placement", () => {
  it("places items only where they fit and swaps occupants back to storage", () => {
    const player = makePlayer([], {
      unlocks: [
        { id: "comfy-sofa", atWorkout: 0, day: MONDAY },
        { id: "canopy-bed", atWorkout: 0, day: MONDAY },
      ],
    });
    expect(() => placeItem(CATALOG, player.layout, "floorBL", { itemId: "comfy-sofa", palette: 0, flip: false })).toThrow();
    const first = placeItem(CATALOG, player.layout, "floorBC", { itemId: "comfy-sofa", palette: 0, flip: false });
    const second = placeItem(CATALOG, first.layout, "floorBC", { itemId: "canopy-bed", palette: 1, flip: true });
    expect(second.displacedItemId).toBe("comfy-sofa");
    expect(storedItemIds(CATALOG, { ...player, layout: second.layout })).toEqual(["comfy-sofa"]);
  });

  it("moves an already-placed item instead of duplicating it", () => {
    const placed = placeItem(CATALOG, emptyLayout(), "floorBL", { itemId: "crate-shelf", palette: 0, flip: false });
    const moved = placeItem(CATALOG, placed.layout, "floorBR", { itemId: "crate-shelf", palette: 0, flip: false });
    expect(Object.keys(moved.layout.slots)).toEqual(["floorBR"]);
  });

  it("declares unique slot ids", () => {
    expect(new Set(SLOTS.map((slot) => slot.id)).size).toBe(SLOTS.length);
  });
});
