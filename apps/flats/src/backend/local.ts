/** Device-only backend: everything lives in localStorage, plus a few labelled demo neighbours. */

import { CATALOG } from "../game/catalog";
import { today } from "../game/dates";
import { drawChoices, hasLoggedOn, nextPresent } from "../game/progression";
import { emptyLayout } from "../game/room";
import type { Group, GroupSnapshot, Layout, Player, Reaction, ReactionKind, WorkoutType } from "../game/types";
import { buildDemoNeighbours } from "./demo";
import type { Backend, NewPlayerInput, ProfileSummary, Session } from "./types";
import { GameRuleError } from "./types";

const STORAGE_KEY = "flats:v1";
const GROUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP_CODE_LENGTH = 6;

interface LocalDb {
  version: 1;
  players: Record<string, Player>;
  groups: Record<string, Group>;
  reactions: Reaction[];
  activePlayerId: string | null;
}

function emptyDb(): LocalDb {
  return { version: 1, players: {}, groups: {}, reactions: [], activePlayerId: null };
}

export function newGroupCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < GROUP_CODE_LENGTH; index++) {
    code += GROUP_CODE_ALPHABET[Math.floor(random() * GROUP_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeGroupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalBackend implements Backend {
  readonly mode = "local" as const;
  private db: LocalDb;

  constructor(private readonly store: KeyValueStore = window.localStorage) {
    const saved = store.getItem(STORAGE_KEY);
    this.db = saved ? (JSON.parse(saved) as LocalDb) : emptyDb();
    if (this.db.version !== 1) throw new Error(`Unsupported save version ${String(this.db.version)}.`);
  }

  private persist(): void {
    this.store.setItem(STORAGE_KEY, JSON.stringify(this.db));
  }

  private sessionFor(playerId: string): Session {
    const group = Object.values(this.db.groups).find((candidate) => candidate.memberIds.includes(playerId));
    if (!group) throw new Error(`Player ${playerId} is not in any group.`);
    return { playerId, groupCode: group.code };
  }

  private player(session: Session): Player {
    const player = this.db.players[session.playerId];
    if (!player) throw new Error(`Unknown player ${session.playerId}.`);
    return player;
  }

  private async update(session: Session, change: (player: Player) => Player): Promise<Player> {
    const updated = change(structuredClone(this.player(session)));
    this.db.players[updated.id] = updated;
    this.persist();
    return structuredClone(updated);
  }

  currentSession(): Session | null {
    const playerId = this.db.activePlayerId;
    return playerId && this.db.players[playerId] ? this.sessionFor(playerId) : null;
  }

  groupName(groupCode: string): Promise<string | null> {
    return Promise.resolve(this.db.groups[normalizeGroupCode(groupCode)]?.name ?? null);
  }

  async createPlayer(input: NewPlayerInput): Promise<Session> {
    const day = today();
    const player: Player = {
      id: newId(),
      name: input.name.trim(),
      petKind: input.petKind,
      petName: input.petName.trim(),
      createdDay: day,
      workouts: [],
      unlocks: [],
      layout: emptyLayout(),
    };
    if (!player.name || !player.petName) throw new GameRuleError("Names can't be empty.");
    this.db.players[player.id] = player;

    let group: Group;
    if (input.groupCode) {
      const existing = this.db.groups[normalizeGroupCode(input.groupCode)];
      if (!existing) throw new GameRuleError("No group with that code on this device yet.");
      group = existing;
      group.memberIds.push(player.id);
    } else {
      let code = newGroupCode();
      while (this.db.groups[code]) code = newGroupCode();
      const demoNeighbours = buildDemoNeighbours(day);
      for (const neighbour of demoNeighbours) this.db.players[neighbour.id] = neighbour;
      group = { code, name: `${player.name}'s building`, memberIds: [player.id, ...demoNeighbours.map((n) => n.id)] };
      this.db.groups[code] = group;
      this.db.reactions.push({
        from: demoNeighbours[0].id,
        to: player.id,
        kind: "heart",
        day,
        at: Date.now(),
      });
    }
    this.db.activePlayerId = player.id;
    this.persist();
    return { playerId: player.id, groupCode: group.code };
  }

  async fetchGroup(session: Session): Promise<GroupSnapshot> {
    const group = this.db.groups[session.groupCode];
    if (!group) throw new Error(`Unknown group ${session.groupCode}.`);
    const players = group.memberIds.map((id) => this.db.players[id]).filter((player) => player !== undefined);
    const memberIds = new Set(group.memberIds);
    const reactions = this.db.reactions.filter((reaction) => memberIds.has(reaction.to));
    return structuredClone({ group, players, reactions });
  }

  logWorkout(session: Session, day: string, type?: WorkoutType): Promise<Player> {
    return this.update(session, (player) => {
      if (hasLoggedOn(player, day)) throw new GameRuleError("A workout is already logged for that day.");
      player.workouts.push(type ? { day, type } : { day });
      return player;
    });
  }

  setWorkoutType(session: Session, day: string, type: WorkoutType): Promise<Player> {
    return this.update(session, (player) => {
      const workout = player.workouts.find((candidate) => candidate.day === day);
      if (!workout) throw new GameRuleError("No workout logged that day.");
      workout.type = type;
      return player;
    });
  }

  unpack(session: Session, entryId: string, day: string): Promise<Player> {
    return this.update(session, (player) => {
      const present = nextPresent(player);
      if (!present) throw new GameRuleError("No presents waiting. Log a workout to earn one.");
      if (!drawChoices(CATALOG, player, present, day).includes(entryId)) {
        throw new GameRuleError("That item isn't in this present.");
      }
      player.unlocks.push({ id: entryId, atWorkout: player.workouts.length, day });
      return player;
    });
  }

  saveLayout(session: Session, layout: Layout): Promise<Player> {
    return this.update(session, (player) => {
      const owned = new Set(player.unlocks.map((unlock) => unlock.id));
      for (const placement of Object.values(layout.slots)) {
        if (!owned.has(placement.itemId)) throw new GameRuleError(`You don't own ${placement.itemId} yet.`);
      }
      player.layout = layout;
      return player;
    });
  }

  async react(session: Session, toPlayerId: string, kind: ReactionKind, day: string, variant?: number): Promise<Reaction> {
    if (toPlayerId === session.playerId) throw new GameRuleError("Reactions are for friends.");
    const duplicate = this.db.reactions.some(
      (reaction) => reaction.from === session.playerId && reaction.to === toPlayerId && reaction.kind === kind && reaction.day === day
    );
    if (duplicate) throw new GameRuleError("You already sent that today.");
    const reaction: Reaction = { from: session.playerId, to: toPlayerId, kind, day, at: Date.now(), variant };
    this.db.reactions.push(reaction);
    this.persist();
    return reaction;
  }

  localProfiles(): ProfileSummary[] {
    const memberIds = new Set(
      Object.values(this.db.players)
        .filter((player) => !player.demo)
        .map((player) => player.id)
    );
    return [...memberIds].map((playerId) => {
      const player = this.db.players[playerId];
      return { playerId, name: player.name, petKind: player.petKind, petName: player.petName };
    });
  }

  switchProfile(playerId: string): Session {
    if (!this.db.players[playerId]) throw new Error(`Unknown player ${playerId}.`);
    this.db.activePlayerId = playerId;
    this.persist();
    return this.sessionFor(playerId);
  }

  signOut(): void {
    this.db.activePlayerId = null;
    this.persist();
  }

  async removeDemoNeighbours(session: Session): Promise<void> {
    const group = this.db.groups[session.groupCode];
    if (!group) throw new Error(`Unknown group ${session.groupCode}.`);
    const demoIds = new Set(group.memberIds.filter((id) => this.db.players[id]?.demo));
    group.memberIds = group.memberIds.filter((id) => !demoIds.has(id));
    for (const id of demoIds) delete this.db.players[id];
    this.db.reactions = this.db.reactions.filter((reaction) => !demoIds.has(reaction.from) && !demoIds.has(reaction.to));
    this.persist();
  }
}
