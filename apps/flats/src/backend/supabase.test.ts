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
