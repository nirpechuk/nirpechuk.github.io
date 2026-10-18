/** Picks the storage backend. Device-only until an online backend is configured. */

import { LocalBackend } from "./local";
import type { Backend } from "./types";

export function createBackend(): Backend {
  return new LocalBackend();
}
