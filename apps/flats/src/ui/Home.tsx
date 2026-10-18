/** Your own flat: one-tap workout logging, the present box, and decorating. */

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { ItemThumb } from "../art/ItemArt";
import type { Lighting } from "../art/lighting";
import type { BoxState, EditingState } from "../art/RoomScene";
import { RoomScene } from "../art/RoomScene";
import { SurfaceThumb } from "../art/Surfaces";
import { CATALOG, itemById, surfaceById } from "../game/catalog";
import type { PetMood } from "../game/progression";
import { cosinessTitle, hasLoggedOn, presentsWaiting, weekStreak, workoutsInWeekOf } from "../game/progression";
import type { Slot } from "../game/room";
import { DEFAULT_FLOORING, DEFAULT_WALLPAPER, placeItem, removeItem, slotById, SLOTS, storedItemIds } from "../game/room";
import type { Layout, Player, WorkoutType } from "../game/types";
import { Hint, Tag } from "./common";
import { playPop, playRustle } from "./sound";

export const WORKOUT_TYPES: { type: WorkoutType; label: string }[] = [
  { type: "run", label: "Run" },
  { type: "walk", label: "Walk" },
  { type: "gym", label: "Gym" },
  { type: "yoga", label: "Yoga" },
  { type: "swim", label: "Swim" },
  { type: "dance", label: "Dance" },
  { type: "other", label: "Something else" },
];

const LONG_PRESS_MS = 550;
const DRAG_THRESHOLD_PX = 8;
const SNAP_DISTANCE = 85;

interface HomeProps {
  me: Player;
  day: string;
  lighting: Lighting;
  mood: PetMood;
  reducedMotion: boolean;
  celebrateKey: number;
  treatKey: number;
  placeRequest: string | null;
  onPlaceRequestHandled: () => void;
  onLog: () => Promise<void>;
  onSetType: (type: WorkoutType) => Promise<void>;
  onSaveLayout: (layout: Layout) => Promise<void>;
  onOpenPresent: () => void;
  onOpenSettings: () => void;
  toast: (text: string, icon?: string) => void;
}

interface PendingDrag {
  itemId: string;
  fromSlot: string | null;
  startX: number;
  startY: number;
  dragging: boolean;
  longPress?: ReturnType<typeof setTimeout>;
}

interface DragView {
  itemId: string;
  x: number;
  y: number;
}

function moodLine(mood: PetMood, petName: string): string {
  if (mood === "perky") return `${petName} is wide awake and very pleased with you.`;
  if (mood === "sleepy") return `${petName} has been dozing by the radiator. They'll stir when you're back.`;
  return `${petName} is curled up somewhere warm.`;
}

function slotCenterY(slot: Slot, itemHeight: number): number {
  const height = itemHeight * slot.scale;
  if (slot.anchor === "top") return slot.y + height / 2;
  if (slot.anchor === "bottom") return slot.y - height / 2;
  return slot.y;
}

