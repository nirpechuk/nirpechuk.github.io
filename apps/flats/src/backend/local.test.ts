import { describe, expect, it } from "vitest";

import { CATALOG } from "../game/catalog";
import { drawChoices, nextPresent } from "../game/progression";
import type { KeyValueStore } from "./local";
import { LocalBackend, normalizeGroupCode } from "./local";
import { GameRuleError } from "./types";

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const DAY = "2026-10-14";

async function newPlayer(backend: LocalBackend) {
  return backend.createPlayer({ name: "Nir", petKind: "cat", petName: "Biscuit" });
}

describe("LocalBackend", () => {
  it("creates a building with labelled demo neighbours and persists across instances", async () => {
    const store = memoryStore();
    const session = await newPlayer(new LocalBackend(store));
    const reloaded = new LocalBackend(store);
    expect(reloaded.currentSession()).toEqual(session);
    const snapshot = await reloaded.fetchGroup(session);
    expect(snapshot.players.filter((player) => player.demo)).toHaveLength(3);
    expect(await reloaded.groupName(session.groupCode.toLowerCase())).toBe("Nir's building");
  });

  it("allows one workout per day", async () => {
    const backend = new LocalBackend(memoryStore());
    const session = await newPlayer(backend);
    await backend.logWorkout(session, DAY);
    await expect(backend.logWorkout(session, DAY)).rejects.toBeInstanceOf(GameRuleError);
    const player = await backend.logWorkout(session, "2026-10-15", "yoga");
    expect(player.workouts).toHaveLength(2);
  });

  it("only unpacks items offered by a waiting present", async () => {
    const backend = new LocalBackend(memoryStore());
    const session = await newPlayer(backend);
    await expect(backend.unpack(session, CATALOG.items[0].id, DAY)).rejects.toBeInstanceOf(GameRuleError);
    const player = await backend.logWorkout(session, DAY);
    const offered = drawChoices(CATALOG, player, nextPresent(player)!, DAY);
    const notOffered = CATALOG.items.find((item) => !offered.includes(item.id))!;
    await expect(backend.unpack(session, notOffered.id, DAY)).rejects.toBeInstanceOf(GameRuleError);
    const unpacked = await backend.unpack(session, offered[0], DAY);
    expect(unpacked.unlocks.map((unlock) => unlock.id)).toEqual([offered[0]]);
  });

  it("rejects layouts with items the player does not own", async () => {
    const backend = new LocalBackend(memoryStore());
    const session = await newPlayer(backend);
    const layout = { slots: { floorBC: { itemId: "comfy-sofa", palette: 0, flip: false } }, wallpaper: "plain-paper", flooring: "bare-boards" };
    await expect(backend.saveLayout(session, layout)).rejects.toBeInstanceOf(GameRuleError);
  });

  it("limits each reaction kind to once per friend per day", async () => {
    const backend = new LocalBackend(memoryStore());
    const session = await newPlayer(backend);
    await backend.react(session, "demo-theo", "treat", DAY);
    await expect(backend.react(session, "demo-theo", "treat", DAY)).rejects.toBeInstanceOf(GameRuleError);
    await expect(backend.react(session, session.playerId, "heart", DAY)).rejects.toBeInstanceOf(GameRuleError);
    await backend.react(session, "demo-theo", "heart", DAY);
  });

  it("lets a second player on the same device join the building", async () => {
    const backend = new LocalBackend(memoryStore());
    const first = await newPlayer(backend);
    const second = await backend.createPlayer({ name: "Sam", petKind: "duck", petName: "Bean", groupCode: first.groupCode });
    expect(second.groupCode).toBe(first.groupCode);
    expect(backend.localProfiles().map((profile) => profile.name).sort()).toEqual(["Nir", "Sam"]);
    expect(backend.switchProfile(first.playerId)).toEqual(first);
  });

  it("removes demo neighbours and their reactions", async () => {
    const backend = new LocalBackend(memoryStore());
    const session = await newPlayer(backend);
    await backend.removeDemoNeighbours(session);
    const snapshot = await backend.fetchGroup(session);
    expect(snapshot.players.map((player) => player.name)).toEqual(["Nir"]);
    expect(snapshot.reactions).toEqual([]);
  });

  it("normalizes invite codes", () => {
    expect(normalizeGroupCode(" ab-c 12 ")).toBe("ABC12");
  });
});
