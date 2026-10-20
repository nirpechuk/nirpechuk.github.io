import { expect, test } from "vitest";
import { createHandler } from "../supabase/functions/fitness-mcp/server";
const base = "https://project.supabase.co/functions/v1/fitness-mcp";
const config = { supabaseUrl: "https://project.supabase.co", publicBase: base, publishableKey: "public-test-key" };
const calls: { name: string; args: any }[] = [];
let context = { profile: { goal: "Example goal" }, revision: 1 };
const fakeFetch: typeof fetch = async (input, init) => {
  const name = String(input).split("/").pop()!;
  const args = JSON.parse(String(init?.body));
  calls.push({ name, args });
  const value =
    name === "fitness_plugin_access"
      ? true
      : name === "fitness_plugin_context"
        ? context
        : name === "fitness_plugin_read"
          ? []
          : { ...args.p_entry, revision: 1 };
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
};
const handler = createHandler(config, fakeFetch);
function request(method: string, params: unknown = {}, token = true) {
  return new Request(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      ...(token ? { Authorization: "Bearer test-token" } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
async function decode(response: Response) {
  const text = await response.text();
  if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data:"));
    return JSON.parse(data!.slice(5));
  }
  return JSON.parse(text);
}
test("OAuth discovery is public; journal endpoints fail closed", async () => {
  const discovery = await handler(new Request(`${base}/.well-known/oauth-protected-resource`));
  expect((await discovery.json()).resource).toBe(`${base}/mcp`);
  expect((await handler(new Request("https://edge.internal/fitness-mcp/.well-known/oauth-protected-resource"))).status).toBe(200);
  const denied = await handler(request("tools/list", {}, false));
  expect(denied.status).toBe(401);
  expect(denied.headers.get("WWW-Authenticate")).toContain("resource_metadata");
  const unauthorized = createHandler(config, async () => new Response("false"));
  expect((await unauthorized(request("tools/list"))).status).toBe(401);
  const upstreamError = createHandler(config, async () => new Response("secret diagnostic", { status: 500 }));
  expect((await upstreamError(request("tools/list"))).status).toBe(401);
});
test("MCP initializes and advertises three bounded tools with correct annotations", async () => {
  const initialized = await decode(
    await handler(request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }))
  );
  expect(initialized.result.serverInfo.name).toBe("fitness");
  expect(initialized.result.instructions).toContain("Example goal");
  const list = await decode(await handler(request("tools/list")));
  expect(list.result.tools.map((t: any) => t.name)).toEqual(["read_fitness_entries", "log_fitness_entry", "log_fitness_photo"]);
  expect(list.result.tools[0].annotations.readOnlyHint).toBe(true);
  expect(list.result.tools[1].annotations.readOnlyHint).toBe(false);
  const photo = list.result.tools[2];
  expect(photo._meta["openai/fileParams"]).toEqual(["file"]);
  expect(photo.inputSchema.properties.file.required).toEqual(["download_url", "file_id"]);
  expect(Object.keys(photo.inputSchema.properties.file.properties).sort()).toEqual(["download_url", "file_id", "file_name", "mime_type"]);
});
test("tools round-trip structured entries, keep UUID/revision, and reject photo/invalid inputs", async () => {
  const entry = {
    id: "11111111-1111-4111-8111-111111111111",
    day: "2026-10-19",
    kind: "meal",
    title: "Lunch",
    data: { calories: 600, protein: 40, confidence: "estimated" },
  };
  const saved = await decode(await handler(request("tools/call", { name: "log_fitness_entry", arguments: { entry, expected_revision: 2 } })));
  expect(saved.result.isError).not.toBe(true);
  expect(JSON.parse(saved.result.content[0].text).context).toEqual(context);
  expect(calls.at(-1)).toEqual({ name: "fitness_plugin_save", args: { p_entry: entry, p_expected_revision: 2 } });
  const before = calls.filter((c) => c.name === "fitness_plugin_save").length;
  for (const bad of [
    { ...entry, kind: "photo" },
    { ...entry, data: { ...entry.data, calories: -1 } },
  ]) {
    const response = await decode(await handler(request("tools/call", { name: "log_fitness_entry", arguments: { entry: bad } })));
    expect(Boolean(response.error || response.result?.isError)).toBe(true);
  }
  expect(calls.filter((c) => c.name === "fitness_plugin_save")).toHaveLength(before);
  const read = await decode(await handler(request("tools/call", { name: "read_fitness_entries", arguments: { since: "2026-10-01" } })));
  expect(JSON.parse(read.result.content[0].text).entries).toEqual([]);
  expect(JSON.parse(read.result.content[0].text).context).toEqual(context);
});

test("context refreshes each request and a failed context load cannot save", async () => {
  context = { profile: { goal: "Updated example goal" }, revision: 2 };
  const read = await decode(await handler(request("tools/call", { name: "read_fitness_entries", arguments: {} })));
  expect(JSON.parse(read.result.content[0].text).context.revision).toBe(2);
  const before = calls.filter((c) => c.name === "fitness_plugin_save").length;
  const broken = createHandler(config, async (input, init) =>
    String(input).endsWith("/fitness_plugin_context") ? new Response("private diagnostic", { status: 500 }) : fakeFetch(input, init)
  );
  const response = await broken(
    request("tools/call", {
      name: "log_fitness_entry",
      arguments: {
        entry: {
          id: "99999999-9999-4999-8999-999999999999",
          day: "2026-10-19",
          kind: "measurement",
          title: "Test only",
          data: { weight: 170, unit: "lb" },
        },
      },
    })
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private diagnostic");
  expect(calls.filter((c) => c.name === "fitness_plugin_save")).toHaveLength(before);
});
