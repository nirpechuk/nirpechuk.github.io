/** Settings, invite and weekly recap sheets. */

import { useState } from "react";

import { PetPortrait } from "../art/Pet";
import type { ProfileSummary } from "../backend/types";
import type { WeekRecap } from "../game/progression";
import type { Group, Player } from "../game/types";
import { Sheet } from "./common";
import { setSoundEnabled, soundEnabled } from "./sound";

export function inviteLink(groupCode: string): string {
  return `${window.location.origin}${window.location.pathname}?join=${groupCode}`;
}

function reminderCalendar(petName: string, time: string): string {
  const [hours, minutes] = time.split(":");
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const startDay = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const message = `${petName} is waiting by the door…`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flats//EN",
    "BEGIN:VEVENT",
    `UID:flats-reminder-${stamp}@nirpechuk.github.io`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startDay}T${hours}${minutes}00`,
    "DURATION:PT10M",
    "RRULE:FREQ=DAILY",
    `SUMMARY:${message}`,
    `DESCRIPTION:Any little workout earns a present for your flat. ${window.location.origin}${window.location.pathname}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:PT0M",
    `DESCRIPTION:${message}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadReminder(petName: string, time: string): void {
  const blob = new Blob([reminderCalendar(petName, time)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "flats-reminder.ics";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function InviteSheet({ group, mode, onClose }: { group: Group; mode: "local" | "online"; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(group.code);
  return (
    <Sheet onClose={onClose}>
      <p className="invite-code">{group.code}</p>
      <button
        type="button"
        className="big-button"
        onClick={async () => {
          if (navigator.share) {
            await navigator.share({ title: "Flats", text: `Move into ${group.name} on Flats!`, url: link }).catch(() => undefined);
            return;
          }
          setCopied(await copyText(link));
        }}
      >
        {copied ? "Link copied!" : "Share invite link"}
      </button>
      {mode === "local" && <p className="fine-print">Saved on this device for now. Housemates can join from Settings.</p>}
    </Sheet>
  );
}

interface SettingsSheetProps {
  me: Player;
  profiles: ProfileSummary[];
  hasDemoNeighbours: boolean;
  onSwitchProfile: (playerId: string) => void;
  onAddPlayer: () => void;
  onRemoveDemo: () => void;
  onInvite: () => void;
  onClose: () => void;
}

export function SettingsSheet(props: SettingsSheetProps) {
  const { me, profiles, hasDemoNeighbours, onSwitchProfile, onAddPlayer, onRemoveDemo, onInvite, onClose } = props;
  const [sound, setSound] = useState(soundEnabled);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderTime, setReminderTime] = useState("18:00");
  const others = profiles.filter((profile) => profile.playerId !== me.id);

  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Neighbours</h3>
        <button type="button" className="chip chip-large" onClick={onInvite}>
          Invite friends
        </button>
        {hasDemoNeighbours && (
          <button type="button" className="chip chip-large" onClick={onRemoveDemo}>
            Remove the demo neighbours
          </button>
        )}
      </section>

      <section className="settings-section">
        <h3>Gentle reminder</h3>
        {reminderOpen ? (
          <div className="reminder-row">
            <input className="field" type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} />
            <button type="button" className="chip chip-large" onClick={() => downloadReminder(me.petName, reminderTime)}>
              Add to my calendar
            </button>
          </div>
        ) : (
          <button type="button" className="chip chip-large" onClick={() => setReminderOpen(true)}>
            Set a daily nudge
          </button>
        )}
      </section>

      <section className="settings-section">
        <h3>Sounds</h3>
        <button
          type="button"
          className="chip chip-large"
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }}
        >
          {sound ? "Sounds on" : "Sounds off"}
        </button>
      </section>

      <section className="settings-section">
        <h3>Players on this device</h3>
        {others.map((profile) => (
          <button key={profile.playerId} type="button" className="chip chip-large" onClick={() => onSwitchProfile(profile.playerId)}>
            Switch to {profile.name} & {profile.petName}
          </button>
        ))}
        <button type="button" className="chip chip-large" onClick={onAddPlayer}>
          Add a player
        </button>
      </section>
    </Sheet>
  );
}

export function RecapSheet({ recap, players, onClose }: { recap: WeekRecap; players: Player[]; onClose: () => void }) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const active = recap.counts.filter((entry) => entry.count > 0);
  return (
    <Sheet title="Last week" onClose={onClose} className="recap-sheet">
      <div className="recap-row">
        {active.map((entry) => {
          const player = byId.get(entry.playerId);
          if (!player) return null;
          return (
            <div key={entry.playerId} className={`recap-pet${recap.stars.includes(entry.playerId) ? " is-star" : ""}`}>
              <PetPortrait kind={player.petKind} action="happy" size={64} />
              <span>{player.name}</span>
            </div>
          );
        })}
      </div>
      <button type="button" className="big-button" onClick={onClose}>
        ✓
      </button>
    </Sheet>
  );
}
