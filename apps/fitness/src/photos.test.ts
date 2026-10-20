import { expect, test } from "vitest";
import { Image } from "imagescript";
import { attachmentUrl, downloadAttachment, sanitizePhoto, savePhoto } from "../supabase/functions/fitness-mcp/photos";

test("attachment URLs and redirects stay on HTTPS ChatGPT file hosts without journal credentials", async () => {
  for (const url of [
    "http://files.oaiusercontent.com/a",
    "https://localhost/a",
    "https://files.oaiusercontent.com.evil.test/a",
    "https://user:pass@files.oaiusercontent.com/a",
    "https://files.oaiusercontent.com:444/a",
  ]) {
    expect(() => attachmentUrl(url)).toThrow();
  }
  await expect(
    downloadAttachment("https://files.oaiusercontent.com/a", async (_url, init) => {
      expect(init?.headers).toBeUndefined();
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
    })
  ).rejects.toThrow(/attached/);
  await expect(
    downloadAttachment("https://files.oaiusercontent.com/a", async () => new Response("", { headers: { "content-length": "10485761" } }))
  ).rejects.toThrow(/too large/);
  await expect(downloadAttachment("https://files.oaiusercontent.com/a", async () => new Response(new Uint8Array(10485761)))).rejects.toThrow(
    /too large/
  );
});

test("photos are decoded, resized and reencoded without embedded private metadata", async () => {
  const png = await new Image(1800, 12).fill(0xff0000ff).encodePNG({ metadata: { title: "private location sentinel" } });
  expect(new TextDecoder().decode(png)).toContain("private location sentinel");
  const bytes = await sanitizePhoto(png);
  expect(new TextDecoder().decode(bytes)).not.toContain("private location sentinel");
  expect(bytes[0]).toBe(0xff);
  const decoded = await Image.decode(bytes);
  expect(decoded.width).toBe(1600);
  await expect(sanitizePhoto(new TextEncoder().encode("not an image"))).rejects.toThrow(/JPEG/);
  const huge = await new Image(4100, 4000).encodePNG();
  await expect(sanitizePhoto(huge)).rejects.toThrow(/16 megapixels/);
});

test("upload sends sanitized bytes only to private storage, retries without overwriting and finalizes before reporting success", async () => {
  const image = await new Image(2, 2).fill(0xffffffff).encodePNG();
  const input = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    day: "2026-10-20",
    title: "Front",
    view: "front",
    file: { download_url: "https://files.oaiusercontent.com/a", file_id: "test-file" },
  };
  let uploaded = false,
    uploads = 0;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "fitness_plugin_photo_access") return true;
    if (name === "fitness_plugin_reserve_photo") {
      expect(args.p_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(args.p_entry).not.toHaveProperty("file");
      return { path: "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg", uploaded };
    }
    expect(name).toBe("fitness_plugin_finish_photo");
    expect(uploaded).toBe(true);
    return { id: input.id, kind: "photo", revision: 1 };
  };
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes("oaiusercontent.com")) {
      expect(init?.headers).toBeUndefined();
      return new Response(new Uint8Array(image));
    }
    expect(String(url)).toContain("https://project.supabase.co/storage/v1/object/fitness-photos/");
    expect((init?.headers as any)["x-upsert"]).toBe("false");
    expect((init?.headers as any).Authorization).toBe("Bearer private-test-token");
    uploaded = true;
    uploads++;
    return new Response("{}");
  };
  const config = { supabaseUrl: "https://project.supabase.co", publishableKey: "public-key" };
  expect(await savePhoto(input, rpc, config, "Bearer private-test-token", fetcher)).toMatchObject({ kind: "photo" });
  await savePhoto(input, rpc, config, "Bearer private-test-token", fetcher);
  expect(uploads).toBe(1);
});
