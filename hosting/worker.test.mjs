import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { webcrypto, randomUUID } from "node:crypto";
import { uploadMedia } from "./scripts/media.mjs";
import { affectedTargets } from "./scripts/changed.mjs";
import {
  cloudflareClient,
  seal,
  unseal,
  uploadDirect,
  waitForDirectPage,
  readReportFolder,
} from "../bin/research/research-publish/scripts/upload.mjs";

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
      bindings: { PUBLISH_TOKEN: token, RESEARCH_SESSION_SECRET: Buffer.alloc(32, 9).toString("base64") },
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

async function enableContent(client) {
  const current = await client.state();
  const manifest = await unseal(await client.read(current.state.manifest), password);
  const raw = Buffer.alloc(32, 7).toString("base64");
  await client.commit(
    { ...current.state, authEpoch: randomUUID(), content: {}, manifest: await client.put(await seal({ ...manifest, contentKey: raw }, password)) },
    current.etag
  );
  return raw;
}
async function sessionRequest(mf, options = {}) {
  const response = await mf.dispatchFetch("https://nir.pechuk.com/research/manifest.json");
  const envelope = await response.json();
  const material = await webcrypto.subtle.importKey("raw", Buffer.from(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt: Buffer.from(envelope.salt, "base64"), iterations: envelope.iterations, hash: "SHA-256" },
    material,
    256
  );
  const body = JSON.stringify({ key: Buffer.from(bits).toString("base64"), etag: response.headers.get("etag"), ...options.body });
  return mf.dispatchFetch("https://reports.pechuk.com/session", {
    method: "POST",
    headers: {
      Origin: options.origin || "https://nir.pechuk.com",
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
  });
}
test("protected reports externalize media and enforce sessions before native HTML, ranges, and cache validation", async (t) => {
  const { client, mf } = await fixture(t),
    raw = await enableContent(client);
  const bytes = Buffer.alloc(700000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const uri = "data:video/mp4;base64," + bytes.toString("base64");
  const source = `<!doctype html><html><head><title>Private finding</title></head><body><video src="${uri}" controls></video><script>const duplicate="${uri}"</script></body></html>`;
  const result = await uploadDirect({ client, password, html: source, slug: "streamed" });
  const current = await client.state(),
    entry = current.state.content.streamed;
  assert.equal(entry.assets.length, 1);
  const report = await unseal(result.payload, password, raw);
  assert.ok(report.html.length < 1500);
  assert.ok(!report.html.includes("base64,"));
  const native = "https://reports.pechuk.com/r/streamed/",
    asset = native + entry.assets[0];
  for (const url of [native, asset]) assert.equal((await mf.dispatchFetch(url)).status, 401);
  assert.equal((await sessionRequest(mf, { body: { key: Buffer.alloc(32).toString("base64") } })).status, 401);
  assert.equal((await sessionRequest(mf, { origin: "https://evil.example" })).status, 403);
  assert.equal((await sessionRequest(mf, { body: { etag: '"stale"' } })).status, 409);
  const manifestResponse = await mf.dispatchFetch("https://nir.pechuk.com/research/manifest.json");
  const login = await sessionRequest(mf, { body: { etag: "W/" + manifestResponse.headers.get("etag") } });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /Secure; HttpOnly; SameSite=Strict/);
  const Cookie = login.headers.get("set-cookie").split(";")[0];
  const page = await mf.dispatchFetch(native, { headers: { Cookie } });
  assert.equal(page.status, 200);
  const nativeHtml = await page.text();
  assert.match(nativeHtml, /Private finding/);
  const events = {},
    messages = [];
  runInNewContext(nativeHtml.match(/<script>([\s\S]*?)<\/script>/)[1], {
    matchMedia: () => ({ matches: false }),
    navigator: {},
    Element: class {},
    IntersectionObserver: class {
      observe() {}
    },
    MutationObserver: class {
      observe() {}
    },
    document: { documentElement: {}, querySelectorAll: () => [], title: "Private finding" },
    addEventListener: (name, callback) => {
      events[name] = callback;
    },
    parent: { postMessage: (...args) => messages.push(args) },
  });
  events.DOMContentLoaded();
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [[{ type: "nir-report-ready", title: "Private finding" }, "https://nir.pechuk.com"]]);
  assert.equal((await mf.dispatchFetch("https://nir.pechuk.com/research/streamed/")).status, 200);
  assert.match(await (await mf.dispatchFetch("https://nir.pechuk.com/research/streamed/")).text(), /data-stream="1"/);
  const range = await mf.dispatchFetch(asset, { headers: { Cookie, Range: "bytes=260000-530000" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 260000-530000/700000");
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(260000, 530001));
  const full = await mf.dispatchFetch(asset, { headers: { Cookie } });
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
  assert.equal(full.headers.get("cache-control"), "private, no-cache");
  const etag = full.headers.get("etag");
  assert.equal((await mf.dispatchFetch(asset, { headers: { Cookie, "If-None-Match": etag } })).status, 304);
  assert.equal((await mf.dispatchFetch(asset, { headers: { "If-None-Match": etag } })).status, 401);
  assert.equal((await mf.dispatchFetch(asset, { headers: { Cookie, Range: "bytes=700000-" } })).status, 416);
  const suffix = await mf.dispatchFetch(asset, { headers: { Cookie, Range: "bytes=-10" } });
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-10));
  assert.equal((await mf.dispatchFetch(asset, { method: "HEAD", headers: { Cookie } })).headers.get("content-length"), "700000");
  const other = await uploadDirect({ client, password, html, slug: "another" });
  assert.ok(other);
  assert.equal((await mf.dispatchFetch("https://reports.pechuk.com/r/another/" + entry.assets[0], { headers: { Cookie } })).status, 404);
  const changed = await client.state();
  await client.commit({ ...changed.state, authEpoch: randomUUID() }, changed.etag);
  assert.equal((await mf.dispatchFetch(native, { headers: { Cookie } })).status, 401);
  const logout = await mf.dispatchFetch("https://reports.pechuk.com/session", {
    method: "DELETE",
    headers: { Origin: "https://nir.pechuk.com", Cookie },
  });
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});

