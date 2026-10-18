/**
 * Apartment geometry and placement rules.
 *
 * The room is drawn in one-point perspective. World positions use the coordinates of the room's
 * front opening (360 x 420, floor at y = 420) plus a depth `t` from 0 (front edge) to 1 (back
 * wall); `project` maps them to screen space. Things shrink with depth, so the back wall is a
 * smaller rectangle inside the front opening and nearer furniture overlaps farther furniture.
 */

import type { Catalog, ItemDef, Layout, Placement, Player, Zone } from "./types";

export const ROOM_WIDTH = 360;
export const ROOM_HEIGHT = 420;
export const FLOOR_Y = ROOM_HEIGHT;
export const VANISHING_POINT = { x: 180, y: 120 };
/** Screen size of the back wall relative to the front opening. Lower is deeper. */
export const BACK_SCALE = 0.62;
/** Item art units per world unit, so furniture reads at a pleasant size in the deeper room. */
export const ITEM_SCALE = 1.25;
/**
 * Screen scale of things hung on the back wall. Slightly larger than strict perspective would
 * give, so the window and wall art hold the composition instead of floating on a tall wall.
 */
export const BACK_ITEM_SCALE = 0.9;
/** Height of the panelled dado below the rail, in world units. */
export const DADO_HEIGHT = 100;

export function depthScale(depth: number): number {
  return 1 / (1 + depth * (1 / BACK_SCALE - 1));
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Perspective scale at this depth. */
  k: number;
}

export function project(worldX: number, worldY: number, depth: number): ScreenPoint {
  const k = depthScale(depth);
  return { x: VANISHING_POINT.x + (worldX - VANISHING_POINT.x) * k, y: VANISHING_POINT.y + (worldY - VANISHING_POINT.y) * k, k };
}

/** Draw order for something standing at `depth`: farther first. */
export function depthOrder(depth: number): number {
  return 100 + (1 - depth) * 1000;
}

const backTopLeft = project(0, 0, 1);
const backBottomRight = project(ROOM_WIDTH, FLOOR_Y, 1);
export const BACK_WALL = { left: backTopLeft.x, right: backBottomRight.x, top: backTopLeft.y, bottom: backBottomRight.y };

/** The window opening on the back wall, in screen coordinates. */
export const WINDOW_FRAME = {
  cx: 180,
  top: 90,
  width: 88 * BACK_ITEM_SCALE,
  height: 104 * BACK_ITEM_SCALE,
};

/** Where the pet may wander, in world coordinates. */
export const PET_FLOOR = { minX: 60, maxX: 300, minDepth: 0.14, maxDepth: 0.8 };

export type SlotAnchor = "top" | "center" | "bottom";

export interface Slot {
  id: string;
  zone: Zone;
  /** Screen position of the anchor point. */
  x: number;
  y: number;
  capacity: number;
  anchor: SlotAnchor;
  /** Screen scale applied to the item's art. */
  scale: number;
  /** Draw order: lower first. */
  depth: number;
  /** World position for floor slots (used for pet nap and play spots). */
  world: { x: number; depth: number } | null;
}

function backWallSlot(id: string, zone: Zone, x: number, y: number, capacity: number, anchor: SlotAnchor, layer: number): Slot {
  return { id, zone, x, y, capacity, anchor, scale: BACK_ITEM_SCALE, depth: layer, world: null };
}

function floorSlot(id: string, zone: Zone, worldX: number, depth: number, capacity: number): Slot {
  const point = project(worldX, FLOOR_Y, depth);
  const anchor: SlotAnchor = zone === "rug" ? "center" : "bottom";
  const order = zone === "rug" ? 50 : depthOrder(depth);
  return { id, zone, x: point.x, y: point.y, capacity, anchor, scale: point.k * ITEM_SCALE, depth: order, world: { x: worldX, depth } };
}

function ceilingSlot(id: string, worldX: number, depth: number): Slot {
  const point = project(worldX, 0, depth);
  return { id, zone: "ceiling", x: point.x, y: point.y, capacity: 2, anchor: "top", scale: point.k * ITEM_SCALE, depth: depthOrder(depth), world: null };
}

const WINDOW_CENTER_Y = WINDOW_FRAME.top + WINDOW_FRAME.height / 2;

export const SLOTS: Slot[] = [
  ceilingSlot("ceilL", 72, 0.55),
  ceilingSlot("ceilC", 180, 0.55),
  ceilingSlot("ceilR", 288, 0.55),
  backWallSlot("wallTop", "wallTop", 180, WINDOW_FRAME.top - 14, 3, "center", 3),
  backWallSlot("wallL", "wall", 106, WINDOW_CENTER_Y + 6, 2, "center", 1),
  backWallSlot("wallR", "wall", 254, WINDOW_CENTER_Y + 6, 2, "center", 1),
  backWallSlot("window", "window", 180, WINDOW_CENTER_Y, 3, "center", 2),
  backWallSlot("sill", "sill", 180, WINDOW_FRAME.top + WINDOW_FRAME.height + 4, 1, "bottom", 4),
  floorSlot("rug", "rug", 180, 0.48, 3),
  floorSlot("floorBL", "floor", 72, 0.9, 2),
  floorSlot("floorBC", "floor", 180, 0.93, 3),
  floorSlot("floorBR", "floor", 288, 0.9, 2),
  floorSlot("floorML", "floor", 34, 0.5, 2),
  floorSlot("floorMR", "floor", 326, 0.5, 2),
  floorSlot("floorFL", "floor", 44, 0.08, 2),
  floorSlot("floorFR", "floor", 316, 0.08, 2),
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
