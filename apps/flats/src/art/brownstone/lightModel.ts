import { daysBetween } from "../../game/dates";
import type { ItemDef, LightDef, Player } from "../../game/types";
import type { Slot } from "../../game/room";
import { itemScale, projectWallPoint, SLOTS } from "../../game/room";

export interface RoomLight extends LightDef {
  id: string;
  strength: number;
}

/** Smooth atmosphere, never an unlock gate. Possessions are not changed by quiet weeks. */
export function roomAtmosphere(player: Player, day: string) {
  const count = Object.keys(player.layout.slots).length;
  const warmth = Math.min(1, count / SLOTS.length);
  const last = player.workouts.reduce((latest, workout) => (workout.day > latest ? workout.day : latest), player.createdDay);
  const quietDays = Math.max(0, daysBetween(last, day));
  const strength = quietDays < 7 ? 1 : quietDays >= 21 ? 0.45 : 0.7 - (quietDays - 7) * (0.25 / 14);
  return { moonlight: Math.pow(1 - warmth, 1.5), darkness: 0.66 - warmth * 0.11, coolTint: 0.46 * (1 - warmth), strength, quietDays };
}

export function placedLight(item: ItemDef, slot: Slot, flip: boolean, strength: number): RoomLight | null {
  if (!item.light) return null;
  const scale = itemScale(item, slot);
  const anchorY = slot.anchor === "top" ? 0 : slot.anchor === "bottom" ? -item.h : -item.h / 2;
  const localX = (item.light.x - 0.5) * item.w * scale * (flip ? -1 : 1);
  const localY = (anchorY + item.light.y * item.h) * scale;
  const point = projectWallPoint(slot, localX, localY);
  return { ...item.light, ...point, id: item.id, radius: item.light.radius * scale, strength };
}

export function lightColor(kelvin: number): string {
  if (kelvin >= 3500) return "#e1e8f5";
  if (kelvin >= 2800) return "#ffe4b4";
  if (kelvin >= 2200) return "#ffc77a";
  return "#ffad61";
}
