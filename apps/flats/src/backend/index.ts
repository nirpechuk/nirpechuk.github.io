/** Use the shared building; an explicit development flag keeps offline testing available. */
import { LocalBackend } from "./local";
import { SupabaseBackend } from "./supabase";
import type { Backend } from "./types";

export function createBackend(): Backend {
  return import.meta.env.VITE_FLATS_OFFLINE === "true" ? new LocalBackend() : new SupabaseBackend();
}
