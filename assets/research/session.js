export const reportsOrigin = "https://reports.pechuk.com";
const decode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const endpoint = `${reportsOrigin}/session`;
export async function hasReportSession() {
  try {
    const r = await fetch(endpoint, { credentials: "include", cache: "no-store" });
    return r.ok && (await r.json()).authenticated;
  } catch {
    return false;
  }
}
export async function createReportSession(password) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("/research/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("load");
    const envelope = await response.json();
    if (envelope.version !== 1 || envelope.iterations !== 250000) throw new Error("load");
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const raw = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: decode(envelope.salt), iterations: envelope.iterations, hash: "SHA-256" },
      material,
      256
    );
    // Prove the password locally first; the password itself never goes to a server.
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    try {
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv) }, key, decode(envelope.data));
    } catch {
      throw new Error("password");
    }
    const r = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: encode(raw), etag: response.headers.get("etag") }),
    });
    if (r.status === 409) continue;
    if (!r.ok) throw new Error("load");
    return;
  }
  throw new Error("load");
}
export async function clearReportSession() {
  await fetch(endpoint, { method: "DELETE", credentials: "include" }).catch(() => {});
}
