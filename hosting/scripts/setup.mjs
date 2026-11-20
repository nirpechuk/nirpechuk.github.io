import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { run, root, cloudflareEnv } from "./build.mjs";

try {
  run("npm", ["exec", "--", "wrangler", "whoami"]);
  // Listing first makes setup rerunnable without mistaking an authorization error for an existing bucket.
  const listed = spawnSync("npm", ["exec", "--", "wrangler", "r2", "bucket", "list"], { cwd: root, encoding: "utf8", env: cloudflareEnv });
  if (listed.status !== 0) throw new Error("Could not list R2 buckets. Run npx wrangler login and enable R2 in your account.");
  for (const name of ["nir-research", "nir-media"]) {
    if (!new RegExp(`\\b${name}\\b`).test(listed.stdout)) run("npm", ["exec", "--", "wrangler", "r2", "bucket", "create", name]);
  }
  const dir = path.join(homedir(), ".config/nir-research");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "publish-token");
  let token = (await readFile(file, "utf8").catch(() => "")).trim();
  if (!token) {
    token = randomBytes(32).toString("hex");
    await writeFile(file, token + "\n", { mode: 0o600, flag: "wx" });
  }
  await chmod(file, 0o600);
  if (token.length < 32) throw new Error("Existing publishing token is too short. Configure a random token with at least 32 characters.");
  // First deploy the apps and preview site; this command is deliberately explicit
  // about provisioning. It does not attach or change the production DNS domain.
  run(process.execPath, ["hosting/scripts/deploy.mjs", "all", "--preview"]);
  console.log(
    "Preview deployed. Set RESEARCH_SITE to the workers.dev URL shown above, then run research:import and media:migrate before production cutover."
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
