#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initialize, publishPage, removePage, readManifest } from "./publish.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i < 0 ? undefined : args[i + 1];
};
const git = (...params) => execFileSync("git", params, { cwd: root, encoding: "utf8" }).trim();
try {
  if (!args.length || args.includes("--help")) {
    console.log(
      'Publish: npm run research:publish -- /path/to/page.html [--slug page-name] [--title "Page title"] [--push]\nChoose a file: npm run research:publish -- --choose --push\nList: npm run research:publish -- --list\nRemove: npm run research:publish -- --delete page-name --push'
    );
    process.exit(0);
  }
  const push = args.includes("--push");
  if (push) {
    if (git("diff", "--cached", "--name-only")) throw new Error("There are already staged changes. Commit or unstage them before publishing.");
    if (git("branch", "--show-current") !== "main") throw new Error("Switch to main before publishing online.");
  }
  let password = process.env.RESEARCH_PASSWORD;
  if (!password) {
    try {
      password = (await readFile(path.join(root, ".research-password"), "utf8")).trim();
    } catch {
      throw new Error("Save the shared password in .research-password in the website folder, or set RESEARCH_PASSWORD.");
    }
  }
  let files;
  let message;
  if (args.includes("--list")) {
    const { pages } = await readManifest(root, password);
    for (const page of pages) console.log(`${page.title}\nhttps://nirpechuk.github.io/research/${page.slug}/\n`);
    if (!pages.length) console.log("No research pages yet.");
    process.exit(0);
  } else if (args.includes("--init")) {
    files = await initialize(root, password);
    message = "Initialize protected research section";
  } else if (args.includes("--delete")) {
    const slug = value("--delete");
    files = await removePage(root, slug, password);
    message = `Remove research page ${slug}`;
  } else {
    const source = args.includes("--choose")
      ? execFileSync("osascript", ["-e", 'POSIX path of (choose file with prompt "Choose an HTML research page" of type {"html", "htm"})'], {
          encoding: "utf8",
        }).trim()
      : args[0];
    if (!source || source.startsWith("--")) throw new Error("Choose an HTML file to publish.");
    const slug =
      value("--slug") ||
      path
        .basename(source, path.extname(source))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    files = await publishPage({ root, source: path.resolve(source), slug, title: value("--title"), password });
    message = `Publish research page ${slug}`;
    console.log(`Page prepared: https://nirpechuk.github.io/research/${slug}/`);
  }
  if (push) {
    git("add", "--", ...files);
    git("commit", "-m", message);
    git("push", "origin", "main");
    console.log("Pushed. GitHub Pages will update in a few minutes.");
  } else {
    console.log("Prepared locally. Add --push to commit and publish online.");
  }
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
}
