import { afterEach, expect, test, vi } from "vitest";
import { sealHandoff } from "../../../../hosting/migration-crypto.mjs";
import { migrateOldDomain } from "./auto-migration";

const restore = vi.hoisted(() => vi.fn(async (_key: string) => undefined));
const select = vi.hoisted(() => vi.fn());
vi.mock("./supabase", () => ({
  ONLINE_STORAGE_KEY: "flats:online:v1",
  SupabaseBackend: class {
    restorePlayer = restore;
    switchProfile = select;
    localProfiles() { return [{ playerId: "a".repeat(36) }]; }
  },
}));
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

test("first visit automatically reconnects the old resident without creating a new one", async () => {
  const local = storage(), session = storage();
  const location = { origin: "https://nir.pechuk.com", pathname: "/flats/", search: "?join=abc", hash: "", replace: vi.fn() };
  const history = { replaceState: vi.fn() };
  vi.stubGlobal("localStorage", local); vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("location", location); vi.stubGlobal("history", history);
  expect(await migrateOldDomain()).toBe(false);
  const destination = new URL(location.replace.mock.calls[0][0]);
  expect(destination.origin).toBe("https://nirpechuk.github.io");
  const request = JSON.parse(decodeURIComponent(destination.hash.slice("#request=".length)));
  expect(request.publicKey.d).toBeUndefined();
  const key = `${"a".repeat(36)}.${"b".repeat(64)}`;
  const packet = await sealHandoff(request.publicKey, { keys: [key], active: "a".repeat(36) }, request.nonce);
  location.hash = `#flats-migrate=${encodeURIComponent(JSON.stringify({ ...packet, nonce: request.nonce }))}`;
  expect(await migrateOldDomain()).toBe(true);
  expect(restore).toHaveBeenCalledExactlyOnceWith(key);
  expect(select).toHaveBeenCalledWith("a".repeat(36));
  expect(history.replaceState).toHaveBeenCalledWith(null, "", "/flats/?join=abc");
  expect(session.getItem("flats:domain-migration:pending")).toBeNull();
  expect(local.getItem("flats:domain-migration:v1")).toBe("1");
  location.hash = "";
  expect(await migrateOldDomain()).toBe(true);
  expect(location.replace).toHaveBeenCalledTimes(1);
});

test("an unsolicited transfer cannot replace a room", async () => {
  vi.stubGlobal("localStorage", storage()); vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("location", { origin: "https://nir.pechuk.com", hash: "#flats-migrate=%7B%7D" });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  await expect(migrateOldDomain()).rejects.toThrow("expired");
  expect(restore).not.toHaveBeenCalled();
});
