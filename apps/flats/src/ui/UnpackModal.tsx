/** Unpacking a present: the box wobbles, the flaps pop, and three item cards flutter out. */

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useModalDialog } from "./hooks";
import { KitArt } from "../art/brownstone/KitArt";
import { ItemThumb } from "../art/ItemArt";
import { SurfaceThumb } from "../art/Surfaces";
import { CATALOG } from "../game/catalog";
import type { CatalogEntry, Present } from "../game/progression";
import { drawChoices, isSurface } from "../game/progression";
import type { Player } from "../game/types";
import { Embers } from "./common";
import { playChime, playPop, playRustle } from "./sound";

interface UnpackModalProps {
  player: Player;
  present: Present;
  day: string;
  reducedMotion: boolean;
  onPick: (entryId: string) => Promise<void>;
  onPlaceNow: (entryId: string) => void;
  onClose: () => void;
}

type Stage = "box" | "opening" | "choices" | "picked";

function EntryArt({ entry, size }: { entry: CatalogEntry; size: number }) {
  return isSurface(entry) ? <SurfaceThumb surface={entry} size={size} /> : <ItemThumb item={entry} size={size} />;
}

export function UnpackModal({ player, present, day, reducedMotion, onPick, onPlaceNow, onClose }: UnpackModalProps) {
  const dialog = useModalDialog();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [stage, setStage] = useState<Stage>("box");
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = useMemo(() => {
    const entries = [...CATALOG.items, ...CATALOG.surfaces];
    return drawChoices(CATALOG, player, present, day).map((id) => entries.find((entry) => entry.id === id)!);
  }, [player, present, day]);

  useEffect(() => {
    if (stage === "choices" || stage === "picked") dialog.current?.querySelector<HTMLButtonElement>(".choice-card, .picked-actions button")?.focus();
  }, [stage, dialog]);
  const open = () => {
    if (stage !== "box") return;
    playRustle();
    setStage("opening");
    timer.current = setTimeout(
      () => {
        playPop();
        setStage("choices");
      },
      reducedMotion ? 50 : 750
    );
  };

  const pick = async (entry: CatalogEntry) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onPick(entry.id);
      playChime();
      setPicked(entry);
      setStage("picked");
    } catch {
      setError("Your present is still here. Try choosing again when you’re connected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="unpack-backdrop"
      aria-label="Unpack your present"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="unpack-heading">
        <h2>{stage === "picked" ? "A little more like home" : stage === "choices" ? "Something for your flat" : "You earned a little something"}</h2>
        <p>
          {stage === "choices"
            ? "Choose one to keep. The others will come around again."
            : stage === "picked"
              ? picked?.blurb
              : ["", "Wrapped in kraft paper. Tied with care.", "An emerald parcel, just for you.", "A special delivery for a good week."][
                  present.tier
                ]}
        </p>
      </div>
      {error && (
        <p role="alert" className="fine-print">
          {error}
        </p>
      )}
      {stage !== "picked" && (
        <button type="button" className="unpack-later" disabled={busy} onClick={onClose} aria-label="Close">
          ✕
        </button>
      )}
      {(stage === "box" || stage === "opening") && (
        <button type="button" className={`unpack-box stage-${stage} present-tier-${present.tier}`} onClick={open} aria-label="Open the box">
          <svg viewBox="0 0 220 200" width="220" height="200" aria-hidden="true">
            <g className="unpack-box-body">
              <KitArt id={`present-${present.tier}`} width={220} height={190} />
            </g>
          </svg>
          <span className="parcel-hint">Tap to unwrap</span>
        </button>
      )}

      {stage === "choices" && (
        <div className="unpack-choices">
          <Embers burstKey={1} reducedMotion={reducedMotion} />
          <div className="choice-row">
            {choices.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={`choice-card card rarity-${entry.rarity} tier-${entry.tier}`}
                style={{ "--i": index } as CSSProperties}
                onClick={() => void pick(entry)}
                disabled={busy}
              >
                <EntryArt entry={entry} size={92} />
                <strong>{entry.name}</strong>
                <small>{entry.blurb}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "picked" && picked && (
        <div className="unpack-picked card enter-flutter">
          <div className="picked-glow" aria-hidden="true" />
          <EntryArt entry={picked} size={140} />
          <h2>{picked.name}</h2>
          <div className="picked-actions">
            <button type="button" className="big-button" onClick={() => onPlaceNow(picked.id)}>
              {isSurface(picked) ? "Use it" : "Place it"}
            </button>
            <button type="button" className="text-button" onClick={onClose}>
              Later
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
