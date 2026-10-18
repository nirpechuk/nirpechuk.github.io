/** Apply the schema and refresh game metadata. Secrets are read from a private connection file. */
import { readFile, writeFile, rename, readdir } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";
import { encrypt, decrypt } from "../../../bin/research/crypto.mjs";
import { SLOTS } from "../src/game/room.ts";

const root = new URL("../../../", import.meta.url);
const connectionPath = process.argv[2];
if (!connectionPath) throw new Error("Usage: node scripts/setup-supabase.mjs /private/path/connection.json");
const connection = JSON.parse(await readFile(connectionPath, "utf8"));
const db = new pg.Client({
  ...connection,
  ssl: { rejectUnauthorized: true, ca: await readFile(connection.caFile, "utf8") },
  connectionTimeoutMillis: 15000,
});
const config = JSON.parse(await readFile(new URL("../src/backend/config.json", import.meta.url), "utf8"));
const adminPath = new URL("research/admin.json", root);
const password = (await readFile(new URL(".admin-password", root), "utf8")).trim();
const admin = await decrypt(JSON.parse(await readFile(adminPath, "utf8")), password);
const token = admin.flats?.url === config.url ? admin.flats.token : randomBytes(32).toString("hex");
await db.connect();
try {
  await db.query("begin");
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.query(await readFile(new URL(file, migrations), "utf8"));
  }
  const catalog = JSON.parse(await readFile(new URL("../src/game/catalog.json", import.meta.url), "utf8"));
  for (const [ordinal, entry] of [...catalog.items, ...catalog.surfaces].entries()) {
    const { id, tier, rarity, season, kind, zones, size, palettes } = entry;
    const data = { id, tier, rarity, season, kind, zones, size, paletteCount: palettes?.length };
    await db.query(
      "insert into flats_private.catalog(id,ordinal,data) values($1,$2,$3) on conflict(id) do update set ordinal=excluded.ordinal,data=excluded.data",
      [id, ordinal, data]
    );
  }
  for (const slot of SLOTS)
    await db.query(
      "insert into flats_private.slots(id,zone,capacity) values($1,$2,$3) on conflict(id) do update set zone=excluded.zone,capacity=excluded.capacity",
      [slot.id, slot.zone, slot.capacity]
    );
  await db.query("insert into flats_private.admin(id,token_hash) values(true,$1) on conflict(id) do update set token_hash=excluded.token_hash", [
    createHash("sha256").update(token).digest(),
  ]);
  await db.query("commit");
  admin.flats = { ...config, token };
  await writeFile(new URL("research/admin.json.tmp", root), JSON.stringify(await encrypt(admin, password), null, 2) + "\n");
  await rename(new URL("research/admin.json.tmp", root), adminPath);
  console.log("Supabase schema, catalogue, and encrypted admin access are ready.");
} catch (error) {
  await db.query("rollback");
  // Never print connection objects or secrets.
  console.error("Setup failed:", error.message);
  if (error.position) console.error("SQL character:", error.position);
  process.exitCode = 1;
} finally {
  await db.end();
}
