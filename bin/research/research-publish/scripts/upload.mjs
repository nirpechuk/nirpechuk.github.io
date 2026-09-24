#!/usr/bin/env node
// Standalone uploader: Node.js 20+, no packages, Git checkout, or local Git required.
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const repository = "nirpechuk/nirpechuk.github.io";
const branch = "main";
const site = "https://nirpechuk.github.io";
const rounds = 250000;

// This wire format is shared with crypto.mjs and the browser's research.js.
async function keyFor(password, salt) {
  const material = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
export async function seal(value, password) {
  if (!password) throw new Error("The research password is empty.");
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const data = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return {
    version: 1,
    iterations: rounds,
    salt: Buffer.from(salt).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(data).toString("base64"),
  };
}
export async function unseal(value, password) {
  if (value.version !== 1 || value.iterations !== rounds) throw new Error("Unsupported research format.");
  const key = await keyFor(password, Buffer.from(value.salt, "base64"));
  const data = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(value.iv, "base64") }, key, Buffer.from(value.data, "base64"));
  return JSON.parse(new TextDecoder().decode(data));
}
export function validateInput(html, slug) {
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ["index", "manifest", "assets"].includes(slug))
    throw new Error("Use a page slug with lowercase letters, numbers, and hyphens.");
  if (Buffer.byteLength(html) > 10 * 1024 * 1024) throw new Error("HTML must be at most 10 MiB. Compress embedded images first.");
  if (!/<(?:html|body|head|!doctype)\b/i.test(html) || html.startsWith("---"))
    throw new Error("Provide a standalone HTML file without Jekyll front matter.");
  const refs = [...html.matchAll(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => m[1] ?? m[2] ?? m[3]);
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = match[0].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (href) refs.push(href[1] ?? href[2] ?? href[3]);
  }
  for (const match of html.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) refs.push(match[1]);
  const local = refs.find((ref) => !/^(https?:|data:|blob:|\/\/|#)/i.test(ref));
  if (local !== undefined) throw new Error(`Embed local asset ${JSON.stringify(local)} in the HTML, or use an absolute HTTPS URL.`);
}
export function githubClient(token, fetcher = fetch) {
  return async (route, method = "GET", body) => {
    const response = await fetcher(`https://api.github.com/repos/${repository}${route}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "nir-research-uploader",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
      redirect: "error",
    });
    if (!response.ok) {
      // Do not echo response bodies, uploaded contents, or credentials into agent logs.
      const error = new Error(
        `GitHub returned HTTP ${response.status} for ${method} ${route.split("?")[0]}. Check repository access and branch permissions.`
      );
      error.status = response.status;
      throw error;
    }
    return response.json();
  };
}
async function remoteFile(api, file, sha) {
  const result = await api(`/contents/${file}?ref=${encodeURIComponent(sha)}`);
  if (result.encoding !== "base64" || typeof result.content !== "string") throw new Error(`Could not read ${file} from GitHub.`);
  return Buffer.from(result.content, "base64").toString("utf8");
}
export async function upload({ api, password, html, slug, title, replace = false, dryRun = false, list = false }) {
  if (!list) validateInput(html, slug);
  const head = (await api(`/git/ref/heads/${branch}`)).object.sha;
  let manifest;
  try {
    manifest = await unseal(JSON.parse(await remoteFile(api, "research/manifest.json", head)), password);
  } catch (error) {
    if (error.status) throw error;
    throw new Error("Could not unlock the research directory. Check the research password. No files were uploaded.");
  }
  if (manifest.kind !== "index" || !Array.isArray(manifest.pages)) throw new Error("Invalid research directory. No files were uploaded.");
  if (list) return { pages: manifest.pages.map((page) => ({ ...page, url: `${site}/research/${page.slug}/` })) };
  const existing = manifest.pages.some((page) => page.slug === slug);
  if (existing && !replace) throw new Error(`Page ${slug} already exists. Use --replace to update it, or choose another --slug.`);
  title ||=
    html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      .replace(/<[^>]*>/g, "")
      .trim() || slug;
  const shell = await remoteFile(api, "bin/research/page.html", head);
  if (!shell.includes("__PAYLOAD__")) throw new Error("The research page template is incompatible with this uploader.");
  const url = `${site}/research/${slug}/`;
  if (dryRun)
    return { status: "validated", action: existing ? "update" : "create", url, title, sourceBytes: Buffer.byteLength(html), baseCommit: head };
  const updated = new Date().toISOString().slice(0, 10);
  const payload = await seal({ kind: "page", title, html, updated }, password);
  manifest.pages = [{ slug, title, updated }, ...manifest.pages.filter((page) => page.slug !== slug)];
  const stringify = (value) => JSON.stringify(value, null, 2) + "\n";
  const files = {
    "research/index.html": shell.replace("__PAYLOAD__", "manifest.json"),
    "research/manifest.json": stringify(await seal(manifest, password)),
    [`research/${slug}/index.html`]: shell.replace("__PAYLOAD__", "page.json"),
    [`research/${slug}/page.json`]: stringify(payload),
  };
  const base = await api(`/git/commits/${head}`);
  const tree = await api("/git/trees", "POST", {
    base_tree: base.tree.sha,
    tree: Object.entries(files).map(([file, content]) => ({ path: file, mode: "100644", type: "blob", content })),
  });
  const commit = await api("/git/commits", "POST", { message: `Publish research page ${slug}`, tree: tree.sha, parents: [head] });
  try {
    await api(`/git/refs/heads/${branch}`, "PATCH", { sha: commit.sha, force: false });
  } catch (error) {
    if (error.status === 409 || error.status === 422)
      throw new Error(
        "GitHub rejected the branch update (concurrent change or branch rule). No forced update was attempted. Check the branch and run again."
      );
    throw new Error(`Could not confirm the branch update for commit ${commit.sha}. Check that commit on GitHub before retrying. ${error.message}`);
  }
  return { status: "queued", url, commit: commit.sha, commitUrl: `https://github.com/${repository}/commit/${commit.sha}`, payload };
}
export async function waitForPage(
  result,
  { fetcher = fetch, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 300000 } = {}
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetcher(`${result.url}page.json?commit=${result.commit}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (response.ok && (await response.json()).data === result.payload.data) return { ...result, status: "live" };
    } catch {
      /* A deployment or temporary network error may still be in progress. */
    }
    await pause(15000);
  }
  throw new Error(
    `Commit ${result.commit} was published, but the live page was not confirmed within five minutes. Check https://github.com/${repository}/actions. Do not upload again just to retry this check.`
  );
}
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      slug: { type: "string" },
      title: { type: "string" },
      "password-file": { type: "string" },
      replace: { type: "boolean" },
      "dry-run": { type: "boolean" },
      wait: { type: "boolean" },
      list: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help || (!positionals.length && !values.list)) {
    console.log(
      'node upload.mjs /path/to/report.html --slug experiment-notes [--title "Experiment notes"] [--replace] [--dry-run] [--wait]\nnode upload.mjs --list\nAuth: GH_TOKEN / GITHUB_TOKEN or gh auth login.\nPassword: RESEARCH_PASSWORD or --password-file PATH or ~/.config/nir-research/password.'
    );
    return;
  }
  if (positionals.length > 1 || (values.list && positionals.length)) throw new Error("Provide one HTML file, or --list alone.");
  const password =
    process.env.RESEARCH_PASSWORD ||
    (
      await readFile(values["password-file"] || path.join(homedir(), ".config/nir-research/password"), "utf8").catch(() => {
        throw new Error("Set RESEARCH_PASSWORD or create ~/.config/nir-research/password (mode 600). You can also use --password-file PATH.");
      })
    ).trim();
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      token = execFileSync("gh", ["auth", "token", "--hostname", "github.com"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch {
      throw new Error("Set GH_TOKEN, or sign in with gh auth login on this machine.");
    }
  }
  if (!token) throw new Error("GitHub authentication is empty.");
  const source = positionals[0];
  let result = await upload({
    api: githubClient(token),
    password,
    html: source ? await readFile(source, "utf8") : undefined,
    slug:
      values.slug ||
      (source &&
        path
          .basename(source, path.extname(source))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")),
    title: values.title,
    replace: values.replace,
    dryRun: values["dry-run"],
    list: values.list,
  });
  if (values.wait && result.status === "queued") result = await waitForPage(result);
  const { payload, ...output } = result;
  console.log(JSON.stringify(output, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
}
