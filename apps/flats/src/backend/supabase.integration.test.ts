/** Opt-in integration checks against the configured project. All fixture rows are cleaned up. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createDecipheriv, pbkdf2Sync, randomUUID } from "node:crypto";
import pg from "pg";
import { CATALOG } from "../game/catalog";
import { today, addDays } from "../game/dates";
import { drawChoices, nextPresent, presentTiers } from "../game/progression";
import { emptyLayout } from "../game/room";
import type { Player } from "../game/types";
import type { Session } from "./types";
import { ONLINE_STORAGE_KEY, SupabaseBackend } from "./supabase";
import config from "./config.json";

const live = process.env.FLATS_LIVE_TEST === "1";
const DAY = today();
const ids: string[] = [],
  groups = new Set<string>();
const store = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  };
};
const aStore = store(),
  bStore = store(),
  eStore = store();
const alice = new SupabaseBackend(aStore),
  bob = new SupabaseBackend(bStore),
  eve = new SupabaseBackend(eStore);
let a: Session, b: Session, e: Session, db: pg.Client, adminToken: string;
const token = (storage: ReturnType<typeof store>, id: string) => JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)!).profiles[id].token;
async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data;
}
function remember(session: Session) {
  ids.push(session.playerId);
  groups.add(session.groupCode);
  return session;
}

describe.skipIf(!live)("Live Supabase contract", () => {
  beforeAll(async () => {
    const connection = JSON.parse(await readFile(process.env.FLATS_CONNECTION_FILE!, "utf8"));
    db = new pg.Client({ ...connection, ssl: { rejectUnauthorized: true, ca: await readFile(connection.caFile, "utf8") } });
    await db.connect();
    const envelope = JSON.parse(await readFile("../../research/admin.json", "utf8"));
    const password = (await readFile("../../.admin-password", "utf8")).trim();
    const key = pbkdf2Sync(password, Buffer.from(envelope.salt, "base64"), envelope.iterations, 32, "sha256");
    const ciphertext = Buffer.from(envelope.data, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(ciphertext.subarray(-16));
    adminToken = JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString()).flats.token;
    a = remember(await alice.createPlayer({ name: "Test Alice", petKind: "cat", petName: "Test Bean" }));
    b = remember(await bob.createPlayer({ name: "Test Bob", petKind: "dog", petName: "Test Pip", groupCode: a.groupCode }));
    e = remember(await eve.createPlayer({ name: "Test Eve", petKind: "duck", petName: "Test Dot" }));
  }, 30000);
  afterAll(async () => {
    if (!db) return;
    await db.query("delete from flats_private.reactions where sender=any($1::uuid[]) or recipient=any($1::uuid[])", [ids]);
    await db.query("delete from flats_private.players where id=any($1::uuid[])", [ids]);
    await db.query(
      "delete from flats_private.groups g where code=any($1::text[]) and not exists(select 1 from flats_private.players p where p.group_code=g.code)",
      [[...groups]]
    );
    await db.end();
  }, 20000);
  it("shares buildings, keeps room keys private, and blocks forged keys and cross-building reactions", async () => {
    const snapshot = await alice.fetchGroup(a);
    expect(snapshot.players.map((p) => p.id)).toEqual(expect.arrayContaining([a.playerId, b.playerId]));
    const shared = await alice.defaultBuilding();
    if (shared) expect([a.groupCode, b.groupCode, e.groupCode]).toEqual([shared.code, shared.code, shared.code]);
    expect(JSON.stringify(snapshot)).not.toContain(token(aStore, a.playerId));
    expect(await eve.groupName(a.groupCode.toLowerCase())).toBe((await alice.fetchGroup(a)).group.name);
    await expect(rpc("flats_fetch_group", { p_player_id: a.playerId, p_token: token(eStore, e.playerId) })).rejects.toThrow("no longer available");
    const isolated = "Q" + randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
    groups.add(isolated);
    await db.query("insert into flats_private.groups(code,name) values($1,'Isolated QA')", [isolated]);
    await db.query("update flats_private.players set group_code=$1 where id=$2", [isolated, e.playerId]);
    try {
      await expect(eve.react(e, a.playerId, "heart", DAY)).rejects.toThrow("not in your building");
    } finally {
      await db.query("update flats_private.players set group_code=$1 where id=$2", [e.groupCode, e.playerId]);
    }
    const permissions = await db.query(
      "select has_schema_privilege('anon','flats_private','usage') as exposed,has_table_privilege('anon','flats_private.players','select') as readable"
    );
    expect(permissions.rows[0]).toEqual({ exposed: false, readable: false });
  });
  it("keeps older invites pointing to a consolidated building", async () => {
    const alias = "Z" + randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
    groups.add(alias);
    await db.query("insert into flats_private.groups(code,name,redirect_code) values($1,$2,$3)", [alias, "Old building", a.groupCode]);
    expect(await alice.groupName(alias)).toBe((await alice.fetchGroup(a)).group.name);
    const newcomer = new SupabaseBackend(store());
    const movedIn = remember(await newcomer.createPlayer({ name: "Test Invite", petKind: "cat", petName: "Bean", groupCode: alias }));
    expect(movedIn.groupCode).toBe(a.groupCode);
    expect((await newcomer.fetchGroup(movedIn)).players.some((player) => player.id === a.playerId)).toBe(true);
    await rpc("flats_admin", { p_token: adminToken, p_action: "delete", p_player_id: movedIn.playerId });
  });
  it("serializes duplicate workouts and only accepts an offered present", async () => {
    const results = await Promise.allSettled([alice.logWorkout(a, DAY), alice.logWorkout(a, DAY)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(alice.logWorkout(a, addDays(DAY, 5))).rejects.toThrow("device date");
    const p = await alice.setWorkoutType(a, DAY, "walk");
    expect(p.workouts[0].type).toBe("walk");
    const choices = drawChoices(CATALOG, p, nextPresent(p)!, DAY);
    await expect(alice.unpack(a, CATALOG.items.find((i) => !choices.includes(i.id))!.id, DAY)).rejects.toThrow("not in this present");
    const updated = await alice.unpack(a, choices[0], DAY);
    expect(updated.unlocks).toHaveLength(1);
    await expect(alice.unpack(a, choices[1], DAY)).rejects.toThrow("not in this present");
  });
  it("matches client present offers across tiers, months, ownership and seed values", async () => {
    for (let i = 0; i < 30; i++) {
      const count = (i % 8) + 1;
      const p: Player = {
        id: randomUUID(),
        name: "Seed check",
        petKind: "cat",
        petName: "Bean",
        createdDay: DAY,
        workouts: Array.from({ length: count }, (_, j) => ({ day: addDays("2026-10-12", j) })),
        unlocks: [],
        layout: emptyLayout(),
      };
      const drawDay = `2026-${String((i % 12) + 1).padStart(2, "0")}-15`;
      for (let j = 0; j < count; j++) {
        const expected = drawChoices(CATALOG, p, { index: j, tier: presentTiers(p)[j] }, drawDay);
        const result = await db.query("select flats_private.choices($1::jsonb,$2::date) as choices", [p, drawDay]);
        expect(result.rows[0].choices).toEqual(expected);
        p.unlocks.push({ id: expected[0], atWorkout: count, day: drawDay });
      }
    }
  }, 30000);
  it("persists reactions and prevents duplicate or self deliveries", async () => {
    await bob.react(b, a.playerId, "treat", DAY);
    expect((await alice.fetchGroup(a)).reactions).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: b.playerId, to: a.playerId, kind: "treat" })])
    );
    await expect(bob.react(b, a.playerId, "treat", DAY)).rejects.toThrow("already sent");
    await expect(alice.react(a, a.playerId, "heart", DAY)).rejects.toThrow("friends");
  });
  it("rejects unowned furniture and surfaces", async () => {
    await expect(alice.saveLayout(a, { ...emptyLayout(), slots: { floorBC: { itemId: "comfy-sofa", palette: 0, flip: false } } })).rejects.toThrow(
      "does not fit"
    );
    await expect(alice.saveLayout(a, { ...emptyLayout(), wallpaper: "not-a-wallpaper" })).rejects.toThrow("not available");
    expect((await alice.saveLayout(a, emptyLayout())).layout).toEqual(emptyLayout());
  });
  it("deletes and restores residents through authenticated admin actions", async () => {
    await expect(rpc("flats_admin", { p_token: token(aStore, a.playerId) })).rejects.toThrow("unlock");
    await rpc("flats_admin", { p_token: adminToken, p_action: "delete", p_player_id: b.playerId });
    expect((await alice.fetchGroup(a)).players.map((p) => p.id)).not.toContain(b.playerId);
    await expect(bob.fetchGroup(b)).rejects.toThrow("no longer available");
    await expect(
      rpc("flats_update_player", { p_player_id: b.playerId, p_token: token(bStore, b.playerId), p_action: "workout", p_day: DAY })
    ).rejects.toThrow("no longer available");
    await rpc("flats_admin", { p_token: adminToken, p_action: "restore", p_player_id: b.playerId });
    const restored = await bob.restorePlayer(`${b.playerId}.${token(bStore, b.playerId)}`);
    expect((await bob.fetchGroup(restored)).players.map((p) => p.id)).toContain(b.playerId);
  });
  it("imports device saves once, keeps their backup, and restores on another device", async () => {
    const localId = randomUUID(),
      storage = store();
    const saved = JSON.stringify({
      version: 1,
      activePlayerId: localId,
      groups: { ABC123: { code: "ABC123", name: "Old home", memberIds: [localId] } },
      players: {
        [localId]: {
          id: localId,
          name: "Test Migrated",
          petName: "Test Bun",
          petKind: "bunny",
          createdDay: DAY,
          workouts: [{ day: DAY }],
          unlocks: [{ id: "floor-cushion", atWorkout: 1, day: DAY }],
          layout: { ...emptyLayout(), slots: { floorBC: { itemId: "floor-cushion", palette: 0, flip: false } } },
        },
      },
      reactions: [],
    });
    storage.setItem("flats:v1", saved);
    const migrated = new SupabaseBackend(storage);
    const session = remember((await migrated.initialize())!);
    const p = (await migrated.fetchGroup(session)).players.find((p) => p.id === session.playerId)!;
    expect(p.unlocks[0].id).toBe("floor-cushion");
    expect(p.layout.slots.floorBC.itemId).toBe("floor-cushion");
    expect(storage.getItem("flats:v1")).toBe(saved);
    expect(await new SupabaseBackend(storage).initialize()).toEqual(session);
    const otherDevice = new SupabaseBackend(store());
    expect(await otherDevice.restorePlayer(migrated.roomKey(session))).toEqual(session);
  });
  it("retries a lost creation response without duplicating residents", async () => {
    const storage = store();
    let loseResponse = true;
    const flaky: typeof fetch = async (...args) => {
      const res = await fetch(...args);
      if (loseResponse && res.ok) {
        loseResponse = false;
        throw new Error("Lost response");
      }
      return res;
    };
    const first = new SupabaseBackend(storage, flaky);
    const input = { name: "Test Retry", petKind: "frog" as const, petName: "Test Frog" };
    await expect(first.createPlayer(input)).rejects.toThrow("reach your building");
    const pending = Object.keys(JSON.parse(storage.getItem(ONLINE_STORAGE_KEY)!).profiles)[0];
    const session = remember(await new SupabaseBackend(storage).createPlayer(input));
    expect(session.playerId).toBe(pending);
    expect((await first.fetchGroup(session)).players.filter((p) => p.id === pending)).toHaveLength(1);
  });
});
