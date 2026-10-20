import { Image } from "imagescript";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
// Only ChatGPT attachment delivery hosts. Never forward journal credentials here.
export function attachmentUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(url.hostname === "files.oaiusercontent.com" || url.hostname.endsWith(".oaiusercontent.com"))
  ) {
    throw new Error("Use an image attached to this chat, not an external image link.");
  }
  return url;
}

export async function downloadAttachment(value: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  let url = attachmentUrl(value);
  const signal = AbortSignal.timeout(20000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url.href, { redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      url = attachmentUrl(new URL(response.headers.get("location") ?? "", url).href);
      continue;
    }
    if (!response.ok || !response.body) throw new Error("The attachment expired or could not be downloaded. Attach it again.");
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
      await response.body.cancel();
      throw new Error("Photo is too large. Send an image under 10 MB.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        length += chunk.length;
        if (length > MAX_BYTES) throw new Error("Photo is too large. Send an image under 10 MB.");
        chunks.push(chunk);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
  throw new Error("The attachment could not be downloaded. Attach it again.");
}

export async function sanitizePhoto(bytes: Uint8Array): Promise<Uint8Array> {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const webp = new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  if (!bytes.length || bytes.length > MAX_BYTES || !(jpeg || png || webp))
    throw new Error("Send a JPEG, PNG, or WebP photo under 10 MB. Export HEIC photos as JPEG first.");
  try {
    const image = await Image.decode(bytes, { maxPixels: MAX_PIXELS, applyOrientation: true });
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    if (scale < 1) image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    // Encoding pixels without a metadata option drops EXIF, GPS and original filenames.
    return await image.encodeJPEG({ quality: 85 });
  } catch {
    throw new Error("Could not process this photo. Send a JPEG, PNG, or WebP image up to 16 megapixels.");
  }
}

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type PhotoInput = {
  id: string;
  day: string;
  title: string;
  view: string;
  notes?: string;
  file: { download_url: string; file_id: string; mime_type?: string; file_name?: string };
};
export async function savePhoto(
  input: PhotoInput,
  rpc: Rpc,
  config: { supabaseUrl: string; publishableKey: string },
  authorization: string,
  fetcher: typeof fetch
) {
  if ((await rpc("fitness_plugin_photo_access", {})) !== true)
    throw new Error("Photo uploads are not enabled for this connection. Reconnect Fitness through the website.");
  const bytes = await sanitizePhoto(await downloadAttachment(input.file.download_url, fetcher));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const { file: _file, ...entry } = input;
  const reservation = (await rpc("fitness_plugin_reserve_photo", { p_entry: entry, p_sha256: digest, p_byte_size: bytes.length })) as {
    path: string;
    uploaded: boolean;
  };
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(reservation.path)) throw new Error("Invalid private photo destination.");
  if (!reservation.uploaded) {
    const response = await fetcher(`${config.supabaseUrl}/storage/v1/object/fitness-photos/${reservation.path}`, {
      method: "POST",
      headers: { apikey: config.publishableKey, Authorization: authorization, "Content-Type": "image/jpeg", "x-upsert": "false" },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      // A concurrent retry may have won the upload. Only finalization can confirm success.
      const retry = (await rpc("fitness_plugin_reserve_photo", { p_entry: entry, p_sha256: digest, p_byte_size: bytes.length })) as {
        uploaded: boolean;
      };
      if (!retry.uploaded) throw new Error("Photo upload failed. Retry with the same UUID and photo.");
    }
  }
  return rpc("fitness_plugin_finish_photo", { p_id: input.id });
}
