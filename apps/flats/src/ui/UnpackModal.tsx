/** Unpacking a present: the box wobbles, the flaps pop, and three item cards flutter out. */

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

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
  const [stage, setStage] = useState<Stage>("box");
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => {
    const entries = [...CATALOG.items, ...CATALOG.surfaces];
    return drawChoices(CATALOG, player, present, day).map((id) => entries.find((entry) => entry.id === id)!);
  }, [player, present, day]);

  const open = () => {
    if (stage !== "box") return;
    playRustle();
    setStage("opening");
    window.setTimeout(() => {
      playPop();
      setStage("choices");
    }, reducedMotion ? 50 : 750);
  };

  const pick = async (entry: CatalogEntry) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(entry.id);
      playChime();
      setPicked(entry);
      setStage("picked");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="unpack-backdrop" role="dialog" aria-modal="true" aria-label="Unpack your present">
      {stage !== "picked" && (
        <button type="button" className="unpack-later" onClick={onClose} aria-label="Close">
          ✕
        </button>
      )}
      {(stage === "box" || stage === "opening") && (
        <button type="button" className={`unpack-box stage-${stage}`} onClick={open} aria-label="Open the box">
          <svg viewBox="-60 -70 120 100" width="220" height="190" aria-hidden="true">
            <ellipse cx="0" cy="26" rx="46" ry="6" fill="rgba(0,0,0,0.4)" />
            <g className="unpack-box-body">
              <path d="M-40 -20 L40 -20 L42 24 L-42 24Z" fill="#9a7048" />
              <path d="M-40 -20 L40 -20 L40 -10 L-40 -10Z" fill="#7f5b39" />
              <rect x="-7" y="-20" width="14" height="44" fill="#8c3a4b" />
              <path className="unpack-flap unpack-flap-left" d="M-40 -20 L-50 -36 L-6 -36 L0 -20Z" fill="#ad8256" />
              <path className="unpack-flap unpack-flap-right" d="M40 -20 L50 -36 L6 -36 L0 -20Z" fill="#ad8256" />
              <g className="unpack-bow" transform="translate(0 -22)">
                <path d="M0 0 C-18 -18 -26 -4 -14 2 Z" fill="#8c3a4b" />
                <path d="M0 0 C18 -18 26 -4 14 2 Z" fill="#8c3a4b" />
                <circle r="4.5" fill="#a8485a" />
              </g>
            </g>
          </svg>
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
    </div>
  );
}
