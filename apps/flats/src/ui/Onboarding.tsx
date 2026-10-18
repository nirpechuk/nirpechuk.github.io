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
  onDone: (input: NewPlayerInput) => Promise<void>;
}

export function Onboarding({ joinCode, joinGroupName, profiles, onSwitchProfile, onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [petKind, setPetKind] = useState<PetKind>("cat");
  const [petName, setPetName] = useState(() => PET_NAME_IDEAS[Math.floor(Math.random() * PET_NAME_IDEAS.length)]);
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
    <main className="onboarding">
      {step === "welcome" && (
        <div className="welcome-room" aria-hidden="true">
          <RoomScene player={showcaseFlat} variant="visit" lighting={lightingForHour(hour)} mood="perky" reducedMotion={reducedMotion} />
        </div>
      )}
      {step === "welcome" && (
        <section className="onboarding-card welcome-card card enter-flutter">
          <h1 className="logo">Flats</h1>
          <p className="lede">A warm little flat that glows brighter every time you move.</p>
          {joinGroupName && <p className="join-note">You're invited to <strong>{joinGroupName}</strong>.</p>}
          <button type="button" className="big-button" onClick={() => setStep("name")}>
            {joinGroupName ? "Move in next door" : "Move in"}
          </button>
          {profiles.length > 0 && (
            <div className="profile-switch">
              <p>Already live here?</p>
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
          <h2>What should the neighbours call you?</h2>
          <input
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
          <h2>Pick a roommate</h2>
          <div className="pet-picker" role="radiogroup" aria-label="Pet">
            {PETS.map((pet) => (
              <button
                key={pet.kind}
                type="button"
                role="radio"
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
            This one
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
          <PetPortrait kind={petKind} action="happy" size={120} />
          <h2>And their name?</h2>
          <input
            className="field"
            autoFocus
            maxLength={16}
            value={petName}
            onChange={(event) => setPetName(event.target.value)}
          />
          <div className="name-ideas">
            {PET_NAME_IDEAS.slice(0, 6).map((idea) => (
              <button key={idea} type="button" className="chip" onClick={() => setPetName(idea)}>
                {idea}
              </button>
            ))}
          </div>
          <button type="submit" className="big-button" disabled={!petName.trim() || busy}>
            Let's go home
          </button>
        </form>
      )}
    </main>
  );
}
