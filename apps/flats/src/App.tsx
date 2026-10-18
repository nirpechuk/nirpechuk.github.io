/** Top-level state: session, group snapshot, navigation, celebrations and modals. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { lightingForHour } from "./art/lighting";
import { petSpec } from "./art/pets";
import { createBackend } from "./backend";
import { normalizeGroupCode } from "./backend/local";
import type { NewPlayerInput, Session } from "./backend/types";
import { GameRuleError } from "./backend/types";
import { addDays, today, weekStart } from "./game/dates";
import type { Present, WeekRecap } from "./game/progression";
import { joinNames, nextPresent, petMood, weekRecap, workoutsInWeekOf } from "./game/progression";
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

type Tab = "home" | "building";

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
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [visit, setVisit] = useState<{ playerId: string; fromRect: DOMRect | null } | null>(null);
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
      setSnapshot(await backend.fetchGroup(activeSession));
    },
    [backend],
  );

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await action();
      } catch (error) {
        if (error instanceof GameRuleError) {
          toast(error.message, "·");
          return undefined;
        }
        console.error(error);
        toast(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`, "!");
        return undefined;
      }
    },
    [toast],
  );

  useEffect(() => {
    if (session) void run(() => refresh(session));
  }, [session, refresh, run]);

  useEffect(() => {
    if (!joinCode) return;
    void backend.groupName(joinCode).then((name) => {
      if (name) setJoinGroupName(name);
      else {
        toast("That invite is for the online building, which opens soon. Start your own for now.", "·");
        setJoinCode(null);
        clearJoinCodeFromUrl();
      }
    });
  }, [backend, joinCode, toast]);

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
      if (reaction.kind === "sticker") toast(`${from} left a star on your door`, "✦");
      if (reaction.kind === "treat") toast(`${from} sent ${me.petName} a ${treat.name}`, "❖");
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

  if (!session || !snapshot || !me) {
    if (session && !snapshot) return <div className="loading">Unfolding your flat…</div>;
    return (
      <Onboarding
        joinCode={joinGroupName ? joinCode : null}
        joinGroupName={joinGroupName}
        profiles={backend.localProfiles()}
        onSwitchProfile={(playerId) => setSession(backend.switchProfile(playerId))}
        onDone={async (input: NewPlayerInput) => {
          const created = await run(() => backend.createPlayer(input));
          if (!created) return;
          clearJoinCodeFromUrl();
          setJoinCode(null);
          setTab("home");
          setSession(created);
        }}
      />
    );
  }

  const mood = petMood(me, day);
  const lastWeekRecap = weekRecap(snapshot.players, addDays(weekStart(day), -7));
  const byId = new Map(snapshot.players.map((player) => [player.id, player]));
  const recapBanner =
    lastWeekRecap.total > 0
      ? `Every flat got a little warmer last week. ${joinNames(lastWeekRecap.stars.map((id) => byId.get(id)?.name ?? "A neighbour"))} kept the brightest window.`
      : null;
  const visitedPlayer = visit ? byId.get(visit.playerId) ?? null : null;

  const log = async () => {
    const updated = await run(() => backend.logWorkout(session, day));
    if (!updated) return;
    await refresh(session);
    playChime();
    setConfettiKey((count) => count + 1);
    setCelebrateKey((count) => count + 1);
    const weekCount = workoutsInWeekOf(updated, day);
    const cheer = weekCount >= 4 ? "A luxe present is waiting." : weekCount >= 2 ? "A finer present is waiting." : "A present is waiting.";
    toast(`Logged. ${me.petName} perked right up. ${cheer}`, "✦");
  };

  return (
    <div className={`app tab-${tab}${reducedMotion ? " reduced-motion" : ""}`}>
      {backend.mode === "local" && <div className="mode-ribbon">device-only preview</div>}

      {tab === "home" ? (
        <Home
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
            if (await run(() => backend.setWorkoutType(session, day, type))) await refresh(session);
          }}
          onSaveLayout={async (layout: Layout) => {
            if (await run(() => backend.saveLayout(session, layout))) await refresh(session);
          }}
          onOpenPresent={() => setUnpackPresent(nextPresent(me))}
          onOpenSettings={() => setSheet("settings")}
          toast={toast}
        />
      ) : (
        <Building
          snapshot={snapshot}
          meId={me.id}
          day={day}
          lighting={lighting}
          reducedMotion={reducedMotion}
          recapBanner={recapBanner}
          onOpenFlat={(playerId, fromRect) => setVisit({ playerId, fromRect })}
          onInvite={() => setSheet("invite")}
        />
      )}

      <nav className="tab-bar" aria-label="Sections">
        <button type="button" className={tab === "home" ? "is-active" : ""} onClick={() => setTab("home")}>
          My flat
        </button>
        <button type="button" className={tab === "building" ? "is-active" : ""} onClick={() => setTab("building")}>
          Building
        </button>
      </nav>

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
            await refresh(session);
            return true;
          }}
          onClose={() => setVisit(null)}
          onGoHome={() => {
            setVisit(null);
            setTab("home");
          }}
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
            await refresh(session);
          }}
          onPlaceNow={(entryId) => {
            setUnpackPresent(null);
            setTab("home");
            setPlaceRequest(entryId);
          }}
          onClose={() => setUnpackPresent(null)}
        />
      )}

      {sheet === "settings" && (
        <SettingsSheet
          me={me}
          mode={backend.mode}
          profiles={backend.localProfiles()}
          hasDemoNeighbours={snapshot.players.some((player) => player.demo)}
          onSwitchProfile={(playerId) => {
            setSheet(null);
            setSnapshot(null);
            setSession(backend.switchProfile(playerId));
          }}
          onAddPlayer={() => {
            setSheet(null);
            setJoinCode(session.groupCode);
            setJoinGroupName(snapshot.group.name);
            backend.signOut();
            setSnapshot(null);
            setSession(null);
          }}
          onRemoveDemo={async () => {
            setSheet(null);
            await run(async () => {
              await backend.removeDemoNeighbours?.(session);
              await refresh(session);
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
