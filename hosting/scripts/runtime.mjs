// Keep repository tooling independent of the user's system Node/Ruby versions.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [script, ...args] = process.argv.slice(2);
if (!script) throw new Error("A repository script is required.");
const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };
if (process.platform === "darwin" && existsSync("/opt/homebrew/opt/ruby/bin/bundle")) {
  env.PATH = `/opt/homebrew/opt/ruby/bin:${env.PATH}`;
  if (existsSync(path.join(root, "vendor/bundle"))) env.BUNDLE_PATH ||= path.join(root, "vendor/bundle");
  env.BUNDLE_USER_HOME ||= path.join(root, ".bundle");
}
const current = process.versions.node.split(".").map(Number);
const supported = current[0] > 22 || (current[0] === 22 && current[1] >= 20);
const command = supported ? process.execPath : "npx";
const parameters = supported ? [script, ...args] : ["--yes", "--package=node@22", "--", "node", process.argv[1], script, ...args];
const result = spawnSync(command, parameters, { cwd: root, env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
