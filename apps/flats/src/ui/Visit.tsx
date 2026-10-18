/** Visiting a flat: move the camera toward its window, then reveal the room controls. */

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  ownFlat?: (onBack: () => void) => ReactNode;
}

/** Move the entire street so the selected window lands exactly behind the full room. */
function cameraTransform(source: DOMRect, target: DOMRect, world: DOMRect): string {
  const scale = target.width / source.width;
  const x = target.left - world.left - (source.left - world.left) * scale;
  const y = target.top + (target.height - source.height * scale) / 2 - world.top - (source.top - world.top) * scale;
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

function windowRectFor(playerId: string): DOMRect | null {
  const room = document.querySelector(`.flat-window[data-player="${playerId}"] .window-glass .room-scene`);
  return room ? room.getBoundingClientRect() : null;
}

export function Visit(props: VisitProps) {
  const { player, isMe, meId, day, lighting, reducedMotion, reactions, fromRect, onReact, onClose, ownFlat } = props;
  const contentRef = useRef<HTMLDivElement>(null);
  const roomElement = () => contentRef.current?.querySelector<HTMLElement>(".room-wrap, .visit-room");
  const backdropRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Animation | null>(null);
  const motionRef = useRef<Animation[]>([]);
  const enteringRef = useRef(false);
  const closeAfterEntryRef = useRef(false);
  const closeRef = useRef<() => void>(() => {});
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [treatKey, setTreatKey] = useState(0);
  const [flying, setFlying] = useState<{ id: number; emoji: string; kind: ReactionKind; x: number; y: number } | null>(null);
  const flyingRef = useRef<HTMLSpanElement>(null);
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const room = roomElement();
    const world = document.querySelector<HTMLElement>(".building-camera");
    if (!room || !world || !fromRect || reducedMotion) return;
    enteringRef.current = true;
    const destination = cameraTransform(fromRect, room.getBoundingClientRect(), world.getBoundingClientRect());
    const camera = world.animate([{ transform: "none" }, { transform: destination }], {
      duration: ZOOM_IN_MS,
      easing: ZOOM_IN_EASING,
      fill: "both",
    });
    cameraRef.current = camera;
    // The room stays in the window while the *whole street* approaches. Only crossfade
    // to the interactive scene once the camera has almost reached its resting place.
    const reveal = [{ opacity: 0 }, { opacity: 0, offset: 0.72 }, { opacity: 1 }];
    const timing = { duration: ZOOM_IN_MS, easing: "linear", fill: "both" as const };
    const animations = [camera];
    if (contentRef.current) animations.push(contentRef.current.animate(reveal, timing));
    if (backdropRef.current) animations.push(backdropRef.current.animate(reveal, timing));
    motionRef.current = animations;
    camera.onfinish = () => {
      enteringRef.current = false;
      if (closeAfterEntryRef.current) closeRef.current();
    };
    return () => {
      motionRef.current.forEach((animation) => animation.cancel());
      cameraRef.current = null;
      enteringRef.current = false;
    };
  }, [fromRect, reducedMotion]);

  const close = () => {
    if (closing) return;
    if (enteringRef.current) {
      closeAfterEntryRef.current = true;
      return;
    }
    const room = roomElement();
    const world = document.querySelector<HTMLElement>(".building-camera");
    if (!room || !world || reducedMotion) {
      onClose();
      return;
    }
    setClosing(true);
    // Measure the current street layout without the held camera transform. This also
    // handles resizing or rotating the screen while a flat is open.
    cameraRef.current?.cancel();
    const target = windowRectFor(player.id);
    if (!target) {
      onClose();
      return;
    }
    const destination = cameraTransform(target, room.getBoundingClientRect(), world.getBoundingClientRect());
    const camera = world.animate([{ transform: destination }, { transform: destination, offset: 0.18 }, { transform: "none" }], {
      duration: ZOOM_OUT_MS,
      easing: ZOOM_OUT_EASING,
      fill: "both",
    });
    cameraRef.current = camera;
    motionRef.current.push(camera);
    for (const element of [contentRef.current, backdropRef.current]) {
      if (element) motionRef.current.push(element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }));
    }
    camera.onfinish = onClose;
  };
  closeRef.current = close;

  useEffect(() => {
    const back = contentRef.current?.querySelector<HTMLButtonElement>(".back-button");
    back?.focus({ preventScroll: true });
    return () => {
      document.querySelector<HTMLButtonElement>(`.flat-window[data-player="${player.id}"]`)?.focus({ preventScroll: true });
    };
  }, [player.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".sheet-backdrop, .unpack-backdrop")) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sentToday = (kind: ReactionKind) =>
    reactions.some((reaction) => reaction.from === meId && reaction.to === player.id && reaction.kind === kind && reaction.day === day);

  const received = reactions.filter((reaction) => reaction.to === player.id);
  const stickers = received
    .filter((reaction) => reaction.kind === "sticker")
    .slice(-6)
    .map((reaction) => STICKERS[(reaction.variant ?? 0) % STICKERS.length]);

  // Follow the actual pet every frame, including while it walks or the viewport resizes.
  useLayoutEffect(() => {
    if (!flying) return;
    const finish = () => {
      playChime();
      if (flying.kind === "treat") setTreatKey((count) => count + 1);
      else setCelebrateKey((count) => count + 1);
      setFlying(null);
      sendingRef.current = false;
      setSending(false);
    };
    if (reducedMotion) {
      finish();
      return;
    }
    const start = performance.now();
    let frame = 0;
    const fly = (now: number) => {
      const target = contentRef.current?.querySelector(".pet-mouth")?.getBoundingClientRect();
      const element = flyingRef.current;
      if (!target || !element) {
        finish();
        return;
      }
      const progress = Math.min(1, (now - start) / 950);
      const ease = 1 - (1 - progress) ** 2;
      const x = flying.x + (target.left + target.width / 2 - flying.x) * ease;
      const y = flying.y + (target.top + target.height / 2 - flying.y) * ease - Math.sin(progress * Math.PI) * 65;
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${progress * 140}deg) scale(${1 - progress * 0.65})`;
      if (progress < 1) frame = requestAnimationFrame(fly);
      else finish();
    };
    frame = requestAnimationFrame(fly);
    return () => cancelAnimationFrame(frame);
  }, [flying, reducedMotion]);

  const send = async (kind: ReactionKind, button: HTMLButtonElement) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const rect = button.getBoundingClientRect();
    const variant = kind === "sticker" ? Math.floor(Math.random() * STICKERS.length) : undefined;
    try {
      const sent = await onReact(kind, variant);
      if (!sent) {
        sendingRef.current = false;
        setSending(false);
        return;
      }
      const emoji = kind === "heart" ? "♥" : kind === "sticker" ? STICKERS[variant ?? 0] : "🍬";
      setFlying({ id: Date.now(), emoji, kind, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      playPop();
    } catch (error) {
      sendingRef.current = false;
      setSending(false);
      throw error;
    }
  };

  return (
    <div className={`visit${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={`${player.name}'s flat`}>
      <div className="visit-backdrop" ref={backdropRef} />
      <div className="visit-content" ref={contentRef}>
        {ownFlat ? (
          ownFlat(close)
        ) : (
          <>
            <header className="visit-header">
              <button type="button" className="back-button" onClick={close} aria-label="Back to the building">
                ←
              </button>
              <h1 className="visit-name">{isMe ? "You" : player.name}</h1>
            </header>
            <div className="visit-room">
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
            </div>
            <div className="reaction-bar">
              <p className="room-hint">Send a heart, star, or pet treat</p>
              <div className="reaction-buttons">
                <button
                  type="button"
                  className="reaction-button tone-blush"
                  disabled={sending || sentToday("heart")}
                  onClick={(event) => void send("heart", event.currentTarget)}
                  aria-label="Leave a heart"
                >
                  ♥
                </button>
                <button
                  type="button"
                  className="reaction-button tone-butter"
                  disabled={sending || sentToday("sticker")}
                  onClick={(event) => void send("sticker", event.currentTarget)}
                  aria-label="Leave a star"
                >
                  ✦
                </button>
                <button
                  type="button"
                  className="reaction-button tone-mint"
                  disabled={sending || sentToday("treat")}
                  onClick={(event) => void send("treat", event.currentTarget)}
                  aria-label={`Give ${player.petName} a treat`}
                >
                  🍬
                </button>
              </div>
            </div>
            <p className="room-hint">Tap around. Say hello.</p>
          </>
        )}
      </div>
      {flying && !reducedMotion && (
        <span
          ref={flyingRef}
          className="flying-reaction"
          aria-hidden="true"
          style={{ transform: `translate(${flying.x}px, ${flying.y}px) translate(-50%, -50%)` }}
        >
          {flying.emoji}
        </span>
      )}
    </div>
  );
}
