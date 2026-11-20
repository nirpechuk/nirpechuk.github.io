import reportRuntime from "./report-runtime.html";
export const CONTENT_ORIGIN = "https://reports.pechuk.com";
const VIEWER_ORIGIN = "https://nir.pechuk.com";
const decoder = new TextDecoder(),
  encoder = new TextEncoder();
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const encode = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const keyFor = (raw) => crypto.subtle.importKey("raw", typeof raw === "string" ? decode(raw) : raw, "AES-GCM", false, ["encrypt", "decrypt"]);
const noStore = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};
const error = (status, message) => new Response(message, { status, headers: noStore });
const cookieName = "__Host-nir-research";
const cookie = (value, age) => `${cookieName}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
const lifetime = 30 * 24 * 60 * 60;
async function mintSession(secret, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(cookieName) },
    await keyFor(secret),
    encoder.encode(JSON.stringify(payload))
  );
  return encode(new Uint8Array([...iv, ...new Uint8Array(data)]));
}
async function readSession(request, secret, epoch) {
  try {
    const token = request.headers
      .get("Cookie")
      ?.split(/;\s*/)
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!token || token.length > 2048 || !secret || !epoch) return null;
    const bytes = decode(token);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode(cookieName) },
      await keyFor(secret),
      bytes.slice(12)
    );
    const value = JSON.parse(decoder.decode(plain));
    return value.epoch === epoch && value.expires > Date.now() && typeof value.key === "string" && decode(value.key).length === 32 ? value : null;
  } catch {
    return null;
  }
}
async function sessionEndpoint(request, env, state) {
  if (request.headers.get("Origin") !== VIEWER_ORIGIN) return error(403, "Origin not allowed.");
  const headers = {
    ...noStore,
    "Access-Control-Allow-Origin": VIEWER_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
  if (request.method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        "Access-Control-Allow-Methods": "GET, POST, DELETE",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      },
    });
  if (request.method === "DELETE") return new Response("{}", { headers: { ...headers, "Set-Cookie": cookie("", 0) } });
  if (request.method === "GET")
    return new Response(JSON.stringify({ authenticated: !!(await readSession(request, env.RESEARCH_SESSION_SECRET, state.authEpoch)) }), { headers });
  if (request.method !== "POST") return error(405, "Method not allowed.");
  if (!env.RESEARCH_SESSION_SECRET) return new Response('{"error":"Session service unavailable."}', { status: 503, headers });
  if (!Number(request.headers.get("Content-Length")) || Number(request.headers.get("Content-Length")) > 2048)
    return new Response("{}", { status: 413, headers });
  try {
    const input = await request.json();
    const raw = typeof input.key === "string" ? decode(input.key) : new Uint8Array();
    if (raw.length !== 32) throw new Error("key");
    const object = await env.RESEARCH.get(state.manifest);
    if (!object || (typeof input.etag === "string" ? input.etag.replace(/^W\//, "") : "") !== object.httpEtag)
      return new Response('{"error":"Directory changed; retry."}', { status: 409, headers });
    const envelope = await object.json();
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv) }, await keyFor(raw), decode(envelope.data));
    const manifest = JSON.parse(decoder.decode(plain));
    if (manifest.kind !== "index" || typeof manifest.contentKey !== "string" || decode(manifest.contentKey).length !== 32) throw new Error("key");
    const token = await mintSession(env.RESEARCH_SESSION_SECRET, {
      key: manifest.contentKey,
      epoch: state.authEpoch,
      expires: Date.now() + lifetime * 1000,
    });
    return new Response('{"authenticated":true}', { headers: { ...headers, "Set-Cookie": cookie(token, lifetime) } });
  } catch {
    return new Response('{"error":"Unlock failed."}', { status: 401, headers });
  }
}
export async function openReport(envelope, raw) {
  if (envelope?.version !== 2 || envelope.algorithm !== "AES-GCM" || envelope.encoding !== "gzip") throw new Error("format");
  const compressed = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv) }, await keyFor(raw), decode(envelope.data));
  return JSON.parse(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}
function byteRange(header, size) {
  if (!header) return { start: 0, end: size - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size ? { start, end, status: 206 } : null;
}
async function assetResponse(request, bucket, objectKey, raw) {
  const object = await bucket.get(objectKey, { range: { offset: 0, length: 32 } });
  if (!object) return error(404, "Not found.");
  const header = new Uint8Array(await object.arrayBuffer()),
    view = new DataView(header.buffer);
  if (header.length !== 32 || decoder.decode(header.slice(0, 4)) !== "NIR2") throw new Error("format");
  const chunkSize = view.getUint32(4),
    size = Number(view.getBigUint64(8));
  if (
    chunkSize !== 262144 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 80 * 1024 * 1024 ||
    object.size !== 32 + size + 16 * Math.ceil(size / chunkSize)
  )
    throw new Error("format");
  const headers = new Headers({
    ...noStore,
    "Cache-Control": "private, no-cache",
    "Content-Type": object.customMetadata?.type || "application/octet-stream",
    "Accept-Ranges": "bytes",
    ETag: object.httpEtag,
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (request.headers.get("If-None-Match") === object.httpEtag) return new Response(null, { status: 304, headers });
  const wanted =
    request.method === "HEAD" || (request.headers.has("If-Range") && request.headers.get("If-Range") !== object.httpEtag)
      ? null
      : request.headers.get("Range");
  const range = byteRange(wanted, size);
  if (!range) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end, status } = range;
  headers.set("Content-Length", String(end - start + 1));
  if (status === 206) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  if (request.method === "HEAD") return new Response(null, { headers });
  const first = Math.floor(start / chunkSize),
    last = Math.floor(end / chunkSize);
  const encryptedStart = 32 + first * (chunkSize + 16),
    encryptedEnd = 32 + last * (chunkSize + 16) + Math.min(chunkSize, size - last * chunkSize) + 16;
  const stored = await bucket.get(objectKey, { range: { offset: encryptedStart, length: encryptedEnd - encryptedStart } });
  if (!stored) return error(404, "Not found.");
  const reader = stored.body.getReader(),
    key = await keyFor(raw);
  const keyBytes = encoder.encode(objectKey),
    aad = new Uint8Array(32 + keyBytes.length);
  aad.set(header);
  aad.set(keyBytes, 32);
  let pending = new Uint8Array(),
    index = first;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (index > last) {
          controller.close();
          await reader.cancel();
          return;
        }
        const length = Math.min(chunkSize, size - index * chunkSize) + 16;
        while (pending.length < length) {
          const part = await reader.read();
          if (part.done) throw new Error("Incomplete asset.");
          const merged = new Uint8Array(pending.length + part.value.length);
          merged.set(pending);
          merged.set(part.value, pending.length);
          pending = merged;
        }
        const iv = header.slice(16, 28),
          ivView = new DataView(iv.buffer);
        ivView.setUint32(8, (ivView.getUint32(8) ^ index) >>> 0);
        const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, pending.slice(0, length)));
        pending = pending.slice(length);
        controller.enqueue(plain.slice(Math.max(0, start - index * chunkSize), Math.min(plain.length, end - index * chunkSize + 1)));
        index++;
      } catch (cause) {
        await reader.cancel().catch(() => {});
        controller.error(new Error("Unable to read protected media."));
      }
    },
    cancel() {
      return reader.cancel();
    },
  });
  return new Response(stream, { status, headers });
}
export async function protectedContent(request, env) {
  const url = new URL(request.url),
    stored = await env.RESEARCH.get("state.json");
  if (!stored) return error(503, "Reports unavailable.");
  const state = await stored.json();
  if (url.pathname === "/session") return sessionEndpoint(request, env, state);
  if (!["GET", "HEAD"].includes(request.method)) return error(405, "Method not allowed.");
  const match = /^\/r\/([a-z0-9-]+)\/(?:assets\/([a-f0-9-]{36}))?$/.exec(url.pathname);
  if (!match) return error(404, "Not found.");
  const entry = state.content?.[match[1]];
  if (!entry || entry.page !== state.pages[match[1]]) return error(404, "Not found.");
  const session = await readSession(request, env.RESEARCH_SESSION_SECRET, state.authEpoch);
  if (!session) return error(401, "Open this report through nir.pechuk.com to unlock it.");
  if (match[2]) {
    const key = `assets/${match[2]}`;
    if (!entry.assets.includes(key)) return error(404, "Not found.");
    return assetResponse(request, env.RESEARCH, key, session.key);
  }
  const object = await env.RESEARCH.get(entry.page);
  if (!object) return error(404, "Not found.");
  const headers = {
    ...noStore,
    "Cache-Control": "private, no-cache",
    "Content-Type": "text/html; charset=utf-8",
    ETag: object.httpEtag,
    "Content-Security-Policy": `frame-ancestors ${VIEWER_ORIGIN}; base-uri 'self'; object-src 'none'`,
  };
  if (request.headers.get("If-None-Match") === object.httpEtag) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") return new Response(null, { headers });
  const report = await openReport(await object.json(), session.key);
  if (report.kind !== "page" || typeof report.html !== "string") throw new Error("format");
  const runtime = reportRuntime;
  const html = /<head\b[^>]*>/i.test(report.html) ? report.html.replace(/<head\b[^>]*>/i, (head) => head + runtime) : runtime + report.html;
  return new Response(html, { headers });
}
