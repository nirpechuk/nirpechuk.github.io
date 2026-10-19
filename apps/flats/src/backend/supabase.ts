/** Online rooms use private capability keys; only the publishable project key ships publicly. */
import { today } from "../game/dates";
import type { Group, GroupSnapshot, Layout, Player, Reaction, ReactionKind, WorkoutType } from "../game/types";
import type { KeyValueStore } from "./local";
import { normalizeGroupCode } from "./local";
import type { Backend, NewPlayerInput, ProfileSummary, Session } from "./types";
import { GameRuleError, SessionUnavailableError } from "./types";
import config from "./config.json";

export const ONLINE_STORAGE_KEY = "flats:online:v1";
interface SavedProfile extends ProfileSummary {
  token: string;
  groupCode: string;
  pending?: NewPlayerInput;
  imported?: Player;
  localId?: string;
  unavailable?: boolean;
}
interface SavedRooms {
  version: 1;
  profiles: Record<string, SavedProfile>;
  activePlayerId: string | null;
  migrated: string[];
  importedGroups: Record<string, string>;
}
const freshRooms = (): SavedRooms => ({ version: 1, profiles: {}, activePlayerId: null, migrated: [], importedGroups: {} });

export class SupabaseBackend implements Backend {
  readonly mode = "online" as const;
  private rooms: SavedRooms;
  private initializing?: Promise<Session | null>;

