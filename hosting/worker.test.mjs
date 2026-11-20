import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadMedia } from "./scripts/media.mjs";
import { affectedTargets } from "./scripts/changed.mjs";
import { cloudflareClient, seal, unseal, uploadDirect, waitForDirectPage } from "../bin/research/research-publish/scripts/upload.mjs";

const token = "test-token-".repeat(8),
  password = "only-a-test-password";
const html = "<!doctype html><title>Private report</title><p>Private finding.</p>";
const bundle = await build({
  entryPoints: [new URL("./worker.mjs", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  loader: { ".html": "text" },
});

async function fixture(t) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-11-20",
      r2Buckets: ["RESEARCH", "MEDIA"],
      bindings: { PUBLISH_TOKEN: token },
      serviceBindings: {
        ASSETS: () => new Response("homepage"),
        FITNESS: (request) => new Response(`fitness: ${new URL(request.url).pathname}`),
        FLATS: (request) => new Response(`flats: ${new URL(request.url).pathname}`),
      },
    })
  );
  t.after(() => mf.dispose());
  const fetcher = (url, init) => mf.dispatchFetch(url, init);
  const client = cloudflareClient(token, "https://nir.pechuk.com", fetcher);
  const state = {
    version: 1,
    manifest: await client.put(await seal({ kind: "index", pages: [] }, password)),
    admin: await client.put(await seal({ kind: "admin", researchPassword: password }, "admin-test")),
    pages: {},
  };
  await client.commit(state, null);
  return { mf, client, fetcher };
}

test("direct publishing encrypts, verifies the live version, and preserves old immutable versions", async (t) => {
  const { mf, client, fetcher } = await fixture(t);
  const first = await uploadDirect({ client, password, html, slug: "report" });
  assert.equal((await waitForDirectPage(first, { fetcher })).status, "live");
  const before = await client.state();
  assert.ok(!JSON.stringify(before.state).includes("Private"));
  const publicPage = await mf.dispatchFetch(first.url);
  assert.equal(publicPage.status, 200);
  assert.match(await publicPage.text(), /data-payload="page.json"/);
  const encrypted = await (await mf.dispatchFetch(`${first.url}page.json`)).json();
  assert.ok(!JSON.stringify(encrypted).includes("Private finding"));
  assert.equal((await unseal(encrypted, password)).html, html);
  assert.equal((await uploadDirect({ client, password, list: true })).pages[0].slug, "report");
  await uploadDirect({ client, password, html: html + "updated", slug: "report", replace: true });
  assert.equal((await unseal(await client.read(before.state.pages.report), password)).html, html);
  await uploadDirect({ client, password, slug: "report", remove: true });
  assert.equal((await mf.dispatchFetch(first.url)).status, 404);
});

test("dry-run, wrong password, and accidental replacement leave the revision unchanged", async (t) => {
  const { client } = await fixture(t);
  await uploadDirect({ client, password, html, slug: "report" });
  const before = await client.state();
  await uploadDirect({ client, password, html, slug: "other", dryRun: true });
  await assert.rejects(uploadDirect({ client, password: "wrong", html, slug: "other" }), /unlock/);
  await assert.rejects(uploadDirect({ client, password, html, slug: "report" }), /--replace/);
  assert.deepEqual(await client.state(), before);
});

test("stale commits cannot overwrite a newer report and missing objects cannot be committed", async (t) => {
  const { client } = await fixture(t);
  const stale = await client.state();
  await uploadDirect({ client, password, html, slug: "newer" });
  await assert.rejects(client.commit(stale.state, stale.etag), (error) => error.status === 412);
  const latest = await client.state();
  await assert.rejects(
    client.commit({ ...latest.state, manifest: "objects/00000000-0000-0000-0000-000000000000" }, latest.etag),
    (error) => error.status === 400
  );
  assert.deepEqual(await client.state(), latest);
  await assert.rejects(client.commit(stale.state, null), (error) => error.status === 412);
});

test("publishing rejects missing auth, browser origins, mutable object writes, and plaintext client uploads", async (t) => {
  const { client, mf } = await fixture(t);
  for (const headers of [{}, { Authorization: "Bearer wrong" }, { Authorization: `Bearer ${token}`, Origin: "https://evil.test" }])
    assert.equal((await mf.dispatchFetch("https://nir.pechuk.com/api/publish/state", { headers })).status, 401);
  await assert.rejects(client.put({ html }), /encrypted/);
  const current = await client.state();
  assert.equal((await mf.dispatchFetch(`https://nir.pechuk.com/${current.state.manifest}`)).status, 200); // unrelated path uses homepage assets mock
  assert.equal((await mf.dispatchFetch("https://nir.pechuk.com/research/not-real/page.json")).status, 404);
  assert.equal((await mf.dispatchFetch("https://nir.pechuk.com/research/admin.json")).headers.get("cache-control"), "no-store");
});

