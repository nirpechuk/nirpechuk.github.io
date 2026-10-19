import { describe, expect, it } from "vitest";
import { emptyLayout } from "../game/room";
import { ONLINE_STORAGE_KEY, SupabaseBackend } from "./supabase";

describe("online profile corrections", () => {
  it("refreshes saved names and building codes without replacing the room key", async () => {
    const id = "resident-id";
    const token = "a".repeat(64);
    const values = new Map<string, string>([
      [
        ONLINE_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          activePlayerId: id,
          migrated: [],
          importedGroups: {},
          profiles: { [id]: { playerId: id, name: "Old name", petName: "Old pet", petKind: "cat", groupCode: "OLD123", token } },
        }),
      ],
    ]);
    const store = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const backend = new SupabaseBackend(store, async (_url, init) => {
      expect(JSON.parse(init!.body as string)).toEqual({ p_player_id: id, p_token: token });
      return new Response(
        JSON.stringify({
          group: { code: "NEW123", name: "Nir's building", memberIds: [id] },
          reactions: [],
          players: [
            { id, name: "Nir", petName: "Pickle", petKind: "dog", createdDay: "2026-10-18", workouts: [], unlocks: [], layout: emptyLayout() },
          ],
        })
      );
    });
    await backend.fetchGroup(backend.currentSession()!);
    expect(backend.currentSession()).toEqual({ playerId: id, groupCode: "NEW123" });
    expect(backend.localProfiles()).toEqual([{ playerId: id, name: "Nir", petName: "Pickle", petKind: "dog" }]);
    expect(backend.roomKey(backend.currentSession()!)).toBe(`${id}.${token}`);
    expect(new SupabaseBackend(store).currentSession()).toEqual({ playerId: id, groupCode: "NEW123" });
  });
});

describe("shared community and merged rooms", () => {
  const oldId = "541cf9d0-8638-49dc-be6a-0c07e6133ada";
  const keptId = "371e4c65-320c-4738-ae2e-72eb9f1396ba";
  const token = "b".repeat(64);
  function fixture(saved = true) {
    const values = new Map<string, string>();
    if (saved)
      values.set(
        ONLINE_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          activePlayerId: oldId,
          migrated: [],
          importedGroups: {},
          profiles: {
            [oldId]: { playerId: oldId, name: "Olga", petName: "Popcorn", petKind: "cat", groupCode: "OLD123", token },
          },
        })
      );
    const store = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
    };
    const request: typeof fetch = async (url, init) => {
      const args = JSON.parse(init!.body as string);
      if (String(url).endsWith("flats_default_building")) return Response.json({ code: "F5D912", name: "Nir's building" });
      if (String(url).endsWith("flats_resolve_room")) {
        expect(args).toEqual({ p_player_id: oldId, p_token: token });
        return Response.json({ playerId: keptId, groupCode: "F5D912", name: "Olga", petName: "Biscuit", petKind: "cat" });
      }
      expect(args).toEqual({ p_player_id: keptId, p_token: token });
      return Response.json({
        group: { code: "F5D912", name: "Nir's building", memberIds: [keptId] },
        players: [
          {
            id: keptId,
            name: "Olga",
            petName: "Biscuit",
            petKind: "cat",
            createdDay: "2026-10-18",
            workouts: [{ day: "2026-10-18" }],
            unlocks: [],
            layout: emptyLayout(),
          },
        ],
        reactions: [],
      });
    };
    return { backend: new SupabaseBackend(store, request), values };
  }
  it("resolves an existing duplicate on startup, preserving its key and selecting the kept flat", async () => {
    const { backend, values } = fixture();
    const session = await backend.initialize();
    expect(session).toEqual({ playerId: keptId, groupCode: "F5D912" });
    expect(backend.localProfiles()).toEqual([{ playerId: keptId, name: "Olga", petName: "Biscuit", petKind: "cat" }]);
    expect(backend.roomKey(session!)).toBe(`${keptId}.${token}`);
    expect(JSON.parse(values.get(ONLINE_STORAGE_KEY)!).profiles[oldId]).toBeUndefined();
    expect((await backend.fetchGroup(session!)).players[0].workouts).toHaveLength(1);
  });
  it("restores the old key on another device into the kept room", async () => {
    const { backend } = fixture(false);
    expect(await backend.restorePlayer(`${oldId}.${token}`)).toEqual({ playerId: keptId, groupCode: "F5D912" });
    expect(backend.localProfiles()[0].petName).toBe("Biscuit");
  });
  it("reads the temporary shared destination from the server", async () => {
    expect(await fixture(false).backend.defaultBuilding()).toEqual({ code: "F5D912", name: "Nir's building" });
  });
});
