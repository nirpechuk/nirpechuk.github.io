import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { encrypt, decrypt } from "./crypto.mjs";
import { initialize, publishPage, readManifest, removePage, validateSlug } from "./publish.mjs";

test("encrypted payloads round-trip and reject wrong passwords and tampering", async () => {
  const value = { html: "<h1>Private finding</h1>" };
  const encrypted = await encrypt(value, "test-password");
  assert.deepEqual(await decrypt(encrypted, "test-password"), value);
  assert.ok(!JSON.stringify(encrypted).includes("Private finding"));
  await assert.rejects(decrypt(encrypted, "wrong"));
  const bytes = Buffer.from(encrypted.data, "base64");
  bytes[0] ^= 1;
  await assert.rejects(decrypt({ ...encrypted, data: bytes.toString("base64") }, "test-password"));
});

test("publish, update, and remove without exposing source or accepting invalid inputs", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "research-test-"));
  const root = path.join(temporary, "site");
  const source = path.join(temporary, "report.html");
  const password = "test-password";
  try {
    await mkdir(root);
    await initialize(root, password);
    await writeFile(source, "<!doctype html><title>Private experiment</title><h1>Unique private result</h1>");
    await publishPage({ root, source, slug: "report", password });
    let manifest = await readManifest(root, password);
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.pages[0].title, "Private experiment");
    const encrypted = await readFile(path.join(root, "research/report/page.json"), "utf8");
    assert.ok(!encrypted.includes("Unique private result"));
    assert.ok(!encrypted.includes(password));
    assert.ok((await decrypt(JSON.parse(encrypted), password)).html.includes("Unique private result"));
    assert.ok(!(await readFile(path.join(root, "research/report/index.html"), "utf8")).includes("Unique private result"));
    await publishPage({ root, source, slug: "report", title: "Updated title", password });
    manifest = await readManifest(root, password);
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.pages[0].title, "Updated title");
    const before = await readFile(path.join(root, "research/manifest.json"), "utf8");
    await assert.rejects(publishPage({ root, source, slug: "report", password: "wrong" }), /Nothing was changed/);
    await writeFile(source, '<!doctype html><img src="local.png">');
    await assert.rejects(publishPage({ root, source, slug: "bad", password }), /local asset/);
    await assert.rejects(publishPage({ root, source: path.join(root, "source.html"), slug: "bad", password }), /outside the website/);
    assert.equal(await readFile(path.join(root, "research/manifest.json"), "utf8"), before);
    for (const slug of ["../outside", "a/b", "index", "", undefined]) assert.throws(() => validateSlug(slug));
    await removePage(root, "report", password);
    assert.equal((await readManifest(root, password)).pages.length, 0);
    await assert.rejects(readFile(path.join(root, "research/report/page.json")));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
