// Portable protected-report format. Files remain encrypted in R2; authenticated
// delivery decrypts bounded chunks so native video ranges do not download a report.
import { webcrypto, randomUUID, createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
const subtle = webcrypto.subtle;
export const contentKey = () => webcrypto.getRandomValues(new Uint8Array(32));
const importKey = (raw, use) => subtle.importKey("raw", typeof raw === "string" ? Buffer.from(raw, "base64") : raw, "AES-GCM", false, use);
export async function sealContent(value, raw) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, await importKey(raw, ["encrypt"]), gzipSync(JSON.stringify(value)));
  return { version: 2, algorithm: "AES-GCM", encoding: "gzip", iv: Buffer.from(iv).toString("base64"), data: Buffer.from(data).toString("base64") };
}
export async function openContent(value, raw) {
  if (value?.version !== 2 || value.algorithm !== "AES-GCM" || value.encoding !== "gzip" || !raw) throw new Error("Unsupported protected report.");
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(value.iv, "base64") },
    await importKey(raw, ["decrypt"]),
    Buffer.from(value.data, "base64")
  );
  return JSON.parse(gunzipSync(Buffer.from(plain)).toString("utf8"));
}
export async function encryptAsset(bytes, raw, objectKey) {
  const size = 256 * 1024,
    header = Buffer.alloc(32);
  header.write("NIR2");
  header.writeUInt32BE(size, 4);
  header.writeBigUInt64BE(BigInt(bytes.length), 8);
  Buffer.from(webcrypto.getRandomValues(new Uint8Array(12))).copy(header, 16);
  const key = await importKey(raw, ["encrypt"]),
    aad = Buffer.concat([header, Buffer.from(objectKey)]),
    parts = [header];
  for (let offset = 0, index = 0; offset < bytes.length; offset += size, index++) {
    const iv = Buffer.from(header.subarray(16, 28));
    iv.writeUInt32BE((iv.readUInt32BE(8) ^ index) >>> 0, 8);
    parts.push(Buffer.from(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, bytes.subarray(offset, offset + size))));
  }
  return Buffer.concat(parts);
}
// Report folders keep relative URLs working, including paths that scripts build at
// runtime: each file is served at its own path from an encrypted asset, and the
// path map stays inside the encrypted report document.
export async function packReport({ client, rawKey, html, slug, title, updated, files = [], registry = new Map() }) {
  const jobs = [],
    assets = new Set(),
    fileMap = {};
  // Replaces data URLs in markup AND script/JSON data tables. Native report code
  // can keep assigning these URLs to img/video elements without a new API.
  function register(mime, bytes) {
    const hash = createHash("sha256").update(mime.toLowerCase()).update(bytes).digest("hex");
    let objectKey = registry.get(hash);
    if (!objectKey) {
      objectKey = `assets/${randomUUID()}`;
      registry.set(hash, objectKey);
      jobs.push({ objectKey, bytes, mime: mime.toLowerCase() });
    }
    assets.add(objectKey);
    return `/r/${slug}/${objectKey}`;
  }
  let rewritten = html.replace(
    /data:((?:image|video|audio|font)\/[a-z0-9.+-]+|application\/(?:pdf|octet-stream|font-woff))(?:;charset=[a-z0-9-]+)?;base64,((?:[a-z0-9+/=]|\\\/|\\[rn])+)/gi,
    (whole, mime, encoded) => {
      const bytes = Buffer.from(encoded.replace(/\\\//g, "/").replace(/\\[rn]/g, ""), "base64");
      return bytes.length ? register(mime, bytes) : whole;
    }
  );
  // Older report generators store raw MP4 base64 in JSON and adapt it with one
  // of these two helpers. Preserve their controls while replacing the payloads.
  const blobHelper = /function\s+clipBlobLink\s*\(\s*b64\s*\)\s*\{/;
  const dataHelper = /(["'])data:video\/mp4;base64,\1\s*\+\s*(VIDEO_DATA\[[^\]\n]+\])/g;
  if (blobHelper.test(rewritten) || /data:video\/mp4;base64,["']\s*\+\s*VIDEO_DATA\[/.test(rewritten)) {
    rewritten = rewritten.replace(/(["'])([A-Za-z0-9+/=]+)\1/g, (whole, quote, encoded) => {
      if (encoded.length < 10000) return whole;
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.subarray(4, 8).toString() !== "ftyp") return whole;
      return quote + register("video/mp4", bytes) + quote;
    });
    rewritten = rewritten.replace(blobHelper, (match) => match + ' if (typeof b64 === "string" && b64.startsWith("/r/")) return b64; ');
    rewritten = rewritten.replace(dataHelper, (_whole, _quote, value) => `((v)=>v.startsWith("/r/")?v:"data:video/mp4;base64,"+v)(${value})`);
  }
  for (const file of files) {
    // Symlinked copies of one file share an asset. Files are read when uploaded, one per worker.
    let objectKey = registry.get(`file:${file.source}`);
    if (!objectKey) {
      objectKey = `assets/${randomUUID()}`;
      registry.set(`file:${file.source}`, objectKey);
      jobs.push({ objectKey, read: file.read, mime: file.type });
    }
    assets.add(objectKey);
    fileMap[file.path] = objectKey;
  }
  if (assets.size > 2000) throw new Error("A report can include at most 2000 media files.");
  // A bounded upload queue avoids multiplying memory use and network contention.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const bytes = job.bytes ?? (await job.read());
        await client.putAsset(job.objectKey, await encryptAsset(bytes, rawKey, job.objectKey), job.mime, bytes.length);
      }
    })
  );
  const report = { kind: "page", title, html: rewritten, updated, ...(files.length ? { files: fileMap } : {}) };
  return {
    payload: await sealContent(report, rawKey),
    assets: [...assets],
    sourceBytes: Buffer.byteLength(html),
    documentBytes: Buffer.byteLength(rewritten),
    uploadedAssets: jobs.length,
  };
}

export async function decryptAsset(bytes, raw, objectKey) {
  if (bytes.subarray(0, 4).toString() !== "NIR2" || bytes.length < 32) throw new Error("Invalid encrypted asset.");
  const header = bytes.subarray(0, 32),
    size = Number(header.readBigUInt64BE(8)),
    chunkSize = header.readUInt32BE(4);
  if (chunkSize !== 262144 || size < 1 || size > 80 * 1024 * 1024 || bytes.length !== 32 + size + 16 * Math.ceil(size / chunkSize))
    throw new Error("Invalid encrypted asset.");
  const key = await importKey(raw, ["decrypt"]),
    aad = Buffer.concat([header, Buffer.from(objectKey)]),
    parts = [];
  for (let index = 0, offset = 0; offset < size; index++, offset += chunkSize) {
    const iv = Buffer.from(header.subarray(16, 28));
    iv.writeUInt32BE((iv.readUInt32BE(8) ^ index) >>> 0, 8);
    const start = 32 + index * (chunkSize + 16),
      length = Math.min(chunkSize, size - offset) + 16;
    parts.push(Buffer.from(await subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, bytes.subarray(start, start + length))));
  }
  return Buffer.concat(parts);
}
export async function rotateContent({ client, state, oldKey, newKey }) {
  const pages = {},
    content = {},
    mapping = new Map();
  for (const [slug, entry] of Object.entries(state.content || {})) {
    if (entry.page !== state.pages[slug]) continue;
    const report = await openContent(await client.read(entry.page), oldKey);
    const assets = [];
    for (const old of entry.assets) {
      let next = mapping.get(old);
      if (!next) {
        const original = await client.readAsset(old),
          plain = await decryptAsset(original.bytes, oldKey, old);
        next = `assets/${randomUUID()}`;
        await client.putAsset(next, await encryptAsset(plain, newKey, next), original.type);
        mapping.set(old, next);
      }
      assets.push(next);
      report.html = report.html.replaceAll(old, next);
    }
    if (report.files) report.files = Object.fromEntries(Object.entries(report.files).map(([file, key]) => [file, mapping.get(key)]));
    pages[slug] = await client.put(await sealContent(report, newKey));
    content[slug] = { page: pages[slug], assets };
  }
  return { pages, content };
}
