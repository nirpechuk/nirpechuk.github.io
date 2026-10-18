/**
 * A tiny behaviour loop for the pet: wander, nap on cosy items, play near toys, celebrate.
 * Positions are world coordinates on the floor plane (x across, depth into the room, lift above
 * the floor); the room projects them to the screen, so the pet shrinks as it walks away.
 */

import { useEffect, useRef, useState } from "react";

import type { PetMood } from "../game/progression";
import { depthOrder, PET_FLOOR } from "../game/room";
import type { PetAction } from "./Pet";

export interface PetSpot {
  x: number;
  depth: number;
  /** Height above the floor in world units (sofa seats, beds). */
  lift: number;
  /** Draw order while the pet is on this spot. */
  order: number;
}

export interface PetPose extends PetSpot {
  facing: 1 | -1;
  action: PetAction;
  /** Duration of the move to this pose, in milliseconds. */
  moveMs: number;
}

interface BehaviourInput {
  active: boolean;
  reducedMotion: boolean;
  mood: PetMood;
  napSpots: PetSpot[];
  playSpots: PetSpot[];
  /** Increments to trigger a happy celebration. */
  celebrateKey: number;
  /** Increments when the pet should eat a treat. */
  treatKey: number;
}

/** World units per second along the floor; depth is converted using the room's depth extent. */
const WALK_SPEED = 46;
const DEPTH_TO_WORLD = 300;
const JUMP_MS = 420;

function randomBetween(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

function pick<T>(values: T[]): T | undefined {
  return values.length === 0 ? undefined : values[Math.floor(Math.random() * values.length)];
}

export function floorSpot(x: number, depth: number): PetSpot {
  return { x, depth, lift: 0, order: depthOrder(depth) + 0.5 };
}

function randomFloorSpot(): PetSpot {
  return floorSpot(randomBetween(PET_FLOOR.minX, PET_FLOOR.maxX), randomBetween(PET_FLOOR.minDepth, PET_FLOOR.maxDepth));
}

function restingPose(input: BehaviourInput): PetPose {
  const spot = (input.mood === "sleepy" ? input.napSpots[0] : undefined) ?? floorSpot(150, 0.35);
  return { ...spot, facing: 1, action: input.mood === "sleepy" ? "sleep" : "idle", moveMs: 0 };
}

export function usePetBehaviour(input: BehaviourInput): PetPose {
  const [pose, setPose] = useState<PetPose>(() => restingPose(input));
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const seenKeys = useRef({ celebrate: input.celebrateKey, treat: input.treatKey });
  const spotsSignature = JSON.stringify([input.napSpots, input.playSpots]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, milliseconds);
      });
    const update = (next: Partial<PetPose>) => {
      if (cancelled) return;
      const merged = { ...poseRef.current, ...next };
      poseRef.current = merged;
      setPose(merged);
    };

    const walkTo = async (spot: PetSpot) => {
      if (poseRef.current.lift > 0) {
        const landing = floorSpot(poseRef.current.x, Math.max(PET_FLOOR.minDepth, poseRef.current.depth - 0.08));
        update({ ...landing, action: "walk", moveMs: JUMP_MS });
        await wait(JUMP_MS);
      }
      const targetIsRaised = spot.lift > 0;
      const floorTarget = targetIsRaised ? floorSpot(spot.x, Math.max(PET_FLOOR.minDepth, spot.depth - 0.08)) : spot;
      const from = poseRef.current;
      const distance = Math.hypot(floorTarget.x - from.x, (floorTarget.depth - from.depth) * DEPTH_TO_WORLD);
      if (distance > 3) {
        const facing: 1 | -1 = floorTarget.x >= from.x ? 1 : -1;
        const moveMs = Math.max(400, (distance / WALK_SPEED) * 1000);
        update({ facing, action: "walk", moveMs });
        await wait(30);
        // Draw in front of whatever is nearer during the walk, then settle at the target's order.
        update({ x: floorTarget.x, depth: floorTarget.depth, lift: 0, order: Math.max(from.order, floorTarget.order) });
        await wait(moveMs);
      }
      update({ order: floorTarget.order });
      if (targetIsRaised) {
        update({ ...spot, action: "walk", moveMs: JUMP_MS });
        await wait(JUMP_MS);
      }
    };

    const celebrate = async (action: PetAction, milliseconds: number) => {
      update({ action, moveMs: 0 });
      await wait(milliseconds);
    };

    const runActivity = async () => {
      const roll = Math.random();
      const { mood, napSpots, playSpots } = input;
      const napChance = mood === "sleepy" ? 0.6 : mood === "perky" ? 0.18 : 0.26;
      const playChance = mood === "perky" ? 0.3 : 0.16;
      if (roll < napChance) {
        await walkTo(pick(napSpots) ?? randomFloorSpot());
        update({ action: "sleep", moveMs: 0 });
        await wait(randomBetween(9000, 16000));
      } else if (roll < napChance + playChance && playSpots.length > 0) {
        const toy = pick(playSpots)!;
        await walkTo(toy);
        update({ facing: toy.x > 180 ? 1 : -1 });
        await celebrate("happy", 1800);
        update({ action: "idle" });
        await wait(randomBetween(1500, 2500));
      } else if (roll < 0.82) {
        await walkTo(randomFloorSpot());
        update({ action: "idle", moveMs: 0 });
        await wait(randomBetween(1800, 3500));
      } else {
        update({ action: "sit", moveMs: 0 });
        await wait(randomBetween(2500, 4500));
      }
    };

    const loop = async () => {
      if (input.treatKey !== seenKeys.current.treat) {
        seenKeys.current.treat = input.treatKey;
        await celebrate("eat", 2600);
        await celebrate("happy", 1400);
      }
      if (input.celebrateKey !== seenKeys.current.celebrate) {
        seenKeys.current.celebrate = input.celebrateKey;
        await celebrate("happy", 2400);
      }
      if (!input.active || input.reducedMotion) {
        update({ action: input.mood === "sleepy" ? "sleep" : "idle", moveMs: 0 });
        return;
      }
      while (!cancelled) await runActivity();
    };

    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // spotsSignature stands in for the spot arrays, which are rebuilt on every render.
  }, [input.active, input.reducedMotion, input.mood, input.celebrateKey, input.treatKey, spotsSignature]);

  return pose;
}
