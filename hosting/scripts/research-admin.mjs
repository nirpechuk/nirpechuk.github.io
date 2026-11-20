import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { configuredClient, seal, unseal } from "../../bin/research/research-publish/scripts/upload.mjs";
import { contentKey, rotateContent } from "../../bin/research/research-publish/scripts/content.mjs";
import { root } from "./build.mjs";

async function password(kind) {
  const env = kind === "admin" ? "ADMIN_PASSWORD" : "RESEARCH_PASSWORD";
  return (
    process.env[env] ||
    (
      await readFile(path.join(root, `.${kind}-password`), "utf8").catch(() =>
        readFile(path.join(homedir(), ".config/nir-research", kind === "admin" ? "admin-password" : "password"), "utf8")
      )
    ).trim()
  );
}
async function jsonFile(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

try {
  const [action, destination] = process.argv.slice(2);
  if (!["import", "backup", "restore", "rotate"].includes(action))
    throw new Error("Choose import, backup DIRECTORY, restore DIRECTORY, or rotate NEW_PASSWORD_FILE.");
  const client = await configuredClient();
  const current = await client.state();
  if (action === "backup") {
    if (!current.state || !destination) throw new Error("Provide a backup directory outside the repository, after research is initialized.");
    const dir = path.resolve(destination);
    if (dir === root.replace(/\/$/, "") || dir.startsWith(root)) throw new Error("Keep backups outside the repository.");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await mkdir(path.join(dir, "objects"), { recursive: true, mode: 0o700 });
    for (const key of new Set([current.state.manifest, current.state.admin, ...Object.values(current.state.pages)]))
      await writeFile(path.join(dir, key), JSON.stringify(await client.read(key)), { mode: 0o600, flag: "wx" });
    const assets = [...new Set(Object.values(current.state.content || {}).flatMap((entry) => entry.assets))];
    if (assets.length) await mkdir(path.join(dir, "assets"), { recursive: true, mode: 0o700 });
    const assetTypes = {};
    for (const key of assets) {
      const asset = await client.readAsset(key);
      assetTypes[key] = asset.type;
      await writeFile(path.join(dir, key), asset.bytes, { mode: 0o600, flag: "wx" });
    }
    await writeFile(path.join(dir, "asset-types.json"), JSON.stringify(assetTypes), { mode: 0o600, flag: "wx" });
    await writeFile(path.join(dir, "state.json"), JSON.stringify(current.state, null, 2), { mode: 0o600, flag: "wx" });
    console.log("Saved an encrypted, consistent research backup. It contains no plaintext passwords or reports.");
  } else if (action === "import" || action === "restore") {
    if (action === "import" && current.state) throw new Error("Research is already initialized. Import will not overwrite it.");
    if (action === "restore" && !destination) throw new Error("Provide the encrypted backup directory.");
    const pass = await password("research");
    let manifest,
      admin,
      pages = {},
      savedState;
    if (action === "import") {
      manifest = await jsonFile(path.join(root, "research/manifest.json"));
      admin = await jsonFile(path.join(root, "research/admin.json"));
      const index = await unseal(manifest, pass);
      for (const page of index.pages) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) throw new Error("Invalid slug in local manifest.");
        pages[page.slug] = await jsonFile(path.join(root, "research", page.slug, "page.json"));
      }
    } else {
      const saved = await jsonFile(path.resolve(destination, "state.json"));
      savedState = saved;
      const load = (key) => {
        if (!/^objects\/[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid backup object path.");
        return jsonFile(path.resolve(destination, key));
      };
      manifest = await load(saved.manifest);
      admin = await load(saved.admin);
      for (const [slug, key] of Object.entries(saved.pages)) pages[slug] = await load(key);
    }
    const decoded = await unseal(manifest, pass);
    if (
      decoded.kind !== "index" ||
      !Array.isArray(decoded.pages) ||
      decoded.pages.length !== Object.keys(pages).length ||
      decoded.pages.some((p) => !Object.hasOwn(pages, p.slug))
    )
      throw new Error("Backup directory and manifest disagree.");
    const adminValue = await unseal(admin, await password("admin"));
    if (adminValue.kind !== "admin" || adminValue.researchPassword !== pass) throw new Error("Admin vault and research password disagree.");
    for (const envelope of Object.values(pages))
      if ((await unseal(envelope, pass, decoded.contentKey)).kind !== "page") throw new Error("Invalid encrypted report.");
    // Validate every envelope before sending any data. Original bytes stay encrypted.
    const state = { version: 1, manifest: await client.put(manifest), admin: await client.put(admin), pages: {} };
    if (savedState?.content) {
      const types = await jsonFile(path.resolve(destination, "asset-types.json"));
      for (const key of new Set(Object.values(savedState.content).flatMap((entry) => entry.assets))) {
        if (!/^assets\/[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid backup asset path.");
        await client.putAsset(key, await readFile(path.resolve(destination, key)), types[key]);
      }
      state.authEpoch = randomUUID();
      state.content = {};
    }
    for (const [slug, envelope] of Object.entries(pages)) {
      state.pages[slug] = await client.put(envelope);
      if (savedState?.content?.[slug]?.page === savedState.pages[slug])
        state.content[slug] = { ...savedState.content[slug], page: state.pages[slug] };
    }
    await client.commit(state, current.etag);
    console.log(`${action === "import" ? "Imported" : "Restored"} ${Object.keys(pages).length} encrypted reports and the admin vault.`);
  } else {
    if (!current.state || !destination) throw new Error("Provide a file containing the new research password.");
    const oldPassword = await password("research"),
      adminPassword = await password("admin");
    const nextPassword = (await readFile(path.resolve(destination), "utf8")).trim();
    if (!nextPassword) throw new Error("The new password is empty.");
    const manifest = await unseal(await client.read(current.state.manifest), oldPassword);
    const admin = await unseal(await client.read(current.state.admin), adminPassword);
    if (admin.researchPassword !== oldPassword) throw new Error("Admin vault and research password disagree.");
    const nextKey = manifest.contentKey ? Buffer.from(contentKey()).toString("base64") : null;
    const rotated = nextKey
      ? await rotateContent({ client, state: current.state, oldKey: manifest.contentKey, newKey: nextKey })
      : { pages: {}, content: {} };
    const state = { ...current.state, pages: { ...rotated.pages }, ...(nextKey ? { content: rotated.content, authEpoch: randomUUID() } : {}) };
    for (const [slug, key] of Object.entries(current.state.pages)) {
      if (Object.hasOwn(state.pages, slug)) continue;
      state.pages[slug] = await client.put(await seal(await unseal(await client.read(key), oldPassword), nextPassword));
    }
    state.manifest = await client.put(await seal({ ...manifest, ...(nextKey ? { contentKey: nextKey } : {}) }, nextPassword));
    state.admin = await client.put(await seal({ ...admin, researchPassword: nextPassword }, adminPassword));
    await client.commit(state, current.etag);
    console.log(
      "Password rotated atomically. Update saved passwords on each publishing machine. Old immutable objects and backups retain the old encryption."
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
