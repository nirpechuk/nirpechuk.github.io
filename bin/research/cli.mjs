#!/usr/bin/env node
// Local convenience wrapper; the same uploader also works on headless machines.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
let args = process.argv.slice(2);
if (args.includes("--choose")) {
  const source = execFileSync("osascript", ["-e", 'POSIX path of (choose file with prompt "Choose an HTML research page" of type {"html", "htm"})'], {
    encoding: "utf8",
  }).trim();
  args = [source, ...args.filter((arg) => arg !== "--choose"), "--replace"];
}
// Keep the existing Finder shortcut working; direct publishing needs no commit.
args = args.map((arg) => (arg === "--push" ? "--wait" : arg));
if (!args.includes("--password-file") && !process.env.RESEARCH_PASSWORD && existsSync(`${root}.research-password`))
  args.push("--password-file", `${root}.research-password`);
const result = spawnSync(process.execPath, [fileURLToPath(new URL("./research-publish/scripts/upload.mjs", import.meta.url)), ...args], {
  stdio: "inherit",
});
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else process.exitCode = result.status ?? 1;
