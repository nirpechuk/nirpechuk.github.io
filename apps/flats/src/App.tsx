/** Top-level state: session, group snapshot, navigation, celebrations and modals. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { lightingForHour } from "./art/lighting";
import { petSpec } from "./art/pets";
import { createBackend } from "./backend";
import { normalizeGroupCode } from "./backend/local";
import type { NewPlayerInput, Session } from "./backend/types";
import { GameRuleError, SessionUnavailableError } from "./backend/types";
import { addDays, today, weekStart } from "./game/dates";
import type { Present, WeekRecap } from "./game/progression";
import { nextPresent, petMood, weekRecap } from "./game/progression";
import type { GroupSnapshot, Layout, ReactionKind, WorkoutType } from "./game/types";
import { Building } from "./ui/Building";
import type { ToastMessage } from "./ui/common";
import { Embers, Toasts } from "./ui/common";
import { Home } from "./ui/Home";
import { readNumber, readString, useHour, useReducedMotion, writeValue } from "./ui/hooks";
import { Onboarding } from "./ui/Onboarding";
import { InviteSheet, RecapSheet, SettingsSheet } from "./ui/Sheets";
import { playChime } from "./ui/sound";
import { UnpackModal } from "./ui/UnpackModal";
import { Visit } from "./ui/Visit";

function joinCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("join");
  return code ? normalizeGroupCode(code) : null;
}

function clearJoinCodeFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState(null, "", url);
}

export function App() {
  const backend = useMemo(() => createBackend(), []);
  const [session, setSession] = useState<Session | null>(() => backend.currentSession());
  const [ready, setReady] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshVersion = useRef(0);
  const syncFailed = useRef(false);
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [visit, setVisit] = useState<{ playerId: string; fromRect: DOMRect | null; glow: number } | null>(null);
  const [unpackPresent, setUnpackPresent] = useState<Present | null>(null);
  const [placeRequest, setPlaceRequest] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"settings" | "invite" | null>(null);
  const [recap, setRecap] = useState<WeekRecap | null>(null);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [treatKey, setTreatKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [joinCode, setJoinCode] = useState<string | null>(joinCodeFromUrl);
  const [joinGroupName, setJoinGroupName] = useState<string | null>(null);
  const toastId = useRef(0);
  const hour = useHour();
  const reducedMotion = useReducedMotion();
  const lighting = lightingForHour(hour);
  const day = today();

  const toast = useCallback((text: string, icon?: string) => {
    const id = ++toastId.current;
    setToasts((current) => [...current.slice(-2), { id, text, icon }]);
    window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), 3800);
  }, []);

  const refresh = useCallback(
    async (activeSession: Session) => {
      const version = ++refreshVersion.current;
      const next = await backend.fetchGroup(activeSession);
      if (version === refreshVersion.current && backend.currentSession()?.playerId === activeSession.playerId) {
        setSnapshot(next);
        setLoadError(null);
      }
    },
    [backend]
  );

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await action();
      } catch (error) {
        if (error instanceof SessionUnavailableError) {
          backend.signOut();
          setSession(null);
          setSnapshot(null);
          setVisit(null);
          setSheet(null);
          setUnpackPresent(null);
        }
        if (error instanceof GameRuleError) {
          toast(error.message, "·");
          return undefined;
        }
        console.error(error);
        toast(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`, "!");
        return undefined;
      }
    },
    [backend, toast]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.resolve(backend.initialize ? backend.initialize() : backend.currentSession())
      .then((active) => {
        if (!cancelled) {
          setSession(active);
          setReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, startupAttempt]);

  useEffect(() => {
    if (!ready || !session) return;
    let stopped = false;
    let fetching = false;
    const sync = async () => {
      if (stopped || fetching) return;
      fetching = true;
      try {
        await refresh(session);
        syncFailed.current = false;
      } catch (error) {
        if (!stopped) {
          setLoadError(error instanceof Error ? error.message : "Couldn't reach your building.");
          if (!syncFailed.current || error instanceof SessionUnavailableError)
            await run(async () => {
              throw error;
            });
          syncFailed.current = true;
        }
      } finally {
        fetching = false;
      }
    };
    void sync();
    const visibleSync = () => {
      if (!document.hidden) void sync();
    };
    const interval = backend.mode === "online" ? window.setInterval(visibleSync, 8000) : undefined;
    window.addEventListener("focus", visibleSync);
    window.addEventListener("online", visibleSync);
    document.addEventListener("visibilitychange", visibleSync);
    return () => {
      stopped = true;
      ++refreshVersion.current;
      window.clearInterval(interval);
      window.removeEventListener("focus", visibleSync);
      window.removeEventListener("online", visibleSync);
      document.removeEventListener("visibilitychange", visibleSync);
    };
  }, [backend, ready, session, refresh, run]);

  useEffect(() => {
    if (!joinCode) return;
    let cancelled = false;
    void run(async () => {
      const name = await backend.groupName(joinCode);
      if (cancelled) return;
      if (name) setJoinGroupName(name);
      else {
        toast("That invite code doesn't match a building.", "·");
        setJoinCode(null);
        clearJoinCodeFromUrl();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [backend, joinCode, toast, run]);

  const me = snapshot?.players.find((player) => player.id === session?.playerId) ?? null;

  // Reactions received since the last visit: toasts, and treats get eaten on screen.
  useEffect(() => {
    if (!snapshot || !me) return;
    const seenKey = `reactions-seen:${me.id}`;
    const lastSeen = readNumber(seenKey, 0);
    const fresh = snapshot.reactions.filter((reaction) => reaction.to === me.id && reaction.at > lastSeen);
    if (fresh.length === 0) return;
    writeValue(seenKey, Math.max(...fresh.map((reaction) => reaction.at)));
    const names = new Map(snapshot.players.map((player) => [player.id, player.name]));
    const treat = petSpec(me.petKind).treat;
    for (const reaction of fresh.slice(-3)) {
      const from = names.get(reaction.from) ?? "A neighbour";
      if (reaction.kind === "heart") toast(`${from} left you a heart`, "♥");
      if (reaction.kind === "sticker") toast(`${from} left a star on your window`, "✦");
      if (reaction.kind === "treat") toast(`${from} sent ${me.petName} a ${treat.name}`, "🍬");
    }
    if (fresh.some((reaction) => reaction.kind === "treat")) window.setTimeout(() => setTreatKey((count) => count + 1), 900);
  }, [snapshot, me, toast]);

  // Weekly recap: once per new week, celebrating last week if anyone moved.
  useEffect(() => {
    if (!snapshot || !me) return;
    const thisWeek = weekStart(day);
    const recapKey = `recap-seen:${me.id}`;
    if (readString(recapKey) === thisWeek) return;
    const lastWeek = weekRecap(snapshot.players, addDays(thisWeek, -7));
    if (lastWeek.total > 0 && me.createdDay < thisWeek) setRecap(lastWeek);
    else writeValue(recapKey, thisWeek);
  }, [snapshot, me, day]);

  if (!ready || (session && !snapshot))
    return (
      <div className="loading">
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button
              className="chip"
              onClick={() => {
                setReady(false);
                setStartupAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </>
        ) : (
          "Turning on the lights…"
        )}
      </div>
    );
  if (!session || !snapshot || !me) {
    return (
      <>
        <Onboarding
          joinCode={joinGroupName ? joinCode : null}
          joinGroupName={joinGroupName}
          profiles={backend.localProfiles()}
          onRestore={
            backend.restorePlayer
              ? async (key) => {
                  const restored = await run(() => backend.restorePlayer!(key));
                  if (restored) {
                    setSnapshot(null);
                    setSession(restored);
                  }
                }
              : undefined
          }
          onSwitchProfile={(playerId) => setSession(backend.switchProfile(playerId))}
          onDone={async (input: NewPlayerInput) => {
            const created = await run(() => backend.createPlayer(input));
            if (!created) return;
            clearJoinCodeFromUrl();
            setJoinCode(null);
            setSession(created);
          }}
        />
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((t) => t.id !== id))} />
      </>
    );
  }

  const mood = petMood(me, day);
  const byId = new Map(snapshot.players.map((player) => [player.id, player]));
  const visitedPlayer = visit ? (byId.get(visit.playerId) ?? null) : null;

  const log = async () => {
    const updated = await run(() => backend.logWorkout(session, day));
    if (!updated) return;
    await run(() => refresh(session));
    playChime();
    setConfettiKey((count) => count + 1);
    setCelebrateKey((count) => count + 1);
  };

  return (
    <div className={`app tab-building${reducedMotion ? " reduced-motion" : ""}`}>
      <div className="building-camera" inert={visit ? true : undefined}>
        <Building
          snapshot={snapshot}
          meId={me.id}
          day={day}
          lighting={lighting}
          reducedMotion={reducedMotion}
          openPlayerId={visit?.playerId ?? null}
          onOpenFlat={(playerId, fromRect, glow) => setVisit({ playerId, fromRect, glow })}
          onInvite={() => setSheet("invite")}
        />
      </div>

      {visit && visitedPlayer && (
        <Visit
          player={visitedPlayer}
          isMe={visitedPlayer.id === me.id}
          meId={me.id}
          day={day}
          lighting={lighting}
          reducedMotion={reducedMotion}
          reactions={snapshot.reactions}
          fromRect={visit.fromRect}
          onReact={async (kind: ReactionKind, variant?: number) => {
            const sent = await run(() => backend.react(session, visitedPlayer.id, kind, day, variant));
            if (!sent) return false;
            await run(() => refresh(session));
            return true;
          }}
          onClose={() => setVisit(null)}
          ownFlat={
            visitedPlayer.id === me.id
              ? (onBack) => (
                  <Home
                    onBack={onBack}
                    me={me}
                    day={day}
                    lighting={lighting}
                    mood={mood}
                    reducedMotion={reducedMotion}
                    celebrateKey={celebrateKey}
                    treatKey={treatKey}
                    placeRequest={placeRequest}
                    onPlaceRequestHandled={() => setPlaceRequest(null)}
                    onLog={log}
                    onSetType={async (type: WorkoutType) => {
                      if (await run(() => backend.setWorkoutType(session, day, type))) await run(() => refresh(session));
                    }}
                    onSaveLayout={async (layout: Layout) => {
                      const updated = await run(() => backend.saveLayout(session, layout));
                      if (!updated) throw new Error("Layout save failed.");
                      ++refreshVersion.current;
                      setSnapshot((current) =>
                        current ? { ...current, players: current.players.map((player) => (player.id === updated.id ? updated : player)) } : current
                      );
                    }}
                    onOpenPresent={() => setUnpackPresent(nextPresent(me))}
                    onOpenSettings={() => setSheet("settings")}
                  />
                )
              : undefined
          }
        />
      )}

      {unpackPresent && (
        <UnpackModal
          player={me}
          present={unpackPresent}
          day={day}
          reducedMotion={reducedMotion}
          onPick={async (entryId) => {
            const updated = await run(() => backend.unpack(session, entryId, day));
            if (!updated) throw new Error("Unpacking failed.");
            await run(() => refresh(session));
          }}
          onPlaceNow={(entryId) => {
            setUnpackPresent(null);
            setPlaceRequest(entryId);
          }}
          onClose={() => setUnpackPresent(null)}
        />
      )}

      {sheet === "settings" && (
        <SettingsSheet
          me={me}
          roomKey={backend.roomKey?.(session)}
          profiles={backend.localProfiles()}
          hasDemoNeighbours={snapshot.players.some((player) => player.demo)}
          onSwitchProfile={(playerId) => {
            setSheet(null);
            setVisit(null);
            setSnapshot(null);
            setSession(backend.switchProfile(playerId));
          }}
          onAddPlayer={() => {
            setSheet(null);
            setJoinCode(snapshot.group.code);
            setJoinGroupName(snapshot.group.name);
            setVisit(null);
            backend.signOut();
            setSnapshot(null);
            setSession(null);
          }}
          onRemoveDemo={async () => {
            setSheet(null);
            await run(async () => {
              await backend.removeDemoNeighbours?.(session);
              await run(() => refresh(session));
            });
            toast("The demo neighbours moved out", "·");
          }}
          onInvite={() => setSheet("invite")}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "invite" && <InviteSheet group={snapshot.group} mode={backend.mode} onClose={() => setSheet(null)} />}

      {recap && (
        <RecapSheet
          recap={recap}
          players={snapshot.players}
          onClose={() => {
            writeValue(`recap-seen:${me.id}`, weekStart(day));
            setRecap(null);
          }}
        />
      )}

      <Embers burstKey={confettiKey} reducedMotion={reducedMotion} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((entry) => entry.id !== id))} />
    </div>
  );
}
