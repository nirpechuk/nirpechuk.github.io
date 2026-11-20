import { spawnSync } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const cloudflareEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "f5542da2ba1d6b3830a7e089947a50f7" };
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: cloudflareEnv, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}.`);
}
export async function checkAssets(directory) {
  let count = 0;
  async function visit(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error(`Do not publish symlinks: ${file}`);
      if (item.isDirectory()) await visit(file);
      else {
        count++;
        if ((await stat(file)).size > 25 * 1024 * 1024) throw new Error(`Asset exceeds 25 MiB; move it to R2 with media:upload: ${file}`);
        if (/^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.research-password|\.admin-password)$/.test(item.name))
          throw new Error(`Secret file in output: ${file}`);
      }
    }
  }
  await visit(directory);
  if (count > 20000) throw new Error("Static output exceeds the Workers Free asset count limit.");
  console.log(`Checked ${count} deployable assets in ${path.relative(root, directory)}.`);
}
export async function build(target) {
  const env = { ...process.env, NIR_CLOUDFLARE: "1", JEKYLL_ENV: "production" };
  if (target === "all") {
    for (const name of ["fitness", "flats", "site"]) await build(name);
    return;
  }
  if (target === "site") {
    run("bundle", ["exec", "jekyll", "build", "--config", "_config.yml,_config.cloudflare.yml"], { env });
    // The existing purge configuration reads _site. Pass explicit paths for this output.
    run(
      process.execPath,
      [
        "node_modules/purgecss/bin/purgecss.js",
        "--css",
        "dist/site/assets/css/main.css",
        "--content",
        "dist/site/**/*.html",
        "dist/site/assets/js/**/*.js",
        "--output",
        "dist/site/assets/css/",
      ],
      { env }
    );
    await writeFile(path.join(root, "dist/site/.assetsignore"), "**/.DS_Store\n**/*.map\n");
  } else if (["fitness", "flats"].includes(target)) {
    await mkdir(path.join(root, "dist", target), { recursive: true });
    const cwd = path.join(root, "apps", target);
    run("npm", ["exec", "--", "tsc", "--noEmit"], { cwd, env });
    run("npm", ["exec", "--", "vite", "build"], { cwd, env });
  } else throw new Error("Choose site, fitness, flats, or all.");
  await checkAssets(path.join(root, "dist", target));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build(process.argv[2] || "all").catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
