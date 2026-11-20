import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./build.mjs";

async function command(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-3000);
    });
    child.on("error", (error) => reject(error.code === "ENOENT" ? new Error("Install ffmpeg to optimize video uploads.") : error));
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${name} failed: ${stderr}`))));
  });
}
export async function prepareVideo(source) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(source)) hash.update(chunk);
  const digest = hash.digest("hex");
  const dir = path.join(root, "dist/media", digest);
  const video = path.join(dir, "video.mp4"),
    poster = path.join(dir, "poster.jpg"),
    receipt = path.join(dir, "prepared.json");
  const cached = await readFile(receipt, "utf8").catch(() => null);
  if (cached) return { ...JSON.parse(cached), video, poster };
  await mkdir(dir, { recursive: true });
  const probe = JSON.parse(await command("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", source]));
  const stream = probe.streams.find((s) => s.codec_type === "video");
  if (!stream) throw new Error("No video stream found.");
  await command("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-map_metadata",
    "-1",
    "-movflags",
    "+faststart",
    video,
  ]);
  const originalBytes = (await stat(source)).size;
  if (
    (await stat(video)).size > originalBytes &&
    stream.codec_name === "h264" &&
    stream.pix_fmt === "yuv420p" &&
    probe.streams.filter((s) => s.codec_type === "audio").every((s) => s.codec_name === "aac")
  ) {
    await command("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      source,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c",
      "copy",
      "-map_metadata",
      "-1",
      "-movflags",
      "+faststart",
      video,
    ]);
  }
  await command("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "0",
    "-i",
    video,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-2",
    "-q:v",
    "4",
    poster,
  ]);
  const output = JSON.parse(
    await command("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", video])
  ).streams[0];
  const result = { originalBytes, bytes: (await stat(video)).size, width: output.width, height: output.height, sourceHash: digest };
  await writeFile(receipt, JSON.stringify(result));
  return { ...result, video, poster };
}
