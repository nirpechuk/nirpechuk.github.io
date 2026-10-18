/** Development-only growth and camera review; never creates real residents. */
import { useMemo, useState } from "react";
import { Building } from "../ui/Building";
import { Visit } from "../ui/Visit";
import { buildDemoNeighbours } from "../backend/demo";
import { today } from "../game/dates";
import { lightingForHour } from "../art/lighting";

export function StreetStudio() {
  const [count, setCount] = useState(7);
  const [quiet, setQuiet] = useState(false);
  const [controls, setControls] = useState(true);
  const [visit, setVisit] = useState<{ id: string; rect: DOMRect } | null>(null);
  const day = today();
  const players = useMemo(() => {
    const fixtures = buildDemoNeighbours(day);
    const names = ["Nir", "Michael", "Twiggy", "Maya", "Theo", "Priya", "Juniper"];
    return Array.from({ length: count }, (_, i) => ({
      ...fixtures[i % fixtures.length],
      id: `street-preview-${i}`,
      name: names[i] ?? `Neighbour ${i + 1}`,
      demo: false,
    }));
  }, [count, day]);
  const player = players.find((p) => p.id === visit?.id);
  const lighting = lightingForHour(21);
  return (
    <div className={`app tab-building${quiet ? " reduced-motion" : ""}`}>
      <div className="building-camera" inert={!!visit}>
        <Building
          snapshot={{ group: { code: "PREV01", name: "Nir's building", memberIds: players.map((p) => p.id) }, players, reactions: [] }}
          meId={players[0].id}
          day={day}
          lighting={lighting}
          reducedMotion={quiet}
          openPlayerId={visit?.id ?? null}
          onOpenFlat={(id, rect) => setVisit({ id, rect })}
          onInvite={() => setCount((n) => n + 1)}
        />
      </div>
      {visit && player && (
        <Visit
          player={player}
          isMe={false}
          meId={players[0].id}
          day={day}
          lighting={lighting}
          reducedMotion={quiet}
          reactions={[]}
          fromRect={visit.rect}
          onReact={async () => true}
          onClose={() => setVisit(null)}
        />
      )}
      {controls && (
        <div
          style={{
            position: "fixed",
            left: 12,
            top: 94,
            zIndex: 100,
            display: "flex",
            gap: 5,
            flexWrap: "wrap",
            maxWidth: 170,
            padding: 8,
            background: "#120d0ae8",
            borderRadius: 10,
          }}
        >
          {[3, 6, 7, 12, 30].map((n) => (
            <button className="chip" key={n} onClick={() => setCount(n)}>
              {n} residents
            </button>
          ))}
          <label>
            <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Reduced motion
          </label>
          <button className="chip" onClick={() => setControls(false)}>
            Hide preview controls
          </button>
        </div>
      )}
    </div>
  );
}
