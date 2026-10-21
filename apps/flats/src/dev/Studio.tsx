/** Development-only visual review. Never included in production routing. */
import { useState } from "react";
import { Home } from "../ui/Home";
import { RoomScene } from "../art/RoomScene";
import { ItemThumb } from "../art/ItemArt";
import { PetPortrait } from "../art/Pet";
import { CATALOG } from "../game/catalog";
import { buildDemoNeighbours } from "../backend/demo";
import { lightingForHour } from "../art/lighting";
import { today, addDays } from "../game/dates";
import type { Player, PetKind } from "../game/types";
import { emptyLayout } from "../game/room";
export function Studio() {
  const day = today();
  const [player, setPlayer] = useState<Player>(() => ({
    ...buildDemoNeighbours(day)[0],
    unlocks: [...CATALOG.items, ...CATALOG.surfaces].map((e) => ({ id: e.id, atWorkout: 0, day })),
  }));
  const [quiet, setQuiet] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [step, setStep] = useState(20);
  const displayed = {
    ...player,
    createdDay: addDays(day, -30),
    workouts: Array.from({ length: player.unlocks.length }, (_, i) => ({ day: addDays(day, -i - (quiet ? 30 : 0)) })),
    layout: { ...player.layout, slots: Object.fromEntries(Object.entries(player.layout.slots).slice(0, step)) },
  };
  return (
    <>
      <nav className="studio-controls">
        <strong>Brownstone review</strong>
        {buildDemoNeighbours(day).map((p) => (
          <button key={p.id} onClick={() => setPlayer({ ...p, unlocks: player.unlocks })}>
            {p.name}
          </button>
        ))}
        <button onClick={() => setPlayer({ ...player, id: "new-resident", workouts: [], layout: emptyLayout() })}>Day one</button>
        <button onClick={() => setGallery(!gallery)}>{gallery ? "Room" : "Catalogue"}</button>
        <label>
          <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} />
          Quiet month
        </label>
        <label>
          Things visible
          <input type="range" min="0" max="20" value={step} onChange={(e) => setStep(Number(e.target.value))} />
        </label>
      </nav>
      {gallery ? (
        <main className="studio-gallery">
          {CATALOG.items.map((item) => (
            <article key={item.id}>
              <h2>{item.name}</h2>
              <div>
                {item.palettes.map((p, i) => (
                  <figure key={p.name}>
                    <ItemThumb item={item} paletteIndex={i} size={120} />
                    <figcaption>{p.name}</figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
          {(["cat", "dog", "bunny", "frog", "duck"] as PetKind[]).map((kind) => (
            <article key={kind}>
              <h2>{kind}</h2>
              <PetPortrait kind={kind} />
              <PetPortrait kind={kind} action="sleep" />
            </article>
          ))}
        </main>
      ) : (
        <div className="studio-room">
          <Home
            me={displayed}
            day={day}
            lighting={lightingForHour(21)}
            mood={quiet ? "sleepy" : "perky"}
            reducedMotion={false}
            celebrateKey={0}
            treatKey={0}
            placeRequest={null}
            onPlaceRequestHandled={() => {}}
            onLog={async (workoutDay) => setPlayer({ ...player, workouts: [...player.workouts, { day: workoutDay }] })}
            onSetType={async () => {}}
            onSaveLayout={async (layout) => setPlayer({ ...player, layout })}
            onOpenPresent={() => {}}
            onOpenSettings={() => {}}
            onBack={() => {}}
          />
        </div>
      )}
      <div style={{ display: "none" }}>
        <RoomScene player={displayed} variant="mini" lighting={lightingForHour(21)} mood="perky" reducedMotion />
      </div>
    </>
  );
}
