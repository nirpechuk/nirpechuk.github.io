import { build, run } from "./build.mjs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const target = process.argv[2] || "all";
const preview = process.argv.includes("--preview");
const built = process.argv.includes("--built");
const targets = target === "all" ? ["fitness", "flats", "site", "family"] : [target];
try {
  for (const name of targets) {
    if (!["site", "fitness", "flats", "family"].includes(name)) throw new Error("Choose site, fitness, flats, family, or all.");
    if (!built) await build(name);
    const config = name === "site" ? "hosting/wrangler.jsonc" : name === "family" ? "hosting/family/wrangler.jsonc" : `apps/${name}/wrangler.jsonc`;
    let secretsDir;
    try {
      const token =
        name === "site" && !process.env.CI
          ? (await readFile(path.join(homedir(), ".config/nir-research/publish-token"), "utf8").catch(() => "")).trim()
          : "";
      if (token) {
        secretsDir = await mkdtemp(path.join(tmpdir(), "nir-deploy-"));
        await writeFile(path.join(secretsDir, "secrets.json"), JSON.stringify({ PUBLISH_TOKEN: token }), { mode: 0o600 });
      }
      run("npm", [
        "exec",
        "--",
        "wrangler",
        "deploy",
        "-c",
        config,
        ...(name === "site" ? ["--env", preview ? "" : "production"] : []),
        ...(secretsDir ? ["--secrets-file", path.join(secretsDir, "secrets.json")] : []),
      ]);
    } finally {
      if (secretsDir) await rm(secretsDir, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
