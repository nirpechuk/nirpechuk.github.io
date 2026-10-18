/** Visiting a flat: zooms out of its building window, lets you leave a heart, sticker or treat. */

import { useLayoutEffect, useRef, useState } from "react";

import type { Lighting } from "../art/lighting";
import { RoomScene } from "../art/RoomScene";
import { petMood } from "../game/progression";
import type { Player, Reaction, ReactionKind } from "../game/types";
import { playChime, playPop } from "./sound";

export const STICKERS = ["✦", "♥", "☾", "❀", "★", "✧"];
const ZOOM_IN_MS = 1150;
const ZOOM_OUT_MS = 650;
/** A soft start and a long, gentle landing for zooming in; plain ease-in-out for zooming out. */
const ZOOM_IN_EASING = "cubic-bezier(0.45, 0, 0.15, 1)";
const ZOOM_OUT_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";
/** Match the building window's tint (see .window-dim / .window-warm) so the zoom starts seamlessly. */
const windowDimOpacity = (glow: number) => (1 - glow) * 0.72;
const windowWarmOpacity = (glow: number) => glow * 0.3;

interface VisitProps {
  player: Player;
  isMe: boolean;
  meId: string;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  reactions: Reaction[];
  fromRect: DOMRect | null;
  /** Brightness of the building window we zoom out of, so its tint can fade away smoothly. */
  fromGlow: number;
  onReact: (kind: ReactionKind, variant?: number) => Promise<boolean>;
  onClose: () => void;
  onGoHome: () => void;
}

/**
 * Transform that maps `target`'s final box onto `source` (FLIP). Scales uniformly so the room
 * never squashes, centring vertically if the aspect ratios differ slightly.
 */
function flipTransform(source: DOMRect, target: DOMRect): string {
  const scale = source.width / target.width;
  const offsetY = source.top + (source.height - target.height * scale) / 2 - target.top;
  return `translate(${source.left - target.left}px, ${offsetY}px) scale(${scale})`;
}

function windowRectFor(playerId: string): DOMRect | null {
  const room = document.querySelector(`.flat-window[data-player="${playerId}"] .window-glass .room-scene`);
  return room ? room.getBoundingClientRect() : null;
}

export function Visit(props: VisitProps) {
  const { player, isMe, meId, day, lighting, reducedMotion, reactions, fromRect, fromGlow, onReact, onClose, onGoHome } = props;
  const roomRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dimVeilRef = useRef<HTMLDivElement>(null);
  const warmVeilRef = useRef<HTMLDivElement>(null);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [treatKey, setTreatKey] = useState(0);
  const [flying, setFlying] = useState<{ id: number; emoji: string } | null>(null);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room || !fromRect || reducedMotion) return;
    const timing = { duration: ZOOM_IN_MS, easing: ZOOM_IN_EASING, fill: "both" as const };
    room.animate([{ transform: flipTransform(fromRect, room.getBoundingClientRect()), borderRadius: "3px" }, { transform: "none", borderRadius: "12px" }], timing);
    dimVeilRef.current?.animate([{ opacity: windowDimOpacity(fromGlow) }, { opacity: 0 }], timing);
    warmVeilRef.current?.animate([{ opacity: windowWarmOpacity(fromGlow) }, { opacity: 0 }], timing);
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ZOOM_IN_MS * 0.75, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" });
  }, [fromRect, fromGlow, reducedMotion]);

  const close = () => {
    if (closing) return;
    const room = roomRef.current;
    const target = windowRectFor(player.id);
    if (!room || !target || reducedMotion) {
      onClose();
      return;
    }
    setClosing(true);
    const timing = { duration: ZOOM_OUT_MS, easing: ZOOM_OUT_EASING, fill: "forwards" as const };
    const animation = room.animate(
      [{ transform: "none", borderRadius: "12px" }, { transform: flipTransform(target, room.getBoundingClientRect()), borderRadius: "3px" }],
      timing,
    );
    dimVeilRef.current?.animate([{ opacity: 0 }, { opacity: windowDimOpacity(fromGlow) }], timing);
    warmVeilRef.current?.animate([{ opacity: 0 }, { opacity: windowWarmOpacity(fromGlow) }], timing);
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, easing: "cubic-bezier(0.32, 0, 0.67, 0)" });
    animation.onfinish = onClose;
  };

  const sentToday = (kind: ReactionKind) =>
    reactions.some((reaction) => reaction.from === meId && reaction.to === player.id && reaction.kind === kind && reaction.day === day);

  const received = reactions.filter((reaction) => reaction.to === player.id);
  const stickers = received
    .filter((reaction) => reaction.kind === "sticker")
    .slice(-6)
    .map((reaction) => STICKERS[(reaction.variant ?? 0) % STICKERS.length]);

  const send = async (kind: ReactionKind) => {
    const variant = kind === "sticker" ? Math.floor(Math.random() * STICKERS.length) : undefined;
    const sent = await onReact(kind, variant);
    if (!sent) return;
    const emoji = kind === "heart" ? "♥" : kind === "sticker" ? STICKERS[variant ?? 0] : "❖";
    setFlying({ id: Date.now(), emoji });
    playPop();
    window.setTimeout(() => {
      playChime();
      if (kind === "treat") setTreatKey((count) => count + 1);
      else setCelebrateKey((count) => count + 1);
    }, reducedMotion ? 0 : 650);
  };

  return (
    <div className={`visit${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={`${player.name}'s flat`}>
      <div className="visit-backdrop" ref={backdropRef} />
      <div className="visit-content">
        <header className="visit-header">
          <button type="button" className="back-button" onClick={close} aria-label="Back to the building">
            ←
          </button>
          <h1 className="visit-name">{isMe ? "You" : player.name}</h1>
        </header>
        <div className="visit-room" ref={roomRef}>
          <RoomScene
            player={player}
            variant="visit"
            lighting={lighting}
            mood={petMood(player, day)}
            reducedMotion={reducedMotion}
            celebrateKey={celebrateKey}
            treatKey={treatKey}
            stickers={stickers}
          />
          <div className="visit-veil visit-veil-dim" ref={dimVeilRef} aria-hidden="true" />
          <div className="visit-veil visit-veil-warm" ref={warmVeilRef} aria-hidden="true" />
          {flying && (
            <span key={flying.id} className="flying-reaction" aria-hidden="true">
              {flying.emoji}
            </span>
          )}
        </div>
        {isMe ? (
          <div className="reaction-bar">
            <button type="button" className="big-button" onClick={onGoHome}>
              Decorate
            </button>
          </div>
        ) : (
          <div className="reaction-bar">
            <div className="reaction-buttons">
              <button
                type="button"
                className="reaction-button tone-blush"
                disabled={sentToday("heart")}
                onClick={() => void send("heart")}
                aria-label="Leave a heart"
              >
                ♥
              </button>
              <button
                type="button"
                className="reaction-button tone-butter"
                disabled={sentToday("sticker")}
                onClick={() => void send("sticker")}
                aria-label="Leave a star"
              >
                ✦
              </button>
              <button
                type="button"
                className="reaction-button tone-mint"
                disabled={sentToday("treat")}
                onClick={() => void send("treat")}
                aria-label={`Give ${player.petName} a treat`}
              >
                ❖
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
