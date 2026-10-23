import { useEffect, useState } from "react";
import { RoomScene } from "../art/RoomScene";
import { lightingForHour } from "../art/lighting";
import type { Backend, Session } from "../backend/types";
import { parseDay } from "../game/dates";
import { petMood } from "../game/progression";
import type { FlatSnapshot, Player } from "../game/types";
import { Sheet } from "./common";

const CAPTIONS: Record<FlatSnapshot["kind"], string> = {
  beginning: "A little room. A fresh start.",
  reconstructed: "Making room for little joys.",
  recording_started: "The start of your room’s saved story.",
  moved_in: "The day it all began.",
  decorated: "A little more like home.",
  unpacked: "Something new to make it yours.",
  workout: "You showed up. Your flat grew with you.",
  updated: "Another little chapter.",
};
const LIGHTING = lightingForHour(20);

export function FlatHistory({ backend, session, player, onClose }: { backend: Backend; session: Session; player: Player; onClose: () => void }) {
  const [frames, setFrames] = useState<FlatSnapshot[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPlaying(false);
    backend
      .fetchHistory(session, player.id)
      .then((history) => {
        if (!cancelled) {
          setFrames(history);
          setIndex(0);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [backend, session, player.id, attempt]);
  useEffect(() => {
    if (!playing) return;
    if (index >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setIndex((current) => current + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [playing, index, frames.length]);
  const frame = frames[index];
  const date = frame ? (frame.approximate ? parseDay(frame.day) : new Date(frame.recordedAt)) : null;
  const seek = (next: number) => {
    setPlaying(false);
    setIndex(next);
  };
  return (
    <Sheet title={`${player.name}’s flat, through time`} onClose={onClose} className="flat-history">
      {loading ? (
        <p role="status">Opening the scrapbook…</p>
      ) : error ? (
        <div role="alert">
          <p>Your flat’s story couldn’t load.</p>
          <button className="chip" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : !frame ? (
        <p>Your story is just beginning. Check back after your next workout.</p>
      ) : (
        <div className="history-layout">
          <div
            className="history-scene"
            role="img"
            aria-label={`${player.name}’s flat with ${Object.keys(frame.player.layout.slots).length} things placed`}
          >
            <div className="history-room-art" inert>
              <RoomScene player={frame.player} variant="visit" lighting={LIGHTING} mood={petMood(frame.player, frame.day)} reducedMotion />
            </div>
            <span className="history-frame-count">
              {index + 1} / {frames.length}
            </span>
          </div>
          <div className="history-details">
            <span className="history-eyebrow">A little progress. A warmer place.</span>
            <h3>{date?.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</h3>
            <span className={`history-quality${frame.approximate ? " is-estimate" : ""}`}>
              {frame.approximate ? "Reconstructed" : `Saved moment · ${date?.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
            </span>
            <p className="history-caption">{CAPTIONS[frame.kind]}</p>
            <div className="history-stats">
              <span>
                <strong>{frame.player.workouts.length}</strong> workouts
              </span>
              <span>
                <strong>{frame.player.unlocks.length}</strong> things earned
              </span>
            </div>
            <label className="history-slider-label" htmlFor="flat-history-position">
              Explore the story
            </label>
            <input
              id="flat-history-position"
              type="range"
              min="0"
              max={Math.max(0, frames.length - 1)}
              value={index}
              disabled={frames.length < 2}
              onChange={(event) => seek(Number(event.target.value))}
              aria-valuetext={`${date?.toLocaleDateString()} — ${frame.approximate ? "reconstructed" : "saved moment"}`}
            />
            <div className="history-controls">
              <button className="chip" aria-label="Previous moment" disabled={index === 0} onClick={() => seek(index - 1)}>
                ←
              </button>
              <button
                className="button primary"
                disabled={frames.length < 2}
                onClick={() => {
                  if (!playing && index === frames.length - 1) setIndex(0);
                  setPlaying((value) => !value);
                }}
              >
                {playing ? "Pause" : index === frames.length - 1 ? "Replay" : "Play timelapse"}
              </button>
              <button className="chip" aria-label="Next moment" disabled={index === frames.length - 1} onClick={() => seek(index + 1)}>
                →
              </button>
            </div>
            <p className="history-note">
              {frame.approximate
                ? "An estimate from workout and unlock dates, using today’s furniture positions. Earlier arrangements and colors weren’t recorded."
                : "The room as it was saved, including furniture positions, colors, walls and floors."}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
