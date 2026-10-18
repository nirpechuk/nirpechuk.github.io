/** Apartment geometry (snap slots in room SVG coordinates) and placement rules. */

import type { Catalog, ItemDef, Layout, Placement, Player, Zone } from "./types";

export const ROOM_WIDTH = 360;
export const ROOM_HEIGHT = 420;

/** Back wall rectangle of the diorama box. */
export const BACK_WALL = { left: 22, right: 338, top: 30, bottom: 292 };
export const WINDOW_FRAME = { cx: 180, top: 68, width: 88, height: 104 };
export const PET_FLOOR = { minX: 46, maxX: 314, minY: 326, maxY: 402 };

export type SlotAnchor = "top" | "center" | "bottom";

export interface Slot {
  id: string;
  zone: Zone;
  x: number;
  y: number;
  capacity: number;
  anchor: SlotAnchor;
  scale: number;
  /** Draw order: lower first. Floor slots use their baseline so nearer items overlap farther ones. */
  depth: number;
}

export const SLOTS: Slot[] = [
  { id: "ceilL", zone: "ceiling", x: 92, y: 30, capacity: 2, anchor: "top", scale: 1, depth: 40 },
  { id: "ceilC", zone: "ceiling", x: 180, y: 30, capacity: 2, anchor: "top", scale: 1, depth: 40 },
  { id: "ceilR", zone: "ceiling", x: 268, y: 30, capacity: 2, anchor: "top", scale: 1, depth: 40 },
  { id: "wallTop", zone: "wallTop", x: 180, y: 50, capacity: 3, anchor: "center", scale: 1, depth: 20 },
  { id: "wallL", zone: "wall", x: 80, y: 122, capacity: 2, anchor: "center", scale: 1, depth: 10 },
  { id: "wallR", zone: "wall", x: 280, y: 122, capacity: 2, anchor: "center", scale: 1, depth: 10 },
  { id: "window", zone: "window", x: 180, y: 120, capacity: 3, anchor: "center", scale: 1, depth: 15 },
  { id: "sill", zone: "sill", x: 180, y: 177, capacity: 1, anchor: "bottom", scale: 1, depth: 16 },
  { id: "rug", zone: "rug", x: 180, y: 356, capacity: 3, anchor: "center", scale: 1, depth: 100 },
  { id: "floorBL", zone: "floor", x: 80, y: 300, capacity: 2, anchor: "bottom", scale: 1, depth: 300 },
  { id: "floorBC", zone: "floor", x: 180, y: 302, capacity: 3, anchor: "bottom", scale: 1, depth: 302 },
  { id: "floorBR", zone: "floor", x: 280, y: 300, capacity: 2, anchor: "bottom", scale: 1, depth: 300 },
  { id: "floorFL", zone: "floor", x: 54, y: 410, capacity: 2, anchor: "bottom", scale: 1.08, depth: 410 },
  { id: "floorFR", zone: "floor", x: 306, y: 410, capacity: 2, anchor: "bottom", scale: 1.08, depth: 410 },
];

const SLOT_BY_ID = new Map(SLOTS.map((slot) => [slot.id, slot]));

export function slotById(slotId: string): Slot {
  const slot = SLOT_BY_ID.get(slotId);
  if (!slot) throw new Error(`Unknown slot: ${slotId}`);
  return slot;
}

export function canPlace(item: ItemDef, slot: Slot): boolean {
  return item.zones.includes(slot.zone) && item.size <= slot.capacity;
}

export function validSlots(item: ItemDef): Slot[] {
  return SLOTS.filter((slot) => canPlace(item, slot));
}

/** Top-left corner where an item's art box is drawn for a slot (before slot scale). */
export function itemOrigin(item: ItemDef, slot: Slot): { x: number; y: number } {
  const x = slot.x - item.w / 2;
  if (slot.anchor === "top") return { x, y: slot.y };
  if (slot.anchor === "bottom") return { x, y: slot.y - item.h };
  return { x, y: slot.y - item.h / 2 };
}

export const DEFAULT_WALLPAPER = "plain-paper";
export const DEFAULT_FLOORING = "bare-boards";

export function emptyLayout(): Layout {
  return { slots: {}, wallpaper: DEFAULT_WALLPAPER, flooring: DEFAULT_FLOORING };
}

export interface PlaceResult {
  layout: Layout;
  /** Item that was sent back to storage because the slot was occupied. */
  displacedItemId: string | null;
}

/** Places (or moves) an item into a slot; any occupant goes back to storage. */
export function placeItem(catalog: Catalog, layout: Layout, slotId: string, placement: Placement): PlaceResult {
  const item = catalog.items.find((entry) => entry.id === placement.itemId);
  if (!item) throw new Error(`Unknown item: ${placement.itemId}`);
  const slot = slotById(slotId);
  if (!canPlace(item, slot)) throw new Error(`${item.name} does not fit in slot ${slotId}.`);

  const slots: Record<string, Placement> = {};
  for (const [existingSlotId, existing] of Object.entries(layout.slots)) {
    if (existing.itemId !== placement.itemId) slots[existingSlotId] = existing;
  }
  const occupant = slots[slotId];
  const displacedItemId = occupant && occupant.itemId !== placement.itemId ? occupant.itemId : null;
  slots[slotId] = placement;
  return { layout: { ...layout, slots }, displacedItemId };
}

export function removeItem(layout: Layout, itemId: string): Layout {
  const slots = Object.fromEntries(Object.entries(layout.slots).filter(([, placement]) => placement.itemId !== itemId));
  return { ...layout, slots };
}

export function slotOfItem(layout: Layout, itemId: string): string | null {
  const match = Object.entries(layout.slots).find(([, placement]) => placement.itemId === itemId);
  return match ? match[0] : null;
}

/** Unlocked furniture and decor that is not currently placed. */
export function storedItemIds(catalog: Catalog, player: Player): string[] {
  const placed = new Set(Object.values(player.layout.slots).map((placement) => placement.itemId));
  const itemIds = new Set(catalog.items.map((item) => item.id));
  return player.unlocks.map((unlock) => unlock.id).filter((id) => itemIds.has(id) && !placed.has(id));
}

/** The first empty slot this item fits in, preferring the order slots are declared. */
export function firstFreeSlot(item: ItemDef, layout: Layout): Slot | null {
  return validSlots(item).find((slot) => !layout.slots[slot.id]) ?? null;
}
