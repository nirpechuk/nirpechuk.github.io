const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const keyValid = (key) =>
  typeof key === "string" &&
  key.length <= 500 &&
  /^[a-zA-Z0-9_./-]+$/.test(key) &&
  key.split("/").every((part) => part && part !== "." && part !== "..");
async function smallJson(request) {
  const size = Number(request.headers.get("content-length"));
  if (!size || size > 2 * 1024 * 1024) throw new Error("Invalid metadata size");
  return request.json();
}

// Called only after the main Worker verifies the publishing token. Multipart
// uploads keep large videos below the per-request body and memory limits.
export async function mediaApi(request, bucket) {
  const url = new URL(request.url);
  if (url.pathname === "/api/media/start" && request.method === "POST") {
    const { key, size, contentType, sha256 } = await smallJson(request);
    if (
      !keyValid(key) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 500 * 1024 ** 3 ||
      typeof contentType !== "string" ||
      !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(contentType) ||
      !/^[a-f0-9]{64}$/.test(sha256 || "")
    )
      return reply({ error: "Invalid upload metadata." }, 400);
    const existing = await bucket.head(key);
    if (existing)
      return existing.size === size && existing.customMetadata?.sha256 === sha256
        ? reply({ status: "exists", key })
        : reply({ error: "A different file already uses this key. Choose a new name." }, 409);
    const upload = await bucket.createMultipartUpload(key, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { sha256, expectedSize: String(size) },
    });
    return reply({ key, uploadId: upload.uploadId }, 201);
  }
  const key = url.searchParams.get("key"),
    id = url.searchParams.get("uploadId");
  if (!keyValid(key) || !id || id.length > 1000) return reply({ error: "Invalid upload." }, 400);
  const upload = bucket.resumeMultipartUpload(key, id);
  if (url.pathname === "/api/media/part" && request.method === "PUT") {
    const part = Number(url.searchParams.get("part")),
      length = Number(request.headers.get("content-length"));
    if (!Number.isInteger(part) || part < 1 || part > 10000 || !length || length > 64 * 1024 * 1024)
      return reply({ error: "Invalid upload part." }, 400);
    return reply(await upload.uploadPart(part, request.body));
  }
  if (url.pathname === "/api/media/complete" && request.method === "POST") {
    const { parts } = await smallJson(request);
    if (!Array.isArray(parts) || !parts.length || parts.length > 10000 || parts.some((p, i) => p.partNumber !== i + 1 || typeof p.etag !== "string"))
      return reply({ error: "Invalid part list." }, 400);
    await upload.complete(parts);
    // Production R2 completion responses can omit custom metadata; HEAD is authoritative.
    const object = await bucket.head(key);
    if (!object) throw new Error("Completed upload is missing");
    if (String(object.size) !== object.customMetadata?.expectedSize)
      return reply({ error: "Uploaded size differs from the source. Inspect before retrying." }, 409);
    return reply({ status: "uploaded", key, size: object.size, etag: object.httpEtag });
  }
  if (url.pathname === "/api/media/abort" && request.method === "DELETE") {
    await upload.abort();
    return reply({ status: "aborted" });
  }
  return reply({ error: "Not found." }, 404);
}
