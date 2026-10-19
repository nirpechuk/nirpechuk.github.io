import { createClient } from "@supabase/supabase-js";
import config from "./config.json";
import type { Entry, Settings } from "./model";
export const db = createClient(config.url, config.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
});
export async function loadJournal() {
  const entries: Entry[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("fitness_entries")
      .select("*")
      .is("archived_at", null)
      .order("day", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    entries.push(...(data as Entry[]));
    if (data.length < 1000) break;
    offset += 1000;
  }
  const { data, error } = await db.from("fitness_settings").select("*").maybeSingle();
  if (error) throw error;
  return { entries, settings: data as Settings | null };
}
export async function saveEntry(e: Entry, existing: boolean) {
  const { data, error } = existing
    ? await db
        .from("fitness_entries")
        .update({ day: e.day, title: e.title, data: e.data, source: "web", archived_at: e.archived_at })
        .eq("id", e.id)
        .eq("revision", e.revision)
        .select()
        .single()
    : await db
        .from("fitness_entries")
        .insert({ id: e.id, owner_id: e.owner_id, day: e.day, kind: e.kind, title: e.title, data: e.data, source: "web" })
        .select()
        .single();
  if (error) throw new Error(error.code === "PGRST116" ? "This entry changed elsewhere. Refresh before editing." : error.message);
  return data as Entry;
}
export async function saveSettings(settings: Settings, owner: string) {
  const { error } = await db.from("fitness_settings").upsert({ ...settings, owner_id: owner });
  if (error) throw error;
}
export async function preparePhoto(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photo. Export HEIC photos as JPEG first.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a photo smaller than 25 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not prepare the photo.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare photo."))), "image/jpeg", 0.9)
    );
  } finally {
    bitmap.close();
  }
}
