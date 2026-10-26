import { expect, test } from "vitest";
import { addDays, weekStart, inUnit, description, nutrition, rollingWeek, type Entry } from "./model";
test("calendar arithmetic crosses DST and starts weeks on Monday", () => {
  expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  expect(weekStart("2026-10-18")).toBe("2026-10-12");
});
test("missing meals remain incomplete; a check-in is explicit", () => {
  expect(nutrition([], "2026-10-19")).toMatchObject({ hasData: false, complete: false });
  const entries = [{ kind: "checkin", day: "2026-10-19", data: { complete: true }, archived_at: null }] as Entry[];
  expect(nutrition(entries, "2026-10-19").complete).toBe(true);
});
test("rolling trends use calendar windows rather than the last seven observations", () => {
  expect(
    rollingWeek([
      { day: "2026-10-01", value: 200 },
      { day: "2026-10-19", value: 100 },
    ])[1].value
  ).toBe(100);
  expect(inUnit(100, "kg", "lb")).toBeCloseTo(220.4623, 3);
});

test("unknown macros remain distinct from measured zero and partial daily macros", () => {
  const entry = { kind: "meal", day: "2026-10-24", data: { calories: 3000, confidence: "estimated" }, archived_at: null } as Entry;
  expect(nutrition([entry], entry.day)).toMatchObject({ calories: 3000, hasData: true, proteinKnown: false, carbsKnown: false, fatKnown: false });
  expect(description(entry)).toContain("protein unrecorded");
  const known = { ...entry, data: { ...entry.data, protein: 0, carbs: 0, fat: 0 } };
  expect(nutrition([known], entry.day)).toMatchObject({ protein: 0, proteinKnown: true, carbsKnown: true, fatKnown: true });
  expect(nutrition([known, entry], entry.day).proteinKnown).toBe(false);
  expect(nutrition([], entry.day).proteinKnown).toBe(false);
});
