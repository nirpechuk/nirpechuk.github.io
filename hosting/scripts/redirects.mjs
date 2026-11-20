import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { root } from "./build.mjs";

const output = path.join(root, "dist/redirects");
const paths = JSON.parse(await readFile(path.join(root, "hosting/redirect-paths.json"), "utf8"));
await rm(output, { recursive: true, force: true });
for (const file of paths) {
  if (!/^[a-zA-Z0-9_./-]+\.html$/.test(file) || file.includes("..")) throw new Error("Invalid redirect path");
  const url = `https://nir.pechuk.com/${file.replace(/index\.html$/, "")}`;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nir Pechuk — new address</title>
${file === "404.html" ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}"><meta http-equiv="refresh" content="0;url=${url}">`}
<script>location.replace("https://nir.pechuk.com"+location.pathname+location.search+location.hash)</script>
<p>This page has moved to <a href="${url}">nir.pechuk.com</a>.</p></html>`;
  await mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await writeFile(path.join(output, file), html);
}
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, "flats/migrate.html"), await readFile(path.join(root, "hosting/legacy-flats.html")));
await writeFile(path.join(output, "flats/migration-crypto.js"), await readFile(path.join(root, "hosting/migration-crypto.mjs")));
await mkdir(path.join(output, "research"), { recursive: true });
await writeFile(path.join(output, "research/migrate.html"), await readFile(path.join(root, "hosting/legacy-research.html")));
await writeFile(path.join(output, "research/migration-crypto.js"), await readFile(path.join(root, "assets/research/handoff.js")));
console.log(`Built ${paths.length} redirects preserving paths, queries, and fragments.`);
