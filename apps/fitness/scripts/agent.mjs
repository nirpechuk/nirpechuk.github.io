// Agent interface. Secrets stay in the existing encrypted admin vault, or environment.
import { readFile } from "node:fs/promises";
import { decrypt } from "../../../bin/research/crypto.mjs";
const config = JSON.parse(await readFile(new URL("../src/config.json", import.meta.url), "utf8"));
let token = process.env.FITNESS_AGENT_KEY;
if (!token) {
  const root = new URL("../../../", import.meta.url);
  const password = (await readFile(new URL(".admin-password", root), "utf8")).trim();
  const vault = await decrypt(JSON.parse(await readFile(new URL("research/admin.json", root), "utf8")), password);
  token = vault.fitness?.agent?.token;
}
if (!token) throw new Error("Connect an agent key first.");
const action = process.argv[2] ?? "read";
let rpc, body;
if (action === "read") {
  rpc = "fitness_agent_read";
  body = { p_token: token, ...(process.argv[3] ? { p_since: process.argv[3] } : {}) };
} else if (action === "save") {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  const input = JSON.parse(text);
  rpc = "fitness_agent_save";
  body = { p_token: token, p_entry: input.entry ?? input, p_expected_revision: input.expected_revision ?? null };
} else throw new Error("Use read [YYYY-MM-DD] or save with a JSON entry on stdin.");
const response = await fetch(`${config.url}/rest/v1/rpc/${rpc}`, {
  method: "POST",
  headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20000),
});
const data = await response.json();
if (!response.ok) throw new Error(data.message ?? "Journal request failed.");
console.log(JSON.stringify(data, null, 2));
