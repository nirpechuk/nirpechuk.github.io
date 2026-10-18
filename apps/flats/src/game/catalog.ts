/** Loads and validates the JSON item catalogue. */

import rawCatalog from "./catalog.json";
import { SLOTS } from "./room";
import type { Catalog, ItemDef, Layer, SurfaceDef } from "./types";

const PALETTE_ROLES = new Set(["p", "s", "a"]);

function layerColors(layer: Layer): string[] {
  return [layer.fill, layer.stroke].filter((color): color is string => typeof color === "string");
}

/** Throws with every problem found, so a broken catalogue edit fails loudly at startup and in tests. */
export function validateCatalog(catalog: Catalog): Catalog {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  for (const entry of [...catalog.items, ...catalog.surfaces]) {
    if (seenIds.has(entry.id)) problems.push(`Duplicate id "${entry.id}".`);
    seenIds.add(entry.id);
    if (entry.rarity === "seasonal" && !entry.season) problems.push(`Seasonal "${entry.id}" has no season.`);
  }
  for (const item of catalog.items) {
    if (item.palettes.length === 0) problems.push(`Item "${item.id}" has no palettes.`);
    if (!SLOTS.some((slot) => item.zones.includes(slot.zone) && item.size <= slot.capacity)) {
      problems.push(`Item "${item.id}" fits no slot (zones ${item.zones.join(", ")}, size ${item.size}).`);
    }
    for (const [index, layer] of item.layers.entries()) {
      for (const color of layerColors(layer)) {
        const isRole = PALETTE_ROLES.has(color);
        const isCss = color === "none" || color.startsWith("#");
        if (!isRole && !isCss) problems.push(`Item "${item.id}" layer ${index} has unknown colour "${color}".`);
      }
      if (layer.t === "line" && !layer.stroke) problems.push(`Item "${item.id}" line layer ${index} has no stroke.`);
    }
  }
  for (const surface of catalog.surfaces) {
    if (surface.colors.length === 0) problems.push(`Surface "${surface.id}" has no colours.`);
  }
  if (problems.length > 0) throw new Error(`Invalid catalogue:\n${problems.join("\n")}`);
  return catalog;
}

export const CATALOG: Catalog = validateCatalog(rawCatalog as Catalog);

const ITEM_BY_ID = new Map(CATALOG.items.map((item) => [item.id, item]));
const SURFACE_BY_ID = new Map(CATALOG.surfaces.map((surface) => [surface.id, surface]));

export function itemById(itemId: string): ItemDef {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  return item;
}

export function surfaceById(surfaceId: string): SurfaceDef {
  const surface = SURFACE_BY_ID.get(surfaceId);
  if (!surface) throw new Error(`Unknown surface: ${surfaceId}`);
  return surface;
}

export function isItemId(entryId: string): boolean {
  return ITEM_BY_ID.has(entryId);
}

export function entryName(entryId: string): string {
  return ITEM_BY_ID.get(entryId)?.name ?? surfaceById(entryId).name;
}
