import { configuredClient, seal, unseal } from "../../bin/research/research-publish/scripts/upload.mjs";

export async function readAdminVault(password) {
  const origin = process.env.RESEARCH_SITE || "https://nir.pechuk.com";
  const response = await fetch(new URL("/research/admin.json", origin), { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Could not read the live encrypted admin vault (${response.status}).`);
  const vault = await unseal(await response.json(), password);
  if (vault.kind !== "admin") throw new Error("Invalid admin vault.");
  return vault;
}

export async function editAdminVault(password) {
  const client = await configuredClient();
  let current = await client.state();
  if (!current.state) throw new Error("Initialize research before editing the admin vault.");
  const vault = await unseal(await client.read(current.state.admin), password);
  if (vault.kind !== "admin") throw new Error("Invalid admin vault.");
  return {
    vault,
    async save(value) {
      if (value.kind !== "admin") throw new Error("Invalid admin vault.");
      const state = { ...current.state, admin: await client.put(await seal(value, password)) };
      const { etag } = await client.commit(state, current.etag);
      current = { state, etag };
    },
  };
}
