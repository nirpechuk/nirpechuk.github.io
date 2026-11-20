import { createHandoff, openHandoff } from "./handoff.js";
const pendingKey = "research:domain-migration:pending",
  doneKey = "research:domain-migration:v1";
const prefix = "#research-migrate=";
export async function migrateSavedUnlock(kind) {
  if (location.origin !== "https://nir.pechuk.com") return true;
  try {
    if (location.hash.startsWith(prefix)) {
      const encoded = location.hash.slice(prefix.length),
        saved = sessionStorage.getItem(pendingKey);
      const pending = saved ? JSON.parse(saved) : null;
      const path = pending?.returnPath;
      history.replaceState(null, "", typeof path === "string" && /^\/research\//.test(path) ? path : "/research/");
      sessionStorage.removeItem(pendingKey);
      if (!pending || Date.now() - pending.created > 5 * 60000 || encoded.length > 30000) throw new Error("Expired transfer");
      const packet = JSON.parse(decodeURIComponent(encoded));
      if (packet.nonce !== pending.nonce) throw new Error("Wrong transfer");
      const value = await openHandoff(pending.privateKey, packet, pending.nonce);
      for (const name of ["research-password", "admin-password"]) {
        if (typeof value[name] === "string" && value[name].length <= 4096 && value[name]) {
          if (localStorage.getItem(name) || sessionStorage.getItem(name)) continue;
          for (const storage of [localStorage, sessionStorage]) storage.setItem(name, value[name]);
        }
      }
      localStorage.setItem(doneKey, "1");
      location.replace(typeof path === "string" && /^\/research\//.test(path) ? path : "/research/");
      return false;
    }
    if (localStorage.getItem(doneKey) || localStorage.getItem(kind) || sessionStorage.getItem(kind)) return true;
    const keys = await createHandoff(),
      nonce = crypto.randomUUID();
    sessionStorage.setItem(
      pendingKey,
      JSON.stringify({ privateKey: keys.privateKey, nonce, created: Date.now(), returnPath: location.pathname + location.search + location.hash })
    );
    location.replace(
      `https://nirpechuk.github.io/research/migrate.html#request=${encodeURIComponent(JSON.stringify({ publicKey: keys.publicKey, nonce }))}`
    );
    return false;
  } catch {
    try {
      sessionStorage.removeItem(pendingKey);
      localStorage.setItem(doneKey, "1");
    } catch {}
    return true; // Storage restrictions must not prevent manually unlocking a report.
  }
}
export function stopPasswordMigration() {
  try {
    localStorage.setItem(doneKey, "1");
    sessionStorage.removeItem(pendingKey);
  } catch {}
}
