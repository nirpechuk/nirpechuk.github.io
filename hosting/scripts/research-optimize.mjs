// One-time, reversible conversion. Prepare uploads immutable encrypted objects;
// commit switches the complete directory with a revision precondition.
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { configuredClient, seal, unseal } from "../../bin/research/research-publish/scripts/upload.mjs";
import { packReport, contentKey, openContent } from "../../bin/research/research-publish/scripts/content.mjs";
import { root } from "./build.mjs";
const [action, destination, sourceBackup] = process.argv.slice(2);
if (!["prepare", "commit"].includes(action) || !destination)
  throw new Error("Use prepare DIRECTORY [EXISTING_ENCRYPTED_BACKUP] or commit DIRECTORY.");
const dir = path.resolve(destination);
if (dir === root.replace(/\/$/, "") || dir.startsWith(root)) throw new Error("Keep encrypted backups outside the repository.");
const client = await configuredClient();
const save = async (file, bytes) => {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
};
if (action === "commit") {
  const prepared = JSON.parse(await readFile(path.join(dir, "prepared.json")));
  await client.commit(prepared.state, prepared.etag);
  console.log(JSON.stringify({ status: "committed", ...prepared.stats }));
} else {
  const current = await client.state();
  if (!current.state) throw new Error("Research is not initialized.");
  const password = (await readFile(path.join(homedir(), ".config/nir-research/password"), "utf8")).trim();
  await save(path.join(dir, "before/state.json"), JSON.stringify(current.state));
  const originals = new Map();
  for (const key of new Set([current.state.manifest, current.state.admin, ...Object.values(current.state.pages)])) {
    let envelope;
    if (sourceBackup)
      try {
        envelope = JSON.parse(await readFile(path.resolve(sourceBackup, key)));
      } catch {}
    envelope ||= await client.read(key);
    await save(path.join(dir, "before", key), JSON.stringify(envelope));
    originals.set(key, envelope);
  }
  const existingAssets = [...new Set(Object.values(current.state.content || {}).flatMap((v) => v.assets))],
    oldTypes = {};
  for (const key of existingAssets) {
    const asset = await client.readAsset(key);
    oldTypes[key] = asset.type;
    await save(path.join(dir, "before", key), asset.bytes);
  }
  await save(path.join(dir, "before/asset-types.json"), JSON.stringify(oldTypes));
  const manifest = await unseal(originals.get(current.state.manifest), password);
  if (manifest.kind !== "index" || manifest.pages.length !== Object.keys(current.state.pages).length) throw new Error("Directory mismatch.");
  const raw = manifest.contentKey || Buffer.from(contentKey()).toString("base64"),
    registry = new Map(),
    assetTypes = {};
  const uploading = {
    async putAsset(key, bytes, type) {
      await save(path.join(dir, "staged", key), bytes);
      assetTypes[key] = type;
      for (let attempt = 0; ; attempt++)
        try {
          return await client.putAsset(key, bytes, type);
        } catch (error) {
          if (attempt >= 3 || (error.status && error.status < 500)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        }
    },
  };
  const next = {
    ...current.state,
    authEpoch: current.state.authEpoch || randomUUID(),
    pages: { ...current.state.pages },
    content: { ...current.state.content },
  };
  const stats = { reports: 0, sourceBytes: 0, documentBytes: 0, encryptedDocumentBytes: 0, uploadedAssets: 0 };
  for (const [slug, key] of Object.entries(current.state.pages)) {
    if (current.state.content?.[slug]?.page === key) continue;
    const report = await unseal(originals.get(key), password, manifest.contentKey);
    if (report.kind !== "page") throw new Error("Invalid report.");
    const packed = await packReport({ ...report, slug, client: uploading, rawKey: raw, registry });
    if ((await openContent(packed.payload, raw)).kind !== "page") throw new Error("Encrypted report verification failed.");
    const page = await client.put(packed.payload);
    await save(path.join(dir, "staged", page), JSON.stringify(packed.payload));
    next.pages[slug] = page;
    next.content[slug] = { page, assets: packed.assets };
    stats.reports++;
    stats.sourceBytes += packed.sourceBytes;
    stats.documentBytes += packed.documentBytes;
    stats.encryptedDocumentBytes += JSON.stringify(packed.payload).length;
    stats.uploadedAssets += packed.uploadedAssets;
    console.log(`Prepared ${stats.reports}/${Object.keys(current.state.pages).length} reports.`);
  }
  const envelope = await seal({ ...manifest, contentKey: raw }, password);
  next.manifest = await client.put(envelope);
  await save(path.join(dir, "staged", next.manifest), JSON.stringify(envelope));
  await save(path.join(dir, "staged/asset-types.json"), JSON.stringify(assetTypes));
  await save(path.join(dir, "prepared.json"), JSON.stringify({ etag: current.etag, state: next, stats }));
  console.log(JSON.stringify({ status: "prepared", ...stats }));
}