  constructor(
    private readonly store: KeyValueStore = window.localStorage,
    private readonly request: typeof fetch = fetch
  ) {
    const saved = store.getItem(ONLINE_STORAGE_KEY);
    this.rooms = saved ? (JSON.parse(saved) as SavedRooms) : freshRooms();
    if (this.rooms.version !== 1) throw new Error("This room key was saved by a newer version of Flats.");
  }
  private persist() {
    this.store.setItem(ONLINE_STORAGE_KEY, JSON.stringify(this.rooms));
  }
  private async rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      const request = this.request;
      response = await request(`${config.url}/rest/v1/${name}`, {
        method: "POST",
        headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch {
      throw new Error("Couldn't reach your building. Check your connection and try again.");
    }
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "P0002") {
        const profile = this.rooms.profiles[String(body.p_player_id ?? body.p_id)];
        if (profile && profile.token === body.p_token) {
          profile.unavailable = true;
          this.persist();
        }
        throw new SessionUnavailableError(data.message);
      }
      if (data.code === "P0001" || data.code === "23505") throw new GameRuleError(data.message);
      throw new Error("Your building couldn't load. Please try again in a moment.");
    }
    return data as T;
  }
  private credentials(session: Session) {
    const profile = this.rooms.profiles[session.playerId];
    if (!profile || profile.unavailable) throw new SessionUnavailableError("This flat is no longer available.");
    return { p_player_id: session.playerId, p_token: profile.token };
  }
  currentSession(): Session | null {
    const profile = this.rooms.activePlayerId ? this.rooms.profiles[this.rooms.activePlayerId] : null;
    return profile && !profile.pending && !profile.unavailable ? { playerId: profile.playerId, groupCode: profile.groupCode } : null;
  }
  initialize(): Promise<Session | null> {
    this.initializing ??= this.migrate()
      .then(() => this.resolveSavedRooms())
      .catch((error) => {
        this.initializing = undefined;
        throw error;
      });
    return this.initializing.then(() => this.currentSession());
  }
  defaultBuilding(): Promise<{ code: string; name: string } | null> {
    return this.rpc("rpc/flats_default_building", {});
  }
  private resolveRoom(playerId: string, token: string): Promise<Session & ProfileSummary> {
    return this.rpc("rpc/flats_resolve_room", { p_player_id: playerId, p_token: token });
  }
  private async resolveSavedRooms(): Promise<Session | null> {
    for (const profile of Object.values(this.rooms.profiles)) {
      if (profile.pending) continue;
      try {
        const resolved = await this.resolveRoom(profile.playerId, profile.token);
        this.rooms.profiles[resolved.playerId] = { ...profile, ...resolved, unavailable: false };
        if (resolved.playerId !== profile.playerId) delete this.rooms.profiles[profile.playerId];
        if (this.rooms.activePlayerId === profile.playerId) this.rooms.activePlayerId = resolved.playerId;
      } catch (error) {
        if (!(error instanceof SessionUnavailableError)) throw error;
        if (this.rooms.activePlayerId === profile.playerId) this.rooms.activePlayerId = null;
      }
    }
    this.persist();
    return this.currentSession();
  }
  private async migrate(): Promise<Session | null> {
    for (const profile of Object.values(this.rooms.profiles)) {
      if (profile.pending && !profile.imported) {
        const recovered = await this.moveIn(profile.pending);
        if (!this.rooms.activePlayerId) this.rooms.activePlayerId = recovered.playerId;
        this.persist();
      }
    }
    // Preserve the original device-only save, including its demo rooms, as a backup.
    const raw = this.store.getItem("flats:v1");
    if (!raw) return this.currentSession();
    const local = JSON.parse(raw) as { players: Record<string, Player>; groups: Record<string, Group>; activePlayerId: string | null };
    for (const player of Object.values(local.players).filter((p) => !p.demo)) {
      if (this.rooms.migrated.includes(player.id)) continue;
      const group = Object.values(local.groups).find((g) => g.memberIds.includes(player.id));
      if (!group) continue;
      const session = await this.moveIn(
        { name: player.name, petName: player.petName, petKind: player.petKind, groupCode: this.rooms.importedGroups[group.code] },
        player
      );
      this.rooms.importedGroups[group.code] = session.groupCode;
      this.rooms.migrated.push(player.id);
      if (local.activePlayerId === player.id && !this.rooms.activePlayerId) this.rooms.activePlayerId = session.playerId;
      this.persist();
    }
    return this.currentSession();
  }
  private async moveIn(input: NewPlayerInput, imported?: Player): Promise<Session> {
    // Save the capability before sending: a lost response can retry without creating a second resident.
    const migrated = imported && Object.values(this.rooms.profiles).find((p) => p.localId === imported.id && !p.pending);
    if (migrated) return { playerId: migrated.playerId, groupCode: migrated.groupCode };
    let profile = Object.values(this.rooms.profiles).find(
      (p) => p.pending && (imported ? p.imported?.id === imported.id : !p.imported && JSON.stringify(p.pending) === JSON.stringify(input))
    );
    if (!profile) {
      profile = {
        playerId: crypto.randomUUID(),
        token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""),
        name: input.name,
        petName: input.petName,
        petKind: input.petKind,
        groupCode: input.groupCode ?? "",
        pending: input,
        imported,
        localId: imported?.id,
      };
      this.rooms.profiles[profile.playerId] = profile;
      this.persist();
    }
    const session = await this.rpc<Session>("rpc/flats_create_player", {
      p_id: profile.playerId,
      p_token: profile.token,
      p_name: input.name,
      p_pet_kind: input.petKind,
      p_pet_name: input.petName,
      p_day: today(),
      p_group_code: input.groupCode ? normalizeGroupCode(input.groupCode) : null,
      p_import: imported ?? null,
    });
    profile.groupCode = session.groupCode;
    delete profile.pending;
    delete profile.imported;
    this.persist();
    return session;
  }
  async createPlayer(input: NewPlayerInput): Promise<Session> {
    const session = await this.moveIn(input);
    this.rooms.activePlayerId = session.playerId;
    this.persist();
    return session;
  }
  groupName(code: string): Promise<string | null> {
    return this.rpc("rpc/flats_group_name", { p_code: normalizeGroupCode(code) });
  }
  async fetchGroup(session: Session): Promise<GroupSnapshot> {
    const snapshot = await this.rpc<GroupSnapshot>("rpc/flats_fetch_group", this.credentials(session));
    const resident = snapshot.players.find((player) => player.id === session.playerId);
    const saved = this.rooms.profiles[session.playerId];
    // Admin corrections and moves must also update this device's saved profile.
    if (resident && saved) {
      const details = { name: resident.name, petName: resident.petName, petKind: resident.petKind, groupCode: snapshot.group.code };
      if (
        saved.name !== details.name ||
        saved.petName !== details.petName ||
        saved.petKind !== details.petKind ||
        saved.groupCode !== details.groupCode
      ) {
        Object.assign(saved, details);
        this.persist();
      }
    }
    return snapshot;
  }
  private update(session: Session, action: string, day: string, value: unknown = null): Promise<Player> {
    return this.rpc("rpc/flats_update_player", { ...this.credentials(session), p_action: action, p_day: day, p_value: value });
  }
  logWorkout(session: Session, day: string, type?: WorkoutType) {
    return this.update(session, "workout", day, type);
  }
  setWorkoutType(session: Session, day: string, type: WorkoutType) {
    return this.update(session, "workoutType", day, type);
  }
  unpack(session: Session, entryId: string, day: string) {
    return this.update(session, "unpack", day, entryId);
  }
  saveLayout(session: Session, layout: Layout) {
    return this.update(session, "layout", today(), layout);
  }
  react(session: Session, toPlayerId: string, kind: ReactionKind, day: string, variant?: number): Promise<Reaction> {
    return this.rpc("rpc/flats_react", { ...this.credentials(session), p_to: toPlayerId, p_kind: kind, p_day: day, p_variant: variant ?? null });
  }
  localProfiles(): ProfileSummary[] {
    return Object.values(this.rooms.profiles)
      .filter((p) => !p.pending && !p.unavailable)
      .map(({ playerId, name, petName, petKind }) => ({ playerId, name, petName, petKind }));
  }
  switchProfile(playerId: string): Session {
    const profile = this.rooms.profiles[playerId];
    if (!profile || profile.pending || profile.unavailable) throw new SessionUnavailableError("This flat is no longer available.");
    this.rooms.activePlayerId = playerId;
    this.persist();
    return { playerId, groupCode: profile.groupCode };
  }
  signOut() {
    this.rooms.activePlayerId = null;
    this.persist();
  }
  roomKey(session: Session): string {
    return `${session.playerId}.${this.credentials(session).p_token}`;
  }
  async restorePlayer(key: string): Promise<Session> {
    const [id, token, extra] = key.trim().split(".");
    if (extra || !/^[0-9a-f-]{36}$/i.test(id ?? "") || !/^[a-f0-9]{64}$/.test(token ?? ""))
      throw new GameRuleError("That room key doesn't look quite right.");
    const resolved = await this.resolveRoom(id, token);
    const snapshot = await this.rpc<GroupSnapshot>("rpc/flats_fetch_group", { p_player_id: resolved.playerId, p_token: token });
    this.rooms.profiles[resolved.playerId] = { ...resolved, groupCode: snapshot.group.code, token };
    if (resolved.playerId !== id) delete this.rooms.profiles[id];
    return this.switchProfile(resolved.playerId);
  }
}
