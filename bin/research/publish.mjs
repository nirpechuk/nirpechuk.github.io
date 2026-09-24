import { readFile, writeFile, mkdir, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encrypt, decrypt } from "./crypto.mjs";

const templatePath = fileURLToPath(new URL("./page.html", import.meta.url));
export function validateSlug(slug) {
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ["index", "manifest", "assets"].includes(slug)) {
    throw new Error("Use a short page name with lowercase letters, numbers, and hyphens.");
  }
  return slug;
}
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
export async function readManifest(root, password) {
  const file = path.join(root, "research/manifest.json");
  if (!(await exists(file))) return { kind: "index", pages: [] };
  try {
    return await decrypt(JSON.parse(await readFile(file, "utf8")), password);
  } catch {
    throw new Error("The password does not unlock the existing research section. Nothing was changed.");
  }
}
async function writeEnvelope(file, value, password) {
  await writeFile(file, JSON.stringify(await encrypt(value, password), null, 2) + "\n");
}
async function writeIndex(root, manifest, password) {
  const dir = path.join(root, "research");
  await mkdir(dir, { recursive: true });
  const shell = (await readFile(templatePath, "utf8")).replace("__PAYLOAD__", "manifest.json");
  await writeFile(path.join(dir, "index.html"), shell);
  await writeEnvelope(path.join(dir, "manifest.json"), manifest, password);
}
export async function initialize(root, password) {
  const manifest = await readManifest(root, password);
  await writeIndex(root, manifest, password);
  return ["research/index.html", "research/manifest.json"];
}
export async function publishPage({ root, source, slug, title, password }) {
  validateSlug(slug);
  // Read and validate everything before changing the published directory.
  const manifest = await readManifest(root, password);
  const relativeSource = path.relative(path.resolve(root), path.resolve(source));
  if (!relativeSource.startsWith(".." + path.sep) && !path.isAbsolute(relativeSource) && !relativeSource.startsWith(".research-source" + path.sep)) {
    throw new Error("Keep the original HTML outside the website folder, or in .research-source/, so it cannot be published without encryption.");
  }
  const html = await readFile(source, "utf8");
  if (!/<(?:html|body|head|!doctype)\b/i.test(html)) throw new Error("Choose an HTML webpage.");
  if (html.startsWith("---")) throw new Error("Export a standalone HTML file without Jekyll front matter.");
  // A report must travel as one file. Refuse missing local dependencies rather than publish a broken page.
  const refs = [...html.matchAll(/\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/\brel\s*=\s*["']stylesheet["']/i.test(match[0])) {
      const href = match[0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
      if (href) refs.push(href[1]);
    }
  }
  for (const match of html.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) refs.push(match[1]);
  const local = refs.find((ref) => !/^(https?:|data:|blob:|\/\/|#)/i.test(ref));
  if (local)
    throw new Error(
      `This page depends on a local asset (${local}). Export a self-contained HTML page with images, scripts, and styles embedded, or use absolute HTTPS asset URLs.`
    );
  title ||=
    html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      .replace(/<[^>]*>/g, "")
      .trim() || path.basename(source, path.extname(source));
  const updated = new Date().toISOString().slice(0, 10);
  const pageDir = path.join(root, "research", slug);
  await mkdir(pageDir, { recursive: true });
  await writeEnvelope(path.join(pageDir, "page.json"), { kind: "page", title, html, updated }, password);
  await writeFile(path.join(pageDir, "index.html"), (await readFile(templatePath, "utf8")).replace("__PAYLOAD__", "page.json"));
  manifest.pages = manifest.pages.filter((page) => page.slug !== slug);
  manifest.pages.unshift({ slug, title, updated });
  await writeIndex(root, manifest, password);
  return ["research/index.html", "research/manifest.json", `research/${slug}/index.html`, `research/${slug}/page.json`];
}
export async function removePage(root, slug, password) {
  validateSlug(slug);
  const manifest = await readManifest(root, password);
  if (!manifest.pages.some((page) => page.slug === slug)) throw new Error("That research page does not exist.");
  manifest.pages = manifest.pages.filter((page) => page.slug !== slug);
  await rm(path.join(root, "research", slug), { recursive: true });
  await writeIndex(root, manifest, password);
  return ["research/index.html", "research/manifest.json", `research/${slug}`];
}
