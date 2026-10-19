// Deliberately shares the existing research console's password remembering behavior.
export const passwordKey = "admin-password";
export function savedPassword() {
  for (const type of ["sessionStorage", "localStorage"] as const) {
    try {
      const p = window[type].getItem(passwordKey);
      if (p) return p;
    } catch {}
  }
  return "";
}
export function rememberPassword(password: string) {
  for (const type of ["sessionStorage", "localStorage"] as const) {
    try {
      window[type].setItem(passwordKey, password);
    } catch {}
  }
}
export function forgetPasswords() {
  for (const type of ["sessionStorage", "localStorage"] as const) {
    for (const key of [passwordKey, "research-password"])
      try {
        window[type].removeItem(key);
      } catch {}
  }
}
export interface FitnessAccess {
  email: string;
  password: string;
  url: string;
}
export async function unlockAdmin(password: string): Promise<FitnessAccess | null> {
  const response = await fetch("/research/admin.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load admin access. Please try again.");
  const e = await response.json();
  if (e.version !== 1 || e.iterations !== 250000) throw new Error("Unsupported admin access format.");
  const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bytes(e.salt), iterations: e.iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  let content;
  try {
    content = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(e.iv) }, key, bytes(e.data))));
  } catch {
    throw new Error("That admin password didn’t work. Try again.");
  }
  rememberPassword(password);
  return content.fitness ?? null;
}