test("protected media rejects ciphertext tampering", async (t) => {
  const { client, mf } = await fixture(t);
  await enableContent(client);
  await uploadDirect({ client, password, html: '<!doctype html><img src="data:image/jpeg;base64,aGVsbG8gd29ybGQ=">', slug: "integrity" });
  const current = await client.state(),
    key = current.state.content.integrity.assets[0];
  const login = await sessionRequest(mf),
    Cookie = login.headers.get("set-cookie").split(";")[0];
  const bucket = await mf.getR2Bucket("RESEARCH"),
    stored = await bucket.get(key),
    binary = new Uint8Array(await stored.arrayBuffer());
  binary[binary.length - 1] ^= 1;
  await bucket.put(key, binary, { customMetadata: { type: "image/jpeg" } });
  await assert.rejects(async () => {
    const response = await mf.dispatchFetch("https://reports.pechuk.com/r/integrity/" + key, { headers: { Cookie } });
    await response.arrayBuffer();
  });
});

test("the admin console moves to /admin/ and /research/ becomes the research directory", async (t) => {
  const { mf } = await fixture(t);
  for (const route of ["/admin", "/admin/index.html"])
    assert.equal(
      (await mf.dispatchFetch(`https://nir.pechuk.com${route}`, { redirect: "manual" })).headers.get("location"),
      "https://nir.pechuk.com/admin/"
    );
  const console = await mf.dispatchFetch("https://nir.pechuk.com/admin/");
  assert.equal(console.headers.get("cache-control"), "no-store");
  assert.match(await console.text(), /data-payload="admin.json"/);
  assert.equal((await mf.dispatchFetch("https://nir.pechuk.com/admin/", { method: "POST" })).status, 405);
  const directory = await (await mf.dispatchFetch("https://nir.pechuk.com/research/")).text();
  assert.match(directory, /directory\.js/);
  assert.doesNotMatch(directory, /admin\.json/);
});

