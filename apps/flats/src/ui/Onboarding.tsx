/** Under-a-minute onboarding: your name, your pet, its name, then straight into the empty flat. */

import { useMemo, useState } from "react";

import type { PetKind } from "../game/types";
import { lightingForHour } from "../art/lighting";
import { PetPortrait } from "../art/Pet";
import { PET_NAME_IDEAS, PETS } from "../art/pets";
import { RoomScene } from "../art/RoomScene";
import { buildDemoNeighbours } from "../backend/demo";
import type { NewPlayerInput, ProfileSummary } from "../backend/types";
import { today } from "../game/dates";
import { useHour, useReducedMotion } from "./hooks";
import { playPop } from "./sound";

type Step = "welcome" | "name" | "pet" | "petName";

interface OnboardingProps {
  joinCode: string | null;
  joinGroupName: string | null;
  profiles: ProfileSummary[];
  onSwitchProfile: (playerId: string) => void;
  onRestore?: (key: string) => Promise<void>;
  onDone: (input: NewPlayerInput) => Promise<void>;
}

export function Onboarding({ joinCode, joinGroupName, profiles, onSwitchProfile, onDone, onRestore }: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [petKind, setPetKind] = useState<PetKind>("cat");
  const [petName, setPetName] = useState(() => PET_NAME_IDEAS[Math.floor(Math.random() * PET_NAME_IDEAS.length)]);
  const [roomKey, setRoomKey] = useState("");
  const [busy, setBusy] = useState(false);
  const hour = useHour();
  const reducedMotion = useReducedMotion();
  const showcaseFlat = useMemo(() => buildDemoNeighbours(today())[0], []);

  const finish = async () => {
    setBusy(true);
    try {
      await onDone({ name, petKind, petName, groupCode: joinCode ?? undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`onboarding${step === "welcome" ? " is-welcome" : ""}`}>
      {step === "welcome" && (
        <div className="welcome-room" aria-hidden="true">
          <RoomScene player={showcaseFlat} variant="visit" lighting={lightingForHour(hour)} mood="perky" reducedMotion={reducedMotion} />
        </div>
      )}
      {step === "welcome" && (
        <section className="onboarding-card welcome-card card enter-flutter">
          <h1 className="logo">Flats</h1>
          <h2 className="welcome-lede">
            A little movement.
            <br />A place of your own.
          </h2>
          <p className="welcome-copy">
            Log a workout. Unwrap a present. Make a bare little room feel like home, with a pet for company and friends next door.
          </p>
          {joinGroupName && <p className="join-note">{joinGroupName}</p>}
          <button type="button" className="big-button" onClick={() => setStep("name")}>
            Move in
          </button>
          <p className="welcome-caption">No streaks to lose. Your home is always here.</p>
          {onRestore && (
            <details className="room-key-entry">
              <summary>Already moved in?</summary>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  try {
                    await onRestore(roomKey);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <input
                  className="field"
                  aria-label="Room key"
                  placeholder="Your room key"
                  value={roomKey}
                  onChange={(event) => setRoomKey(event.target.value)}
                  autoComplete="off"
                />
                <button className="chip" disabled={busy || !roomKey.trim()}>
                  Come home
                </button>
              </form>
            </details>
          )}
          {profiles.length > 0 && (
            <div className="profile-switch">
              {profiles.map((profile) => (
                <button key={profile.playerId} type="button" className="chip" onClick={() => onSwitchProfile(profile.playerId)}>
                  {profile.name} & {profile.petName}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {step === "name" && (
        <form
          className="onboarding-card card enter-flutter"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) setStep("pet");
          }}
        >
          <button type="button" className="chip step-back" onClick={() => setStep("welcome")}>
            Back
          </button>
          <h2>Who’s moving in?</h2>
          <p>This is the name your neighbours will see.</p>
          <label htmlFor="resident-name">Your name</label>
          <input
            id="resident-name"
            className="field"
            autoFocus
            maxLength={20}
            placeholder="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="big-button" disabled={!name.trim()}>
            Next
          </button>
        </form>
      )}

      {step === "pet" && (
        <section className="onboarding-card card enter-flutter">
          <button type="button" className="chip step-back" onClick={() => setStep("name")}>
            Back
          </button>
          <h2>A little company</h2>
          <p>Pick someone to come home to.</p>
          <div className="pet-picker" role="radiogroup" aria-label="Pet">
            {PETS.map((pet) => (
              <button
                key={pet.kind}
                type="button"
                role="radio"
                aria-label={pet.label}
                aria-checked={petKind === pet.kind}
                className={`pet-option${petKind === pet.kind ? " is-selected" : ""}`}
                onClick={() => {
                  setPetKind(pet.kind);
                  playPop();
                }}
              >
                <PetPortrait kind={pet.kind} action={petKind === pet.kind ? "happy" : "idle"} size={78} />
                <span>{pet.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="big-button" onClick={() => setStep("petName")}>
            Next
          </button>
        </section>
      )}

      {step === "petName" && (
        <form
          className="onboarding-card card enter-flutter"
          onSubmit={(event) => {
            event.preventDefault();
            if (petName.trim() && !busy) void finish();
          }}
        >
          <button type="button" className="chip step-back" onClick={() => setStep("pet")}>
            Back
          </button>
          <h2>And their name?</h2>
          <PetPortrait kind={petKind} action="happy" size={120} />
          <label htmlFor="pet-name">Your pet’s name</label>
          <input
            id="pet-name"
            className="field"
            autoFocus
            maxLength={16}
            placeholder="Their name"
            value={petName}
            onChange={(event) => setPetName(event.target.value)}
          />
          <button type="submit" className="big-button" disabled={!petName.trim() || busy}>
            Move in
          </button>
        </form>
      )}
    </main>
  );
}
