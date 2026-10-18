/** Your own flat: one-tap workout logging, the present box, and decorating. */

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { FlatProgress } from "./FlatProgress";
import { PetPortrait } from "../art/Pet";
import { KitArt } from "../art/brownstone/KitArt";
import { ItemThumb } from "../art/ItemArt";
import type { Lighting } from "../art/lighting";
import type { BoxState, EditingState } from "../art/RoomScene";
import { RoomScene } from "../art/RoomScene";
import { SurfaceThumb } from "../art/Surfaces";
import { CATALOG, itemById, surfaceById } from "../game/catalog";
import type { PetMood } from "../game/progression";
import { addDays, weekStart } from "../game/dates";
import { hasLoggedOn, presentsWaiting, nextPresent, workoutsInWeekOf } from "../game/progression";
import type { Slot } from "../game/room";
import { DEFAULT_FLOORING, DEFAULT_WALLPAPER, itemScale, placeItem, removeItem, slotById, roomSlots, storedItemIds } from "../game/room";
import type { ItemDef, Layout, Player, WorkoutType } from "../game/types";
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
  onBack: () => void;
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

function slotCenterY(slot: Slot, item: ItemDef): number {
  const height = Math.min(item.h * itemScale(item, slot), 170);
  if (slot.anchor === "top") return slot.y + height / 2;
  if (slot.anchor === "bottom") return slot.y - height / 2;
  return slot.y;
}

/** This week at a glance: one dot per day, lit on workout days, today ringed. */
function WeekDots({ player, day, large = false }: { player: Player; day: string; large?: boolean }) {
  const monday = weekStart(day);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const count = days.filter((weekDay) => hasLoggedOn(player, weekDay)).length;
  return (
    <div className={`week-dots${large ? " is-large" : ""}`} role="img" aria-label={`${count} workout${count === 1 ? "" : "s"} this week`}>
      {days.map((weekDay, index) => (
        <span
          key={weekDay}
          className={`week-dot${hasLoggedOn(player, weekDay) ? " is-done" : ""}${weekDay === day ? " is-today" : ""}${weekDay > day ? " is-future" : ""}`}
        >
          <span className="week-dot-mark" aria-hidden="true">
            {hasLoggedOn(player, weekDay) ? "✓" : ""}
          </span>
          <small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small>
        </span>
      ))}
    </div>
  );
}

