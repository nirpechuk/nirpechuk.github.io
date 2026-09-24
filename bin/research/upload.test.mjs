import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encrypt, decrypt } from "./crypto.mjs";
import { seal, unseal, upload, waitForPage, githubClient } from "./research-publish/scripts/upload.mjs";

const password = "test-password";
const html = "<!doctype html><title>Private result</title><h1>Secret finding</h1>";
async function fixture({ existing = false, conflict = false } = {}) {
  const calls = [];
  const manifest = await encrypt(
    { kind: "index", pages: [{ slug: existing ? "report" : "older-report", title: "Previous result", updated: "2026-09-23" }] },
    password
  );
  const shell = await readFile(new URL("./page.html", import.meta.url), "utf8");
  const content = (value) => ({ encoding: "base64", content: Buffer.from(value).toString("base64") });
  const api = async (route, method = "GET", body) => {
    calls.push({ route, method, body });
    if (route === "/git/ref/heads/main") return { object: { sha: "head1" } };
    if (route === "/contents/research/manifest.json?ref=head1") return content(JSON.stringify(manifest));
    if (route === "/contents/bin/research/page.html?ref=head1") return content(shell);
    if (route === "/git/commits/head1") return { tree: { sha: "tree1" } };
    if (route === "/git/trees" && method === "POST") return { sha: "tree2" };
    if (route === "/git/commits" && method === "POST") return { sha: "commit2" };
    if (route === "/git/refs/heads/main" && method === "PATCH") {
      if (conflict) throw Object.assign(new Error("Not a fast forward"), { status: 422 });
      return {};
    }
    throw new Error(`Unexpected call ${method} ${route}`);
  };
  return { api, calls };
}

test("standalone encryption interoperates with the website's existing format", async () => {
  assert.deepEqual(await decrypt(await seal({ html }, password), password), { html });
  assert.deepEqual(await unseal(await encrypt({ html }, password), password), { html });
  await assert.rejects(unseal(await seal({ html }, password), "wrong"));
});

test("publishes only encrypted content in one atomic non-forced commit, preserving other pages", async () => {
  const { api, calls } = await fixture();
  const result = await upload({ api, password, html, slug: "report" });
  assert.equal(result.status, "queued");
  assert.equal(result.url, "https://nirpechuk.github.io/research/report/");
  const tree = calls.find((c) => c.route === "/git/trees").body;
  assert.equal(tree.base_tree, "tree1");
  assert.deepEqual(
    tree.tree.map((entry) => entry.path),
    ["research/index.html", "research/manifest.json", "research/report/index.html", "research/report/page.json"]
  );
  assert.ok(!JSON.stringify(calls).includes("Secret finding"));
  assert.ok(!JSON.stringify(calls).includes(password));
  const manifest = await decrypt(JSON.parse(tree.tree[1].content), password);
  assert.deepEqual(
    manifest.pages.map((p) => p.slug),
    ["report", "older-report"]
  );
  assert.equal((await decrypt(JSON.parse(tree.tree[3].content), password)).html, html);
  assert.deepEqual(calls.find((c) => c.route === "/git/commits").body.parents, ["head1"]);
  assert.deepEqual(calls.at(-1).body, { sha: "commit2", force: false });
});

test("dry-run, list, invalid inputs, wrong password, and unapproved replacement never write", async () => {
  for (const options of [
    { dryRun: true },
    { list: true },
    { password: "wrong" },
    { slug: "../bad" },
    { slug: undefined },
    { html: "<!doctype html><img src=local.png>" },
    { existing: true },
  ]) {
    const { api, calls } = await fixture(options);
    const action = upload({ api, password, html, slug: "report", ...options });
    if (options.dryRun || options.list) await action;
    else await assert.rejects(action);
    assert.ok(calls.every((call) => call.method === "GET"));
  }
});

test("explicit replacement updates one entry; a concurrent branch change is never forced or retried", async () => {
  const { api, calls } = await fixture({ existing: true });
  await upload({ api, password, html, slug: "report", replace: true });
  const manifest = await decrypt(JSON.parse(calls.find((c) => c.route === "/git/trees").body.tree[1].content), password);
  assert.equal(manifest.pages.length, 1);
  const concurrent = await fixture({ conflict: true });
  await assert.rejects(upload({ api: concurrent.api, password, html, slug: "report" }), /No forced update/);
  assert.equal(concurrent.calls.filter((c) => c.method === "PATCH").length, 1);
  assert.equal(concurrent.calls.at(-1).body.force, false);
});

test("wait checks exact encrypted version; API errors do not expose response bodies", async () => {
  let polls = 0;
  const result = { url: "https://example.test/research/report/", commit: "commit2", payload: { data: "expected" } };
  assert.equal(
    (
      await waitForPage(result, {
        fetcher: async () => ({ ok: true, json: async () => ({ data: ++polls === 1 ? "old" : "expected" }) }),
        pause: async () => {},
      })
    ).status,
    "live"
  );
  assert.equal(polls, 2);
  await assert.rejects(
    githubClient("token", async () => ({ ok: false, status: 403, json: async () => ({ message: "sensitive response" }) }))("/git/trees", "POST", {}),
    (error) => !error.message.includes("sensitive response") && error.status === 403
  );
});
