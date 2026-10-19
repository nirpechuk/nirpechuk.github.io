// Provision a separate backend login and keep it inside the site's existing admin vault.
// The admin password is never sent to Supabase or printed.
import { readFile, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../../../bin/research/crypto.mjs";
const root = new URL("../../../", import.meta.url);
const email = process.argv[2];
if (!email?.includes("@")) throw new Error("Supply the owner email.");
const config = JSON.parse(await readFile(new URL("../src/config.json", import.meta.url), "utf8"));
const password = (await readFile(new URL(".admin-password", root), "utf8")).trim();
const path = new URL("research/admin.json", root);
const vault = await decrypt(JSON.parse(await readFile(path, "utf8")), password);
if (vault.fitness && (vault.fitness.url !== config.url || vault.fitness.email !== email))
  throw new Error("An existing fitness account differs; no changes made.");
if (!vault.fitness) {
  vault.fitness = { url: config.url, email, password: randomBytes(36).toString("base64url") };
  await writeFile(new URL("research/admin.json.tmp", root), JSON.stringify(await encrypt(vault, password), null, 2) + "\n");
  await rename(new URL("research/admin.json.tmp", root), path);
}
const response = await fetch(`${config.url}/auth/v1/signup?redirect_to=${encodeURIComponent("https://nirpechuk.github.io/fitness/")}`, {
  method: "POST",
  headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: vault.fitness.password }),
});
const result = await response.json();
if (!response.ok)
  throw new Error(`Account setup returned ${response.status}: ${result.msg ?? result.message ?? "check Supabase authentication settings"}`);
console.log(result.session ? "Backend login ready." : "Backend login prepared. Confirm the Supabase email once to activate it.");
