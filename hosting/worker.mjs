import { CONTENT_ORIGIN, protectedContent } from "./research-content.mjs";
import shell from "../bin/research/page.html";
import directory from "./research-directory.html";
import { mediaApi } from "./media-api.mjs";

const STATE_KEY = "state.json";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assetPattern = /^assets\/[a-f0-9-]{36}$/;
const objectPattern = /^objects\/[a-f0-9-]{36}$/;
const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive" };
const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...noStore, "Content-Type": "application/json", ...headers },
  });
const failure = (status, message) => json({ error: message }, status);
const validSlug = (slug) => slugPattern.test(slug) && !["index", "manifest", "assets", "admin"].includes(slug);

async function authorized(request, env) {
  if (!env.PUBLISH_TOKEN || env.PUBLISH_TOKEN.length < 32) return false;
  const supplied = request.headers.get("authorization") || "";
  const digest = (text) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const [a, b] = await Promise.all([digest(supplied), digest(`Bearer ${env.PUBLISH_TOKEN}`)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function readState(bucket) {
  const object = await bucket.get(STATE_KEY);
  return object ? { state: await object.json(), etag: object.httpEtag } : { state: null, etag: null };
}

function validState(state) {
  return (
    state?.version === 1 &&
    objectPattern.test(state.manifest) &&
    objectPattern.test(state.admin) &&
    state.pages &&
    typeof state.pages === "object" &&
    !Array.isArray(state.pages) &&
    Object.keys(state.pages).length <= 1000 &&
    Object.entries(state.pages).every(([slug, key]) => validSlug(slug) && objectPattern.test(key)) &&
    (!state.content ||
      (typeof state.authEpoch === "string" &&
        /^[a-f0-9-]{36}$/.test(state.authEpoch) &&
        typeof state.content === "object" &&
        !Array.isArray(state.content) &&
        Object.keys(state.content).length <= 1000 &&
        Object.entries(state.content).every(
          ([slug, entry]) =>
            validSlug(slug) &&
            objectPattern.test(entry?.page) &&
            Array.isArray(entry.assets) &&
            entry.assets.length <= 2000 &&
            entry.assets.every((key) => assetPattern.test(key))
        )))
  );
}

async function publishing(request, env, pathname) {
  // No CORS grant: browser scripts on other sites cannot use this API.
  if (request.headers.has("origin") || !(await authorized(request, env))) return failure(401, "Publishing authentication required.");
  if (pathname === "/api/publish/state") {
    if (request.method === "GET") return json(await readState(env.RESEARCH));
    if (request.method !== "PUT") return failure(405, "Method not allowed.");
    const size = Number(request.headers.get("content-length"));
    if (!size || size > 1024 * 1024) return failure(413, "State must have a Content-Length of at most 1 MiB.");
    const expected = request.headers.get("if-match");
    const create = request.headers.get("if-none-match") === "*";
    if ((!expected && !create) || (expected && create)) return failure(428, "Supply exactly one revision precondition.");
    let state;
    try {
      state = await request.json();
    } catch {
      return failure(400, "Invalid state JSON.");
    }
    if (!validState(state)) return failure(400, "Invalid research state.");
    const previous = await readState(env.RESEARCH);
    if ((create && previous.state) || (expected && previous.etag !== expected))
      return failure(412, "Research changed. Read the latest state before retrying.");
    const oldKeys = new Set(previous.state ? [previous.state.manifest, previous.state.admin, ...Object.values(previous.state.pages)] : []);
    const added = [...new Set([state.manifest, state.admin, ...Object.values(state.pages)])].filter((key) => !oldKeys.has(key));
    // Large imports/rotations need Workers Paid for its higher subrequest limit.
    for (const key of added) if (!(await env.RESEARCH.head(key))) return failure(400, "Upload every referenced object before committing.");
    const conditions = new Headers(create ? { "If-None-Match": "*" } : { "If-Match": expected });
    // This one conditional write is the commit point. Objects are immutable, so
    // readers see an entire old or new state, never a partially uploaded report.
    const object = await env.RESEARCH.put(STATE_KEY, JSON.stringify(state), {
      onlyIf: conditions,
      httpMetadata: { contentType: "application/json" },
    });
    if (!object) return failure(412, "Research changed during publication. Read the latest state before retrying.");
    return json({ etag: object.httpEtag });
  }
  const key = pathname.slice("/api/publish/".length);
  if (!objectPattern.test(key) && !assetPattern.test(key)) return failure(404, "Not found.");
  if (request.method === "GET") {
    const object = await env.RESEARCH.get(key);
    if (assetPattern.test(key))
      return object
        ? new Response(object.body, {
            headers: {
              ...noStore,
              "Content-Type": "application/octet-stream",
              "X-Asset-Type": object.customMetadata?.type || "application/octet-stream",
            },
          })
        : failure(404, "Not found.");
    return objectResponse(object, request);
  }
  if (request.method !== "PUT") return failure(405, "Method not allowed.");
  const length = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length <= 0 || length > 80 * 1024 * 1024)
    return failure(413, "Encrypted uploads must be at most 80 MiB with a Content-Length.");
  const binary = assetPattern.test(key);
  if (request.headers.get("content-type") !== (binary ? "application/octet-stream" : "application/json"))
    return failure(415, "Expected encrypted content.");
  const assetType = request.headers.get("x-asset-type");
  // Folder reports also carry pages, scripts, styles, and data. They are served only to
  // unlocked sessions on the isolated reports origin, alongside the report's own scripts.
  if (
    binary &&
    !/^(?:(?:image|video|audio|font)\/[a-z0-9.+-]+|application\/(?:pdf|octet-stream|font-woff|json|wasm)|text\/(?:html|css|javascript|plain|csv))$/.test(
      assetType || ""
    )
  )
    return failure(400, "Invalid media type.");
  const checksum = request.headers.get("x-content-sha256");
  if (!/^[a-f0-9]{64}$/.test(checksum || "")) return failure(400, "An upload checksum is required.");
  // Stream large encrypted payloads directly to R2, keeping them out of Worker memory.
  const object = await env.RESEARCH.put(key, request.body, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    sha256: checksum,
    httpMetadata: { contentType: binary ? "application/octet-stream" : "application/json", cacheControl: "no-store" },
    ...(binary ? { customMetadata: { type: assetType } } : {}),
  });
  return object ? json({ key, etag: object.httpEtag }, 201) : failure(412, "This immutable upload already exists.");
}

function objectResponse(object, request) {
  if (!object) return failure(404, "Not found.");
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers: { ...noStore, "Content-Type": "application/json", "Content-Length": String(object.size), ETag: object.httpEtag },
  });
}

