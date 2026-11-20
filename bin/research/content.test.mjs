import test from "node:test";
import assert from "node:assert/strict";
import { contentKey, encryptAsset, decryptAsset, packReport, openContent, rotateContent } from "./research-publish/scripts/content.mjs";
import { randomUUID } from "node:crypto";
function storage() {
  const files = new Map();
  return {
    files,
    putAsset: async (key, bytes, type) => {
      files.set(key, { bytes, type });
      return key;
    },
    readAsset: async (key) => files.get(key),
    put: async (value) => {
      const key = `objects/${randomUUID()}`;
      files.set(key, value);
      return key;
    },
    read: async (key) => files.get(key),
  };
}
test("encrypted chunks authenticate their identity, boundaries, and contents", async () => {
  const bytes = Buffer.alloc(600001, 35),
    raw = contentKey(),
    key = `assets/${randomUUID()}`;
  const encrypted = await encryptAsset(bytes, raw, key);
  assert.deepEqual(await decryptAsset(encrypted, raw, key), bytes);
  await assert.rejects(decryptAsset(encrypted, raw, `assets/${randomUUID()}`));
  await assert.rejects(decryptAsset(encrypted, contentKey(), key));
  encrypted[encrypted.length - 1] ^= 1;
  await assert.rejects(decryptAsset(encrypted, raw, key));
});
test("legacy base64 video tables become native protected URLs without breaking their helpers", async () => {
  const client = storage(),
    raw = contentKey(),
    bytes = Buffer.alloc(12000);
  bytes.write("ftyp", 4);
  const b64 = bytes.toString("base64");
  const html = `<!doctype html><script>const VIDEO_DATA={a:"${b64}"}; function clipBlobLink(b64) { return atob(b64); } const src="data:video/mp4;base64,"+VIDEO_DATA[a];</script>`;
  const packed = await packReport({ client, rawKey: raw, html, slug: "example", title: "Example", updated: "2026-11-20" });
  const report = await openContent(packed.payload, raw);
  assert.equal(packed.assets.length, 1);
  assert.ok(report.html.length < 1000);
  assert.match(report.html, /b64.startsWith\("\/r\/"\)/);
  assert.match(report.html, /v.startsWith\("\/r\/"\)/);
  assert.ok(!report.html.includes(b64));
  assert.deepEqual(await decryptAsset(client.files.get(packed.assets[0]).bytes, raw, packed.assets[0]), bytes);
});
test("password rotation replaces the content key and ciphertext so the old key cannot read new reports or assets", async () => {
  const client = storage(),
    oldKey = contentKey(),
    newKey = contentKey();
  const packed = await packReport({
    client,
    rawKey: oldKey,
    html: '<!doctype html><img src="data:image/jpeg;base64,aGVsbG8=">',
    slug: "example",
    title: "Example",
    updated: "2026-11-20",
  });
  const page = await client.put(packed.payload),
    state = { pages: { example: page }, content: { example: { page, assets: packed.assets } } };
  const rotated = await rotateContent({ client, state, oldKey, newKey }),
    envelope = await client.read(rotated.pages.example);
  const report = await openContent(envelope, newKey);
  assert.equal(report.title, "Example");
  await assert.rejects(openContent(envelope, oldKey));
  const key = rotated.content.example.assets[0];
  assert.notEqual(key, packed.assets[0]);
  assert.ok(report.html.includes(key));
  const encrypted = (await client.readAsset(key)).bytes;
  assert.equal((await decryptAsset(encrypted, newKey, key)).toString(), "hello");
  await assert.rejects(decryptAsset(encrypted, oldKey, key));
});
