import { expect, test } from "vitest";
import { legacyRoomKey } from "./legacy-migration";

test("room migration accepts only the chosen old-site window and a valid capability", () => {
  const popup = {} as Window;
  const key = `${"a".repeat(36)}.${"b".repeat(64)}`;
  const event = { origin: "https://nirpechuk.github.io", source: popup, data: { type: "flats-room-migration", key } };
  expect(legacyRoomKey(event, popup)).toBe(key);
  expect(legacyRoomKey({ ...event, origin: "https://evil.example" }, popup)).toBeNull();
  expect(legacyRoomKey({ ...event, source: {} as Window }, popup)).toBeNull();
  expect(legacyRoomKey({ ...event, data: { ...event.data, key: "invalid" } }, popup)).toBeNull();
});