export function Home(props: HomeProps) {
  const { me, day, lighting, mood, reducedMotion, celebrateKey, treatKey, placeRequest, onPlaceRequestHandled } = props;
  const { onLog, onSetType, onSaveLayout, onOpenPresent, onOpenSettings, onBack } = props;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const save = async (layout: Layout) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveLayout(layout);
    } catch {
      setSaveError("That change didn’t save. Your things are safe — try again when you’re connected.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
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

  const slots = roomSlots(me.id);
  const loggedToday = hasLoggedOn(me, day);
  const todaysWorkout = me.workouts.find((workout) => workout.day === day);
  const waiting = presentsWaiting(me);
  const stored = storedItemIds(CATALOG, me);
  const box: BoxState = waiting > 0 ? "present" : null;

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
    if (savingRef.current) return;
    const existingSlot = Object.entries(me.layout.slots).find(([, placement]) => placement.itemId === itemId);
    const placement = existingSlot ? existingSlot[1] : { itemId, palette: 0, flip: slotById(slotId).x > 200 };
    const result = placeItem(CATALOG, me.layout, slotId, placement);
    setMenuSlotId(null);
    playRustle();
    flutter(itemId);
    setHeldItemId(null);
    await save(result.layout);
  };

  const storeAway = async (itemId: string) => {
    if (savingRef.current) return;
    playPop();
    setMenuSlotId(null);
    await save(removeItem(me.layout, itemId));
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
    for (const slot of slots) {
      if (!item.zones.includes(slot.zone) || item.size > slot.capacity) continue;
      const distance = Math.hypot(point.x - slot.x, point.y - slotCenterY(slot, item));
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
    const onCancel = () => {
      if (pendingRef.current?.longPress) clearTimeout(pendingRef.current.longPress);
      pendingRef.current = null;
      hoverRef.current = null;
      setDrag(null);
      setHoverSlotId(null);
      setHeldItemId(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
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
    const slot = slots.find((slot) => slot.id === menuSlotId)!;
    const matrix = svgRef.current.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(slot.x, slotCenterY(slot, itemById(placement.itemId))).matrixTransform(matrix);
    const wrap = roomWrapRef.current.getBoundingClientRect();
    const paletteCount = itemById(placement.itemId).palettes.length;
    const menuWidth = Math.max(150, paletteCount * 28 + (paletteCount - 1) * 7 + 26);
    const inset = menuWidth / 2 + 8;
    return {
      left: Math.max(inset, Math.min(wrap.width - inset, point.x - wrap.left)),
      top: Math.max(132, point.y - wrap.top),
    };
  })();

  const updatePlacement = async (slotId: string, change: { palette?: number; flip?: boolean }) => {
    const placement = me.layout.slots[slotId];
    playPop();
    flutter(placement.itemId);
    await save({ ...me.layout, slots: { ...me.layout.slots, [slotId]: { ...placement, ...change } } });
  };

  const applySurface = async (surfaceId: string) => {
    const surface = surfaceById(surfaceId);
    playRustle();
    await save(surface.kind === "wallpaper" ? { ...me.layout, wallpaper: surfaceId } : { ...me.layout, flooring: surfaceId });
  };

  const ownedSurfaces = [DEFAULT_WALLPAPER, DEFAULT_FLOORING, ...me.unlocks.map((unlock) => unlock.id)]
    .filter((id) => CATALOG.surfaces.some((surface) => surface.id === id))
    .map((id) => surfaceById(id));

  const editingState: EditingState | null = editing ? { heldItemId, hoverSlotId, hiddenItemId: drag ? drag.itemId : null } : null;

  const menuPlacement = menuSlotId ? me.layout.slots[menuSlotId] : undefined;
  const menuItem = menuPlacement ? itemById(menuPlacement.itemId) : null;

  return (
    <main className={`home${editing ? " is-editing" : ""}${saving ? " is-saving" : ""}`} aria-busy={saving}>
      <div className="home-room">
        <div className="home-topbar">
          <button type="button" className="back-button" onClick={onBack} aria-label="Back to the building">
            ←
          </button>
          <h1 className="visit-name">My flat</h1>
          <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Settings">
            ⚙︎
          </button>
        </div>

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
            onItemActivate={
              editing
                ? (slotId) => {
                    setMenuSlotId(slotId);
                    setHeldItemId(null);
                  }
                : undefined
            }
            onItemPointerDown={editing ? startItemDrag : undefined}
            onBoxTap={onOpenPresent}
          />
          {menuSlotId && menuItem && menuPlacement && menuPosition && (
            <div className="item-menu card" style={{ left: menuPosition.left, top: menuPosition.top }}>
              <p className="item-menu-name">{menuItem.name}</p>
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
                <button
                  type="button"
                  className="icon-chip"
                  onClick={() => {
                    setHeldItemId(menuPlacement.itemId);
                    setMenuSlotId(null);
                  }}
                >
                  Move
                </button>
                <button
                  type="button"
                  className="icon-chip"
                  onClick={() => void updatePlacement(menuSlotId, { flip: !menuPlacement.flip })}
                  aria-label="Flip"
                >
                  ⇄
                </button>
                <button type="button" className="icon-chip" onClick={() => void storeAway(menuPlacement.itemId)} aria-label="Put away">
                  ⤓
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <aside className="home-panel" aria-label="Your flat and activity">
        {!editing && <FlatProgress placed={Object.keys(me.layout.slots).length} />}
        {editing && <h2 className="decorating-title">Make it yours</h2>}
        {editing && heldItemId && (
          <div className="placement-guidance">
            <span>
              Find a spot for your <strong>{itemById(heldItemId).name.toLowerCase()}</strong>.
              {itemById(heldItemId).light ? " Light up a corner." : ""}
            </span>
            <button className="chip" onClick={() => setHeldItemId(null)}>
              Cancel
            </button>
          </div>
        )}
        {editing && !heldItemId && <p className="room-hint">Choose a thing, then tap a spot in your room.</p>}

        {saveError && (
          <p className="save-status" role="alert">
            {saveError}
          </p>
        )}
        {saving && (
          <p className="save-status" role="status">
            Making it feel like home…
          </p>
        )}
        {editing ? (
          <section className="drawer card">
            <div className="drawer-header">
              <div className="drawer-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={drawerTab === "items"}
                  className={drawerTab === "items" ? "is-active" : ""}
                  onClick={() => setDrawerTab("items")}
                >
                  Things {stored.length > 0 && <span className="badge">{stored.length}</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={drawerTab === "surfaces"}
                  className={drawerTab === "surfaces" ? "is-active" : ""}
                  onClick={() => setDrawerTab("surfaces")}
                >
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
                Done
              </button>
            </div>
            {drawerTab === "items" && (
              <div className="drawer-row">
                {stored.length === 0 && (
                  <p className="drawer-empty">
                    {me.unlocks.length
                      ? "Everything you own is in your flat. Tap a placed item to move it or put it away."
                      : "Your shelf is empty. Log a workout and unpack a present to find something for your flat."}
                  </p>
                )}
                {stored.map((itemId) => {
                  const item = itemById(itemId);
                  return (
                    <button
                      key={itemId}
                      type="button"
                      className={`drawer-card${heldItemId === itemId ? " is-held" : ""}`}
                      onPointerDown={(event) => startDrawerDrag(event, itemId)}
                      onClick={(event) => {
                        if (event.detail === 0) setHeldItemId(itemId);
                      }}
                      aria-label={item.name}
                    >
                      <ItemThumb item={item} size={66} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {drawerTab === "surfaces" && (
              <div className="drawer-row">
                {ownedSurfaces.map((surface) => {
                  const current = me.layout.wallpaper === surface.id || me.layout.flooring === surface.id;
                  return (
                    <button
                      key={surface.id}
                      type="button"
                      className={`drawer-card${current ? " is-held" : ""}`}
                      onClick={() => void applySurface(surface.id)}
                      aria-label={surface.name}
                    >
                      <SurfaceThumb surface={surface} size={66} />
                      <span>{surface.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="log-panel">
            <div className="weekly-overview">
              <div className="companion-status">
                <PetPortrait kind={me.petKind} action={mood === "sleepy" ? "sleep" : "idle"} size={76} />
                <div>
                  <strong>{me.petName}</strong>
                  <span>{mood === "perky" ? "Perky" : mood === "sleepy" ? "Sleepy" : "Content"}</span>
                </div>
              </div>
              <div className="weekly-total">
                <strong>{workoutsInWeekOf(me, day)}</strong>
                <span>this week</span>
              </div>
            </div>
            <WeekDots player={me} day={day} large />
            {loggedToday ? (
              <>
                <div className="activity-complete">
                  <span aria-hidden="true">✓</span> Logged today
                </div>
                {todaysWorkout && !todaysWorkout.type && typeDismissedDay !== day && (
                  <div className="type-row">
                    {WORKOUT_TYPES.map((option) => (
                      <button key={option.type} type="button" className="type-chip" onClick={() => void onSetType(option.type)}>
                        {option.label}
                      </button>
                    ))}
                    <button type="button" className="type-chip type-dismiss" onClick={() => setTypeDismissedDay(day)} aria-label="Dismiss">
                      ✕
                    </button>
                  </div>
                )}
              </>
            ) : (
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
            )}

            {waiting > 0 && (
              <button className="parcel-button" onClick={onOpenPresent}>
                <svg viewBox="0 0 100 86" width="100" height="86" aria-hidden="true">
                  <KitArt id={`present-${nextPresent(me)?.tier ?? 1}`} width={100} height={86} />
                </svg>
                <span>
                  <strong>Unpack a present</strong>
                  <small>{waiting > 1 ? `${waiting} waiting for you` : "Choose something new"}</small>
                </span>
                <span className="parcel-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            )}
            <div className="home-actions">
              <button type="button" className="chip chip-large decorate-button" onClick={() => setEditing(true)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <path d="M4 11V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M3 10h3v5h12v-5h3v9H3Zm3 9v2m12-2v2" />
                </svg>
                Decorate {stored.length > 0 && <span className="badge">{stored.length}</span>}
              </button>
            </div>
          </section>
        )}
      </aside>

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <ItemThumb item={itemById(drag.itemId)} size={84} />
        </div>
      )}
    </main>
  );
}
