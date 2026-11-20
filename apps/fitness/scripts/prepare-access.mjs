// Provision a separate backend login and keep it inside the site's existing admin vault.
// The admin password is never sent to Supabase or printed.
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { editAdminVault } from "../../../hosting/scripts/vault.mjs";
const root = new URL("../../../", import.meta.url);
const email = process.argv[2];
if (!email?.includes("@")) throw new Error("Supply the owner email.");
const config = JSON.parse(await readFile(new URL("../src/config.json", import.meta.url), "utf8"));
const password = (await readFile(new URL(".admin-password", root), "utf8")).trim();
const { vault, save } = await editAdminVault(password);
if (vault.fitness && (vault.fitness.url !== config.url || vault.fitness.email !== email))
  throw new Error("An existing fitness account differs; no changes made.");
if (!vault.fitness) {
  vault.fitness = { url: config.url, email, password: randomBytes(36).toString("base64url") };
  await save(vault);
}
const response = await fetch(`${config.url}/auth/v1/signup?redirect_to=${encodeURIComponent("https://nir.pechuk.com/fitness/")}`, {
  method: "POST",
  headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: vault.fitness.password }),
});
const result = await response.json();
if (!response.ok)
  throw new Error(`Account setup returned ${response.status}: ${result.msg ?? result.message ?? "check Supabase authentication settings"}`);
console.log(result.session ? "Backend login ready." : "Backend login prepared. Confirm the Supabase email once to activate it.");
