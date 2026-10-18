import { describe, expect, it } from "vitest";
import { flatProgress } from "./flatProgress";
import { SLOTS } from "./room";

describe("visual room progression", () => {
  it.each([
    [0, "Moving in", 6],
    [5, "Moving in", 1],
    [6, "Unpacked", 8],
    [13, "Unpacked", 1],
    [14, "Settled", 6],
    [19, "Settled", 1],
    [20, "Homey", 0],
  ])("places %i objects in %s with %i to the next milestone", (count, stage, remaining) => {
    const progress = flatProgress(count);
    expect(progress.stage.name).toBe(stage);
    expect(progress.remaining).toBe(remaining);
  });

  it("reaches the final milestone within the available room spots", () => {
    const progress = flatProgress(SLOTS.length);
    expect(progress.stage.name).toBe("Homey");
    expect(progress.next).toBeUndefined();
    expect(progress.fraction).toBe(1);
  });

  it("keeps the bar bounded and increasing across all room states", () => {
    let previous = -1;
    for (let count = 0; count <= SLOTS.length; count++) {
      const { fraction } = flatProgress(count);
      expect(fraction).toBeGreaterThan(previous);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
      previous = fraction;
    }
    expect(flatProgress(-1).fraction).toBe(0);
    expect(flatProgress(SLOTS.length + 1).fraction).toBe(1);
  });
});
