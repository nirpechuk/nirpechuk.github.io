import { execFileSync } from "node:child_process";

export function affectedTargets(files) {
  const targets = new Set();
  for (const file of files) {
    if (file.startsWith("hosting/migration-crypto.")) {
      targets.add("flats");
      continue;
    }
    if (/^(?:work\/|dist\/|fitness\/|flats\/|research\/)/.test(file)) continue;
    if (/^apps\/(fitness|flats)\//.test(file)) {
      targets.add(file.split("/")[1]);
      continue;
    }
    if (["package.json", "package-lock.json", ".github/workflows/cloudflare.yml"].includes(file) || file.startsWith("hosting/scripts/")) {
      for (const target of ["site", "fitness", "flats"]) targets.add(target);
    } else if (!["README.md", "hosting/README.md"].includes(file)) targets.add("site");
  }
  return [...targets].sort();
}
if (process.argv[1]?.endsWith("/changed.mjs")) {
  const before = process.env.BEFORE;
  const files =
    !before || /^0+$/.test(before) || process.env.EVENT_NAME === "workflow_dispatch"
      ? null
      : execFileSync("git", ["diff", "--name-only", before, "HEAD"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  console.log(`targets=${JSON.stringify(files ? affectedTargets(files) : ["fitness", "flats", "site"])}`);
}
