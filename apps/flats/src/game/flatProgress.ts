/** Visual milestones along the room's existing, continuous warmth progression. */
import { SLOTS } from "./room";

export const FLAT_STAGES = [
  { name: "Moving in", at: 0 },
  { name: "Unpacked", at: 6 },
  { name: "Settled", at: 14 },
  { name: "Homey", at: SLOTS.length },
] as const;

export function flatProgress(placed: number) {
  const total = SLOTS.length;
  const count = Math.max(0, Math.min(total, placed));
  const index = FLAT_STAGES.filter((stage) => count >= stage.at).length - 1;
  const stage = FLAT_STAGES[index];
  const next = FLAT_STAGES[index + 1];
  const fraction = next ? (index + (count - stage.at) / (next.at - stage.at)) / (FLAT_STAGES.length - 1) : 1;
  return { count, total, index, stage, next, fraction, remaining: next ? next.at - count : 0 };
}
