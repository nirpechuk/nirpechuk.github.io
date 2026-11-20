import { readFile } from "node:fs/promises";
import { editAdminVault } from "../../../hosting/scripts/vault.mjs";
const root = new URL("../../../", import.meta.url);
const password = (await readFile(new URL(".admin-password", root), "utf8")).trim();
const { vault, save } = await editAdminVault(password);
const config = JSON.parse(await readFile(new URL("../src/config.json", import.meta.url), "utf8"));
if (vault.fitness.agent) {
  console.log("The local agent is already connected.");
  process.exit(0);
}
const auth = await fetch(config.url + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email: vault.fitness.email, password: vault.fitness.password }),
});
const session = await auth.json();
if (!auth.ok) throw new Error("Owner sign-in failed.");
const r = await fetch(config.url + "/rest/v1/rpc/fitness_create_agent_key", {
  method: "POST",
  headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_name: "Codex · personal website" }),
});
const result = await r.json();
if (!r.ok) throw new Error(result.message ?? "Could not create agent connection.");
vault.fitness.agent = result;
await save(vault);
console.log("Local agent connected. Key stored only in the encrypted admin vault; expires in 90 days.");