async function research(request, env, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) return failure(405, "Method not allowed.");
  const { state } = await readState(env.RESEARCH);
  if (!state) return failure(503, "Research migration has not been initialized.");
  let key;
  if (pathname === "/research/manifest.json") key = state.manifest;
  else if (pathname === "/research/admin.json") key = state.admin;
  else {
    const match = pathname.match(/^\/research\/([a-z0-9-]+)\/page\.json$/);
    if (match && Object.hasOwn(state.pages, match[1])) key = state.pages[match[1]];
  }
  if (key) return objectResponse(await env.RESEARCH.get(key), request);
  const page = pathname.match(/^\/research\/([a-z0-9-]+)(?:\/|\/index\.html)?$/);
  const index = ["/research", "/research/", "/research/index.html"].includes(pathname);
  if (!index && (!page || !Object.hasOwn(state.pages, page[1]))) return failure(404, "Not found.");
  const canonical = index ? "/research/" : `/research/${page[1]}/`;
  if (pathname !== canonical) return canonicalRedirect(request, canonical);
  if (index) return htmlResponse(request, directory);
  return htmlResponse(
    request,
    shell.replace("__PAYLOAD__", "page.json").replace("__STREAM__", state.content?.[page[1]]?.page === state.pages[page[1]] ? "1" : "0")
  );
}

function canonicalRedirect(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Response(null, { status: 308, headers: { ...noStore, Location: url.href } });
}
const htmlResponse = (request, html) =>
  new Response(request.method === "HEAD" ? null : html, { headers: { ...noStore, "Content-Type": "text/html; charset=utf-8" } });

// The admin console unlocks the encrypted admin vault, which holds the research password.
function admin(request, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) return failure(405, "Method not allowed.");
  if (pathname !== "/admin/") return canonicalRedirect(request, "/admin/");
  return htmlResponse(request, shell.replace("__PAYLOAD__", "admin.json").replace("__STREAM__", "0"));
}

async function media(request, env, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) return failure(405, "Method not allowed.");
  const key = decodeURIComponent(pathname.replace(/^\/media\//, "").replace(/^\//, ""));
  const meta = await env.MEDIA.head(key);
  if (!meta) return failure(404, "Not found.");
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    ETag: meta.httpEtag,
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  meta.writeHttpMetadata(headers);
  if (request.headers.get("if-none-match") === meta.httpEtag) return new Response(null, { status: 304, headers });
  let start = 0,
    end = meta.size - 1,
    status = 200;
  const range = request.headers.get("range");
  if (range && request.method !== "HEAD" && (!request.headers.has("if-range") || request.headers.get("if-range") === meta.httpEtag)) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, { status: 416, headers: { ...Object.fromEntries(headers), "Content-Range": `bytes */${meta.size}` } });
    if (!match[1]) start = Math.max(0, meta.size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    }
    if (start > end || start >= meta.size)
      return new Response(null, { status: 416, headers: { ...Object.fromEntries(headers), "Content-Range": `bytes */${meta.size}` } });
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${meta.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  if (request.method === "HEAD") return new Response(null, { headers });
  const object = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
  if (!object) return failure(404, "Not found.");
  return new Response(object.body, { status, headers });
}

export default {
  async fetch(request, env) {
    try {
      const { pathname, origin } = new URL(request.url);
      if (origin === CONTENT_ORIGIN) return await protectedContent(request, env);
      if (pathname.startsWith("/api/media/")) {
        if (request.headers.has("origin") || !(await authorized(request, env))) return failure(401, "Publishing authentication required.");
        return await mediaApi(request, env.MEDIA);
      }
      if (pathname.startsWith("/api/publish/")) return await publishing(request, env, pathname);
      if (pathname === "/research" || pathname.startsWith("/research/")) return await research(request, env, pathname);
      if (["/admin", "/admin/", "/admin/index.html"].includes(pathname)) return admin(request, pathname);
      for (const [prefix, service] of [
        ["fitness", "FITNESS"],
        ["flats", "FLATS"],
      ]) {
        if (pathname === `/${prefix}`) {
          const url = new URL(request.url);
          url.pathname += "/";
          return Response.redirect(url.href, 308);
        }
        if (pathname.startsWith(`/${prefix}/`)) return await env[service].fetch(request);
      }
      if (pathname.startsWith("/media/") || pathname.startsWith("/assets/video/") || /^\/talks\/[^/]+\/video\//.test(pathname))
        return await media(request, env, pathname);
      return await env.ASSETS.fetch(request);
    } catch {
      // Never include credentials, report content, or upstream errors in responses/logs.
      console.error(JSON.stringify({ event: "request_failed" }));
      return failure(500, "Request failed. Check the deployment and storage bindings.");
    }
  },
};