test("service routing preserves app paths and query strings on canonical redirects", async (t) => {
  const { mf } = await fixture(t);
  assert.equal(await (await mf.dispatchFetch("https://nir.pechuk.com/fitness/assets/app.js")).text(), "fitness: /fitness/assets/app.js");
  assert.equal(await (await mf.dispatchFetch("https://nir.pechuk.com/flats/")).text(), "flats: /flats/");
  assert.equal(
    (await mf.dispatchFetch("https://nir.pechuk.com/fitness?code=abc", { redirect: "manual" })).headers.get("location"),
    "https://nir.pechuk.com/fitness/?code=abc"
  );
  assert.equal(
    (await mf.dispatchFetch("https://nir.pechuk.com/research?x=1", { redirect: "manual" })).headers.get("location"),
    "https://nir.pechuk.com/research/?x=1"
  );
});

test("video delivery supports byte ranges, suffix ranges, HEAD, and conditional requests", async (t) => {
  const { mf } = await fixture(t);
  const media = await mf.getR2Bucket("MEDIA");
  await media.put("talks/robot-ttt/video/test.mp4", "0123456789", { httpMetadata: { contentType: "video/mp4" } });
  const url = "https://nir.pechuk.com/talks/robot-ttt/video/test.mp4";
  const range = await mf.dispatchFetch(url, { headers: { Range: "bytes=2-5" } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), "2345");
  assert.equal(range.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(range.headers.get("content-type"), "video/mp4");
  assert.equal(await (await mf.dispatchFetch(url, { headers: { Range: "bytes=-3" } })).text(), "789");
  assert.equal((await mf.dispatchFetch(url, { headers: { Range: "bytes=10-" } })).status, 416);
  const head = await mf.dispatchFetch(url, { method: "HEAD" });
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal(await head.text(), "");
  assert.equal((await mf.dispatchFetch(url, { headers: { "If-None-Match": head.headers.get("etag") } })).status, 304);
});

test("encrypted reports larger than the static asset limit stream through R2", async (t) => {
  const { client, mf } = await fixture(t);
  const large = html + " ".repeat(20 * 1024 * 1024);
  const result = await uploadDirect({ client, password, html: large, slug: "large" });
  const response = await mf.dispatchFetch(`${result.url}page.json`);
  assert.equal(response.status, 200);
  const envelope = await response.json();
  assert.ok(envelope.data.length > 25 * 1024 * 1024);
  assert.equal((await unseal(envelope, password)).html.length, large.length);
});

test("multipart media uploads use bounded parallel parts and preserve existing files", async (t) => {
  const { client, mf } = await fixture(t);
  const directory = await mkdtemp(path.join(tmpdir(), "nir-media-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "test.mp4");
  const bytes = Buffer.alloc(20 * 1024 * 1024, 42);
  await writeFile(source, bytes);
  const result = await uploadMedia(client, source, "test/clip.mp4", { progress() {} });
  assert.equal(result.status, "uploaded");
  assert.equal(result.size, bytes.length);
  const object = await (await mf.getR2Bucket("MEDIA")).get("test/clip.mp4");
  assert.equal(object.size, bytes.length);
  assert.equal(Buffer.compare(Buffer.from(await object.arrayBuffer()), bytes), 0);
  assert.equal((await uploadMedia(client, source, "test/clip.mp4", { progress() {} })).status, "unchanged");
  await writeFile(source, "different");
  await assert.rejects(uploadMedia(client, source, "test/clip.mp4", { progress() {} }), (error) => error.status === 409);
  assert.equal((await mf.dispatchFetch("https://nir.pechuk.com/api/media/start", { method: "POST" })).status, 401);
});

test("deployment selection isolates apps while including content and shared infrastructure", () => {
  assert.deepEqual(affectedTargets(["apps/fitness/src/App.tsx"]), ["fitness"]);
  assert.deepEqual(affectedTargets(["_pages/about.md"]), ["site"]);
  assert.deepEqual(affectedTargets(["hosting/worker.mjs"]), ["site"]);
  assert.deepEqual(affectedTargets(["hosting/scripts/build.mjs"]), ["family", "fitness", "flats", "site"]);
  assert.deepEqual(affectedTargets(["hosting/family/public/index.html"]), ["family"]);
  assert.deepEqual(affectedTargets(["work/private-notes.md", "research/page/page.json"]), []);
});
