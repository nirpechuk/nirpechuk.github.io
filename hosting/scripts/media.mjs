import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { configuredClient } from "../../bin/research/research-publish/scripts/upload.mjs";
import { root } from "./build.mjs";
import { prepareVideo } from "./video.mjs";

const contentTypes = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".txt": "text/plain",
};

async function retryTransient(action) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= 3 || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

export async function uploadMedia(client, source, key, { progress = console.log } = {}) {
  const metadata = await stat(source);
  if (!metadata.isFile()) throw new Error("Choose a regular file.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(source)) hash.update(chunk);
  const uploadMetadata = {
    key,
    size: metadata.size,
    contentType: contentTypes[path.extname(source).toLowerCase()] || "application/octet-stream",
    sha256: hash.digest("hex"),
  };
  const started = await retryTransient(() => client.media("start", "POST", uploadMetadata));
  const url = `https://media.pechuk.com/${key}`;
  if (started.status === "exists") return { status: "unchanged", url };
  const query = new URLSearchParams({ key, uploadId: started.uploadId });
  const chunkSize = Math.max(16 * 1024 * 1024, Math.ceil(metadata.size / 9999));
  const count = Math.ceil(metadata.size / chunkSize),
    parts = new Array(count);
  let next = 0,
    completed = 0;
  const file = await open(source, "r");
  try {
    // Three in-flight parts saturate typical upstream connections while keeping memory bounded.
    const jobs = Array.from({ length: Math.min(3, count) }, async () => {
      while (next < count) {
        const i = next++,
          offset = i * chunkSize;
        const bytes = Buffer.alloc(Math.min(chunkSize, metadata.size - offset));
        let read = 0;
        while (read < bytes.length) {
          const result = await file.read(bytes, read, bytes.length - read, offset + read);
          if (!result.bytesRead) throw new Error("Source changed during upload.");
          read += result.bytesRead;
        }
        for (let attempt = 0; ; attempt++) {
          try {
            parts[i] = await client.media(`part?${query}&part=${i + 1}`, "PUT", bytes);
            break;
          } catch (error) {
            if (attempt >= 2 || (error.status && error.status < 500 && error.status !== 429)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          }
        }
        completed += bytes.length;
        progress(`${path.basename(source)}: ${Math.round((completed / metadata.size) * 100)}%`);
      }
    });
    const results = await Promise.allSettled(jobs);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    const after = await stat(source);
    if (after.size !== metadata.size || after.mtimeMs !== metadata.mtimeMs) throw new Error("Source changed during upload.");
    let result;
    try {
      result = await client.media(`complete?${query}`, "POST", { parts });
    } catch (error) {
      // A completion can succeed while the response is lost. Resolve by hash/size,
      // without overwriting or blindly repeating a completed multipart request.
      const observed = await retryTransient(() => client.media("start", "POST", uploadMetadata));
      if (observed.status !== "exists") {
        await client.media(`abort?${new URLSearchParams({ key, uploadId: observed.uploadId })}`, "DELETE").catch(() => {});
        throw error;
      }
      result = { status: "uploaded", key, size: metadata.size };
    }
    return { ...result, url };
  } catch (error) {
    await client.media(`abort?${query}`, "DELETE").catch(() => {});
    throw error;
  } finally {
    await file.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, source, requestedKey] = process.argv.slice(2);
    const client = await configuredClient();
    if (action === "upload") {
      if (!source) throw new Error("Usage: npm run media:upload -- /path/to/video.mp4 [folder/name.mp4]");
      const name = path.basename(source).replace(/[^a-zA-Z0-9._-]/g, "-");
      let key = requestedKey || `${randomUUID()}/${name}`;
      if (/\.(mp4|mov|webm)$/i.test(source)) {
        console.log("Preparing a web-sized MP4 and poster…");
        const prepared = await prepareVideo(path.resolve(source));
        key = key.replace(/\.[^/.]+$/, ".mp4");
        const uploaded = await uploadMedia(client, prepared.video, key);
        const poster = await uploadMedia(client, prepared.poster, `${key}.jpg`);
        console.log(
          JSON.stringify(
            {
              ...uploaded,
              poster: poster.url,
              width: prepared.width,
              height: prepared.height,
              originalBytes: prepared.originalBytes,
              uploadedBytes: prepared.bytes,
              embed: `<video controls playsinline preload="metadata" width="${prepared.width}" height="${prepared.height}" poster="${poster.url}" src="${uploaded.url}"></video>`,
            },
            null,
            2
          )
        );
      } else console.log(JSON.stringify(await uploadMedia(client, path.resolve(source), key), null, 2));
    } else if (action === "migrate") {
      const files = JSON.parse(await readFile(path.join(root, "hosting/legacy-media.json"), "utf8"));
      for (const file of files) {
        if (/\.mp4$/i.test(file)) {
          const prepared = await prepareVideo(path.join(root, file));
          await uploadMedia(client, path.join(root, file), `originals/${file}`);
          await uploadMedia(client, prepared.video, file);
          await uploadMedia(client, prepared.poster, `${file}.jpg`);
        } else await uploadMedia(client, path.join(root, file), file);
        console.log(`Ready: ${file}`);
      }
      console.log(`Migrated ${files.length} public media files. Existing URLs continue to work.`);
    } else throw new Error("Choose upload or migrate.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
