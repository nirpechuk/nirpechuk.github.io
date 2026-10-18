/** Visiting a flat: zooms out of its building window, lets you leave a heart, sticker or treat. */

import { useLayoutEffect, useRef, useState } from "react";

import type { Lighting } from "../art/lighting";
import { petSpec } from "../art/pets";
import { RoomScene } from "../art/RoomScene";
import { cosinessTitle, petMood, weekStreak, workoutsInWeekOf } from "../game/progression";
import type { Player, Reaction, ReactionKind } from "../game/types";
import { Tag } from "./common";
import { playChime, playPop } from "./sound";

export const STICKERS = ["✦", "♥", "☾", "❀", "★", "✧"];
const ZOOM_MS = 520;
const ZOOM_EASING = "cubic-bezier(0.2, 0.9, 0.25, 1.08)";

interface VisitProps {
  player: Player;
  isMe: boolean;
  meId: string;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  reactions: Reaction[];
  fromRect: DOMRect | null;
  onReact: (kind: ReactionKind, variant?: number) => Promise<boolean>;
  onClose: () => void;
  onGoHome: () => void;
}

/** Transform that maps `target`'s final box onto `source`, for FLIP-style zooms. */
function flipTransform(source: DOMRect, target: DOMRect): string {
  const scaleX = source.width / target.width;
  const scaleY = source.height / target.height;
  return `translate(${source.left - target.left}px, ${source.top - target.top}px) scale(${scaleX}, ${scaleY})`;
}

function windowRectFor(playerId: string): DOMRect | null {
  const glass = document.querySelector(`.flat-window[data-player="${playerId}"] .window-glass`);
  return glass ? glass.getBoundingClientRect() : null;
}

export function Visit(props: VisitProps) {
  const { player, isMe, meId, day, lighting, reducedMotion, reactions, fromRect, onReact, onClose, onGoHome } = props;
  const roomRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [treatKey, setTreatKey] = useState(0);
  const [flying, setFlying] = useState<{ id: number; emoji: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const pet = petSpec(player.petKind);

  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room || !fromRect || reducedMotion) return;
    room.animate([{ transform: flipTransform(fromRect, room.getBoundingClientRect()) }, { transform: "none" }], {
      duration: ZOOM_MS,
      easing: ZOOM_EASING,
    });
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ZOOM_MS * 0.6, easing: "ease-out" });
  }, [fromRect, reducedMotion]);

  const close = () => {
    if (closing) return;
    const room = roomRef.current;
    const target = windowRectFor(player.id);
    if (!room || !target || reducedMotion) {
      onClose();
      return;
    }
    setClosing(true);
    const animation = room.animate([{ transform: "none" }, { transform: flipTransform(target, room.getBoundingClientRect()) }], {
      duration: ZOOM_MS * 0.8,
      easing: "cubic-bezier(0.5, 0, 0.75, 0)",
      fill: "forwards",
    });
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZOOM_MS * 0.8, fill: "forwards" });
    animation.onfinish = onClose;
  };

  const sentToday = (kind: ReactionKind) =>
    reactions.some((reaction) => reaction.from === meId && reaction.to === player.id && reaction.kind === kind && reaction.day === day);

  const received = reactions.filter((reaction) => reaction.to === player.id);
  const stickers = received
    .filter((reaction) => reaction.kind === "sticker")
    .slice(-6)
    .map((reaction) => STICKERS[(reaction.variant ?? 0) % STICKERS.length]);
  const heartsCount = received.filter((reaction) => reaction.kind === "heart").length;
  const treatsCount = received.filter((reaction) => reaction.kind === "treat").length;

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
          <button type="button" className="back-button" onClick={close}>
            ← Building
          </button>
          <div>
            <h1 className="flat-title">{isMe ? "Your flat" : `${player.name}'s flat`}</h1>
            <p className="flat-subtitle">
              {cosinessTitle(Object.keys(player.layout.slots).length)} · {player.petName} the {pet.label.toLowerCase()}
            </p>
          </div>
        </header>
        <div className="flat-tags visit-tags">
          <Tag tone="butter">{workoutsInWeekOf(player, day)} this week</Tag>
          {weekStreak(player, day) > 1 && <Tag tone="blush">★ {weekStreak(player, day)}-week streak</Tag>}
          {(heartsCount > 0 || treatsCount > 0) && (
            <Tag tone="mint">
              {heartsCount > 0 && `♥ ${heartsCount}  `}
              {treatsCount > 0 && `❖ ${treatsCount}`}
            </Tag>
          )}
        </div>
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
          {flying && (
            <span key={flying.id} className="flying-reaction" aria-hidden="true">
              {flying.emoji}
            </span>
          )}
        </div>
        {isMe ? (
          <div className="reaction-bar">
            <p className="visit-note">This is you. Friends can leave hearts, stars and treats here.</p>
            <button type="button" className="big-button" onClick={onGoHome}>
              Go decorate
            </button>
          </div>
        ) : (
          <div className="reaction-bar">
            <p className="visit-note">Leave a little something</p>
            <div className="reaction-buttons">
              <button type="button" className="reaction-button tone-blush" disabled={sentToday("heart")} onClick={() => void send("heart")}>
                <span className="reaction-emoji">♥</span>
                {sentToday("heart") ? "Sent" : "Leave a heart"}
              </button>
              <button type="button" className="reaction-button tone-butter" disabled={sentToday("sticker")} onClick={() => void send("sticker")}>
                <span className="reaction-emoji">✦</span>
                {sentToday("sticker") ? "Left" : "Leave a star"}
              </button>
              <button type="button" className="reaction-button tone-mint" disabled={sentToday("treat")} onClick={() => void send("treat")}>
                <span className="reaction-emoji">❖</span>
                {sentToday("treat") ? "Enjoyed" : `Treat for ${player.petName}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
