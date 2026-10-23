import { describe, expect, it } from "vitest";
import { reconstructHistory } from "./history";
import { emptyLayout } from "./room";
import type { Player } from "./types";

const player: Player = {
  id: "room",
  name: "Nir",
  petKind: "cat",
  petName: "Bean",
  createdDay: "2026-10-18",
  workouts: [{ day: "2026-10-18" }, { day: "2026-10-19" }],
  unlocks: [
    { id: "wingback-chair", day: "2026-10-18", atWorkout: 1 },
    { id: "warm-paper", day: "2026-10-19", atWorkout: 2 },
  ],
  layout: { ...emptyLayout(), slots: { floorBC: { itemId: "wingback-chair", palette: 2, flip: true } }, wallpaper: "warm-paper" },
};
describe("flat history reconstruction", () => {
  it("starts empty, reveals only earned things, and ends with an exact baseline", () => {
    const history = reconstructHistory(player);
    expect(history[0].player.layout).toEqual(emptyLayout());
    expect(history[1].player.layout.slots).toEqual(player.layout.slots);
    expect(history[1].player.layout.wallpaper).toBe("plain-paper");
    expect(history[1].player.workouts).toHaveLength(1);
    expect(history[2].player.layout.wallpaper).toBe("warm-paper");
    expect(history.slice(0, -1).every((frame) => frame.approximate)).toBe(true);
    expect(history.at(-1)?.approximate).toBe(false);
    expect(history.at(-1)?.player).toEqual(player);
  });
  it("keeps saved snapshots independent of later moves and recolors", () => {
    const copy = structuredClone(player);
    const history = reconstructHistory(copy);
    copy.layout.slots.floorBC.palette = 0;
    expect(history.at(-1)?.player.layout.slots.floorBC.palette).toBe(2);
  });
});