test("folder reports serve their files at relative paths only to unlocked sessions", async (t) => {
  const { client, mf } = await fixture(t);
  await enableContent(client);
  const folder = await mkdtemp(path.join(tmpdir(), "nir-report-folder-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const video = Buffer.alloc(600000);
  for (let i = 0; i < video.length; i++) video[i] = i % 241;
  await mkdir(path.join(folder, "media/viewer"), { recursive: true });
  await writeFile(path.join(folder, "media/clip one.mp4"), video);
  await symlink(path.join(folder, "media/clip one.mp4"), path.join(folder, "media/same.mp4"));
  await writeFile(
    path.join(folder, "media/viewer/index.html"),
    "<!doctype html><script>fetch(new URLSearchParams(location.search).get('m'))</script>"
  );
  await writeFile(path.join(folder, "media/viewer/moments.json"), '{"moments":["ünïcode"]}');
  await writeFile(path.join(folder, "media/empty.txt"), "");
  await writeFile(path.join(folder, "serve.py"), "print('local only')");
  await writeFile(path.join(folder, ".hidden"), "secret");
  await writeFile(
    path.join(folder, "index.html"),
    '<!doctype html><title>Folder</title><video src="media/clip%20one.mp4"></video><iframe src="media/viewer/index.html?m=moments.json"></iframe><img src="media/missing.png">'
  );
  const { html: source, files } = await readReportFolder(folder);
  assert.deepEqual(
    files.map((file) => [file.path, file.type]),
    [
      ["media/clip one.mp4", "video/mp4"],
      ["media/same.mp4", "video/mp4"],
      ["media/viewer/index.html", "text/html"],
      ["media/viewer/moments.json", "application/json"],
    ]
  );
  const dry = await uploadDirect({ client, password, html: source, files, slug: "folder", dryRun: true });
  assert.deepEqual([dry.files, dry.unresolved], [4, ["media/missing.png"]]);
  await uploadDirect({ client, password, html: source, files, slug: "folder" });
  const entry = (await client.state()).state.content.folder;
  assert.equal(entry.assets.length, 3);
  const base = "https://reports.pechuk.com/r/folder/";
  assert.equal((await mf.dispatchFetch(base + "media/viewer/moments.json")).status, 401);
  const login = await sessionRequest(mf),
    Cookie = login.headers.get("set-cookie").split(";")[0];
  const page = await mf.dispatchFetch(base + "media/viewer/index.html?m=moments.json", { headers: { Cookie } });
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'self' https:\/\/nir\.pechuk\.com/);
  assert.match(await page.text(), /URLSearchParams/);
  assert.match(await (await mf.dispatchFetch(base + "media/viewer/", { headers: { Cookie } })).text(), /URLSearchParams/);
  const data = await mf.dispatchFetch(base + "media/viewer/moments.json", { headers: { Cookie } });
  assert.equal(data.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await data.json(), { moments: ["ünïcode"] });
  const range = await mf.dispatchFetch(base + "media/clip%20one.mp4", { headers: { Cookie, Range: "bytes=300000-300009" } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), video.subarray(300000, 300010));
  for (const missing of ["media/missing.png", "serve.py", ".hidden", "media/empty.txt", "constructor", "media/%E0%A4%A"])
    assert.equal((await mf.dispatchFetch(base + missing, { headers: { Cookie } })).status, 404, missing);
  await uploadDirect({ client, password, html, slug: "plain" });
  assert.equal((await mf.dispatchFetch("https://reports.pechuk.com/r/plain/media/viewer/moments.json", { headers: { Cookie } })).status, 404);
});

test("directory details are validated, survive replacement, and can be edited without uploading", async (t) => {
  const { client } = await fixture(t);
  await uploadDirect({ client, password, html, slug: "weekly", info: { date: "2026-11-20", section: "progress", topics: ["Planner", " "] } });
  await assert.rejects(uploadDirect({ client, password, html, slug: "attached", info: { parent: "missing" } }), /--parent/);
  await uploadDirect({ client, password, html, slug: "attached", info: { parent: "weekly" } });
  await uploadDirect({ client, password, html: html + "v2", slug: "weekly", replace: true });
  const before = await client.state();
  const updated = await uploadDirect({ client, password, slug: "weekly", setInfo: true, title: "Weekly 11/20", info: { topics: [], section: "" } });
  assert.equal(updated.status, "updated");
  const after = await client.state();
  assert.deepEqual(after.state.pages, before.state.pages);
  const pages = (await uploadDirect({ client, password, list: true })).pages.map(({ url, updated, ...page }) => page);
  assert.deepEqual(pages, [
    { slug: "weekly", title: "Weekly 11/20", date: "2026-11-20" },
    { slug: "attached", title: "Private report", parent: "weekly" },
  ]);
  await assert.rejects(uploadDirect({ client, password, slug: "absent", setInfo: true, info: {} }), /does not exist/);
});
