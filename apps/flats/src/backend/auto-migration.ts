import { createHandoff, openHandoff } from "../../../../hosting/migration-crypto.mjs";
import { SupabaseBackend, ONLINE_STORAGE_KEY } from "./supabase";

const PENDING = "flats:domain-migration:pending";
const DONE = "flats:domain-migration:v1";
const PREFIX = "#flats-migrate=";

export async function migrateOldDomain(): Promise<boolean> {
  if (location.origin !== "https://nir.pechuk.com") return true;
  if (location.hash.startsWith(PREFIX)) {
    const raw = location.hash.slice(PREFIX.length);
    const saved = sessionStorage.getItem(PENDING);
    const pending = saved ? JSON.parse(saved) : null;
    // Remove ciphertext from the address immediately, before rendering the app.
    history.replaceState(null, "", pending?.returnPath || "/flats/");
    if (!pending || Date.now() - pending.created > 5 * 60_000 || raw.length > 100_000) throw new Error("The room transfer expired. Please retry.");
    const packet = JSON.parse(decodeURIComponent(raw));
    if (packet.nonce !== pending.nonce) throw new Error("The room transfer belongs to a different browser visit.");
    const value = await openHandoff(pending.privateKey, packet, pending.nonce) as { keys: string[]; active: string | null };
    if (!Array.isArray(value.keys) || value.keys.length > 100 || value.keys.some(key => typeof key !== "string" || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/i.test(key))) throw new Error("The old room keys could not be read.");
    const backend = new SupabaseBackend();
    // Reconnect existing residents through the existing validation API; never create new ones.
    for (const key of value.keys) await backend.restorePlayer(key);
    if (value.active && backend.localProfiles().some(profile => profile.playerId === value.active)) backend.switchProfile(value.active);
    localStorage.setItem(DONE, "1");
    sessionStorage.removeItem(PENDING);
    return true;
  }
  const rooms = JSON.parse(localStorage.getItem(ONLINE_STORAGE_KEY) || "null");
  if (localStorage.getItem(DONE) || (Object.keys(rooms?.profiles || {}).length && !sessionStorage.getItem(PENDING))) return true;
  const keys = await createHandoff(), nonce = crypto.randomUUID();
  sessionStorage.setItem(PENDING, JSON.stringify({ privateKey: keys.privateKey, nonce, created: Date.now(), returnPath: location.pathname + location.search + location.hash }));
  location.replace(`https://nirpechuk.github.io/flats/migrate.html#request=${encodeURIComponent(JSON.stringify({ publicKey: keys.publicKey, nonce }))}`);
  return false;
}
