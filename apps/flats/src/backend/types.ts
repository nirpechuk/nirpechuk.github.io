/** The storage contract the UI talks to. Implementations: LocalBackend (device-only) and, later, Supabase. */

import type { GroupSnapshot, Layout, PetKind, Player, Reaction, ReactionKind, WorkoutType } from "../game/types";

export interface Session {
  playerId: string;
  groupCode: string;
}

export interface NewPlayerInput {
  name: string;
  petKind: PetKind;
  petName: string;
  /** Join this group; omit to create a new one. */
  groupCode?: string;
}

export interface ProfileSummary {
  playerId: string;
  name: string;
  petKind: PetKind;
  petName: string;
}

export interface Backend {
  /** "local" keeps everything in this browser; "online" shares groups across devices. */
  readonly mode: "local" | "online";
  currentSession(): Session | null;
  createPlayer(input: NewPlayerInput): Promise<Session>;
  /** Name of the group with this invite code, or null if there is none. */
  groupName(groupCode: string): Promise<string | null>;
  fetchGroup(session: Session): Promise<GroupSnapshot>;
  logWorkout(session: Session, day: string, type?: WorkoutType): Promise<Player>;
  setWorkoutType(session: Session, day: string, type: WorkoutType): Promise<Player>;
  unpack(session: Session, entryId: string, day: string): Promise<Player>;
  saveLayout(session: Session, layout: Layout): Promise<Player>;
  react(session: Session, toPlayerId: string, kind: ReactionKind, day: string, variant?: number): Promise<Reaction>;
  /** Profiles stored on this device (for switching between players who share a device). */
  localProfiles(): ProfileSummary[];
  switchProfile(playerId: string): Session;
  signOut(): void;
  removeDemoNeighbours?(session: Session): Promise<void>;
}

export class GameRuleError extends Error {}