export function Home(props: HomeProps) {
  const { me, day, lighting, mood, reducedMotion, celebrateKey, treatKey, placeRequest, onPlaceRequestHandled } = props;
  const { onLog, onSetType, onSaveLayout, onOpenPresent, onOpenSettings, toast } = props;
  const [editing, setEditing] = useState(false);
  const [heldItemId, setHeldItemId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null);
  const [menuSlotId, setMenuSlotId] = useState<string | null>(null);
  const [freshItemId, setFreshItemId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"items" | "surfaces">("items");
  const [typeDismissedDay, setTypeDismissedDay] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const roomWrapRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const hoverRef = useRef<string | null>(null);

  const loggedToday = hasLoggedOn(me, day);
  const todaysWorkout = me.workouts.find((workout) => workout.day === day);
  const waiting = presentsWaiting(me);
  const stored = storedItemIds(CATALOG, me);
  const placedCount = Object.keys(me.layout.slots).length;
  const weekCount = workoutsInWeekOf(me, day);
  const streak = weekStreak(me, day);
  const box: BoxState = waiting > 0 ? "present" : me.workouts.length === 0 ? "teaser" : null;

  useEffect(() => {
    if (!placeRequest) return;
    if (CATALOG.items.some((item) => item.id === placeRequest)) {
      setEditing(true);
      setDrawerTab("items");
      setHeldItemId(placeRequest);
    } else {
      setEditing(true);
      setDrawerTab("surfaces");
    }
    onPlaceRequestHandled();
  }, [placeRequest, onPlaceRequestHandled]);

  const flutter = (itemId: string) => {
    setFreshItemId(itemId);
    window.setTimeout(() => setFreshItemId((current) => (current === itemId ? null : current)), 1100);
  };

  const place = async (itemId: string, slotId: string) => {
    const existingSlot = Object.entries(me.layout.slots).find(([, placement]) => placement.itemId === itemId);
    const placement = existingSlot ? existingSlot[1] : { itemId, palette: 0, flip: slotById(slotId).x > 200 };
    const result = placeItem(CATALOG, me.layout, slotId, placement);
    playRustle();
    flutter(itemId);
    setHeldItemId(null);
    await onSaveLayout(result.layout);
    if (result.displacedItemId) toast(`${itemById(result.displacedItemId).name} went back into storage`, "·");
  };

  const storeAway = async (itemId: string) => {
    playPop();
    setMenuSlotId(null);
    await onSaveLayout(removeItem(me.layout, itemId));
    toast(`${itemById(itemId).name} tucked away`, "·");
  };

  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  };

  const nearestSlot = (itemId: string, clientX: number, clientY: number): string | null => {
    const point = svgPoint(clientX, clientY);
    if (!point) return null;
    const item = itemById(itemId);
    let best: { id: string; distance: number } | null = null;
    for (const slot of SLOTS) {
      if (!item.zones.includes(slot.zone) || item.size > slot.capacity) continue;
      const distance = Math.hypot(point.x - slot.x, point.y - slotCenterY(slot, Math.min(item.h, 130)));
      if (distance < SNAP_DISTANCE && (!best || distance < best.distance)) best = { id: slot.id, distance };
    }
    return best?.id ?? null;
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;
      const deltaX = event.clientX - pending.startX;
      const deltaY = event.clientY - pending.startY;
      if (!pending.dragging) {
        if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
        // From the drawer, a mostly sideways swipe is a scroll, not a drag.
        if (!pending.fromSlot && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          pendingRef.current = null;
          return;
        }
        if (pending.longPress) clearTimeout(pending.longPress);
        pending.dragging = true;
        setMenuSlotId(null);
        setHeldItemId(pending.itemId);
      }
      event.preventDefault();
      const slotId = nearestSlot(pending.itemId, event.clientX, event.clientY);
      hoverRef.current = slotId;
      setHoverSlotId(slotId);
      setDrag({ itemId: pending.itemId, x: event.clientX, y: event.clientY });
    };
    const onUp = (event: PointerEvent) => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) return;
      if (pending.longPress) clearTimeout(pending.longPress);
      if (pending.dragging) {
        const slotId = hoverRef.current;
        setDrag(null);
        setHoverSlotId(null);
        hoverRef.current = null;
        const roomBottom = roomWrapRef.current?.getBoundingClientRect().bottom ?? Infinity;
        if (slotId) void place(pending.itemId, slotId);
        else if (pending.fromSlot && event.clientY > roomBottom) void storeAway(pending.itemId);
        else setHeldItemId(null);
        return;
      }
      if (pending.fromSlot) {
        setMenuSlotId((current) => (current === pending.fromSlot ? null : pending.fromSlot));
        setHeldItemId(null);
      } else {
        setHeldItemId((current) => (current === pending.itemId ? null : pending.itemId));
        playPop();
      }
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  const startDrawerDrag = (event: ReactPointerEvent, itemId: string) => {
    pendingRef.current = { itemId, fromSlot: null, startX: event.clientX, startY: event.clientY, dragging: false };
  };

  const startItemDrag = (event: ReactPointerEvent<SVGGElement>, slotId: string) => {
    if (!editing) return;
    event.preventDefault();
    const placement = me.layout.slots[slotId];
    const pending: PendingDrag = {
      itemId: placement.itemId,
      fromSlot: slotId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    pending.longPress = setTimeout(() => {
      if (pendingRef.current === pending && !pending.dragging) {
        pendingRef.current = null;
        void storeAway(placement.itemId);
      }
    }, LONG_PRESS_MS);
    pendingRef.current = pending;
  };

  const menuPosition = (() => {
    if (!menuSlotId || !svgRef.current || !roomWrapRef.current) return null;
    const placement = me.layout.slots[menuSlotId];
    if (!placement) return null;
    const slot = slotById(menuSlotId);
    const matrix = svgRef.current.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(slot.x, slotCenterY(slot, Math.min(itemById(placement.itemId).h, 130))).matrixTransform(matrix);
    const wrap = roomWrapRef.current.getBoundingClientRect();
    return { left: point.x - wrap.left, top: point.y - wrap.top };
  })();

  const updatePlacement = async (slotId: string, change: { palette?: number; flip?: boolean }) => {
    const placement = me.layout.slots[slotId];
    playPop();
    flutter(placement.itemId);
    await onSaveLayout({ ...me.layout, slots: { ...me.layout.slots, [slotId]: { ...placement, ...change } } });
  };

  const applySurface = async (surfaceId: string) => {
    const surface = surfaceById(surfaceId);
    playRustle();
    await onSaveLayout(
      surface.kind === "wallpaper" ? { ...me.layout, wallpaper: surfaceId } : { ...me.layout, flooring: surfaceId },
    );
  };

  const ownedSurfaces = [DEFAULT_WALLPAPER, DEFAULT_FLOORING, ...me.unlocks.map((unlock) => unlock.id)]
    .filter((id) => CATALOG.surfaces.some((surface) => surface.id === id))
    .map((id) => surfaceById(id));

  const editingState: EditingState | null = editing
    ? { heldItemId, hoverSlotId, hiddenItemId: drag ? drag.itemId : null }
    : null;

  const menuPlacement = menuSlotId ? me.layout.slots[menuSlotId] : undefined;
  const menuItem = menuPlacement ? itemById(menuPlacement.itemId) : null;

  return (
    <main className={`home${editing ? " is-editing" : ""}`}>
      <header className="flat-header">
        <div>
          <h1 className="flat-title">{me.name}'s flat</h1>
          <p className="flat-subtitle">{cosinessTitle(placedCount)}</p>
        </div>
        <div className="flat-tags">
          <Tag tone="butter">{weekCount} this week</Tag>
          {streak > 1 && <Tag tone="blush">★ {streak}-week streak</Tag>}
        </div>
        <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Settings">
          ⚙︎
        </button>
      </header>

      <div className="room-wrap" ref={roomWrapRef}>
        <RoomScene
          player={me}
          variant="home"
          lighting={lighting}
          mood={mood}
          reducedMotion={reducedMotion}
          editing={editingState}
          freshItemId={freshItemId}
          box={editing ? null : box}
          celebrateKey={celebrateKey}
          treatKey={treatKey}
          svgRef={svgRef}
          onSlotTap={(slotId) => heldItemId && void place(heldItemId, slotId)}
          onItemPointerDown={editing ? startItemDrag : undefined}
          onBoxTap={() => (box === "present" ? onOpenPresent() : toast("Log a workout to open your first box.", "·"))}
        />
        {menuSlotId && menuItem && menuPlacement && menuPosition && (
          <div className="item-menu card" style={{ left: menuPosition.left, top: menuPosition.top }}>
            <strong>{menuItem.name}</strong>
            <div className="item-menu-swatches">
              {menuItem.palettes.map((palette, index) => (
                <button
                  key={palette.name}
                  type="button"
                  className={`swatch${index === menuPlacement.palette ? " is-current" : ""}`}
                  style={{ background: `linear-gradient(135deg, ${palette.p} 55%, ${palette.s} 55%)` }}
                  onClick={() => void updatePlacement(menuSlotId, { palette: index })}
                  aria-label={`${palette.name} colour`}
                />
              ))}
            </div>
            <div className="item-menu-actions">
              <button type="button" className="chip" onClick={() => void updatePlacement(menuSlotId, { flip: !menuPlacement.flip })}>
                ↔ Flip
              </button>
              <button type="button" className="chip" onClick={() => void storeAway(menuPlacement.itemId)}>
                Store
              </button>
            </div>
          </div>
        )}
      </div>

      {!editing && box === "present" && <Hint hintKey="box">A present. Tap the box in your flat to open it.</Hint>}
      {!editing && <p className="mood-line">{moodLine(mood, me.petName)}</p>}

      {editing ? (
        <section className="drawer card">
          <div className="drawer-header">
            <div className="drawer-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={drawerTab === "items"} className={drawerTab === "items" ? "is-active" : ""} onClick={() => setDrawerTab("items")}>
                Things {stored.length > 0 && <span className="badge">{stored.length}</span>}
              </button>
              <button type="button" role="tab" aria-selected={drawerTab === "surfaces"} className={drawerTab === "surfaces" ? "is-active" : ""} onClick={() => setDrawerTab("surfaces")}>
                Walls & floors
              </button>
            </div>
            <button
              type="button"
              className="done-button"
              onClick={() => {
                setEditing(false);
                setHeldItemId(null);
                setMenuSlotId(null);
              }}
            >
              Done ✓
            </button>
          </div>
          {drawerTab === "items" && (
            <>
              <Hint hintKey="drag" show={stored.length > 0}>
                Drag a thing into a glowing spot, or tap it and then tap a spot.
              </Hint>
              <Hint hintKey="tap-item" show={stored.length === 0 && placedCount > 0}>
                Tap a placed thing to flip or recolour it. Hold it to tuck it away.
              </Hint>
              {stored.length === 0 ? (
                <p className="drawer-empty">
                  {placedCount > 0 ? "Everything's out on display! Tap a placed thing to restyle it." : "Nothing here yet. Log a workout to earn a present!"}
                </p>
              ) : (
                <div className="drawer-row">
                  {stored.map((itemId) => {
                    const item = itemById(itemId);
                    return (
                      <button
                        key={itemId}
                        type="button"
                        className={`drawer-card${heldItemId === itemId ? " is-held" : ""}`}
                        onPointerDown={(event) => startDrawerDrag(event, itemId)}
                      >
                        <ItemThumb item={item} size={62} />
                        <span>{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {drawerTab === "surfaces" && (
            <div className="drawer-row">
              {ownedSurfaces.map((surface) => {
                const current = me.layout.wallpaper === surface.id || me.layout.flooring === surface.id;
                return (
                  <button key={surface.id} type="button" className={`drawer-card${current ? " is-held" : ""}`} onClick={() => void applySurface(surface.id)}>
                    <SurfaceThumb surface={surface} size={62} />
                    <span>{surface.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="log-panel">
          {loggedToday ? (
            <div className="logged card">
              <p className="logged-title">You moved today.</p>
              {todaysWorkout && !todaysWorkout.type && typeDismissedDay !== day ? (
                <>
                  <p className="logged-sub">What was it? Entirely optional.</p>
                  <div className="type-row">
                    {WORKOUT_TYPES.map((option) => (
                      <button key={option.type} type="button" className="type-chip" onClick={() => void onSetType(option.type)}>
                        {option.label}
                      </button>
                    ))}
                    <button type="button" className="text-button" onClick={() => setTypeDismissedDay(day)}>
                      skip
                    </button>
                  </div>
                </>
              ) : (
                <p className="logged-sub">
                  {todaysWorkout?.type ? `${WORKOUT_TYPES.find((option) => option.type === todaysWorkout.type)?.label}. ` : ""}
                  Rest up. Another present tomorrow.
                </p>
              )}
            </div>
          ) : (
            <div className="log-button-wrap">
              <Hint hintKey="log" show={me.workouts.length === 0} placement="above">
                Worked out today? One tap opens your first box.
              </Hint>
              <button
                type="button"
                className="log-button"
                disabled={logging}
                onClick={async () => {
                  setLogging(true);
                  try {
                    await onLog();
                  } finally {
                    setLogging(false);
                  }
                }}
              >
                <span className="log-button-face">I worked out today</span>
              </button>
            </div>
          )}
          <div className="home-actions">
            <button type="button" className="chip chip-large" onClick={() => setEditing(true)}>
              Decorate {stored.length > 0 && <span className="badge">{stored.length}</span>}
            </button>
            {waiting > 0 && (
              <button type="button" className="chip chip-large chip-present" onClick={onOpenPresent}>
                {waiting} present{waiting > 1 ? "s" : ""} waiting
              </button>
            )}
          </div>
          <Hint hintKey="decorate" show={stored.length > 0 && waiting === 0}>
            Your new things are waiting in Decorate.
          </Hint>
        </section>
      )}

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <ItemThumb item={itemById(drag.itemId)} size={84} />
        </div>
      )}
    </main>
  );
}
