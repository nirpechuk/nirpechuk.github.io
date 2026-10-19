import { useEffect, useState } from "react";
import { db } from "./backend";
import { displayDay, type Entry } from "./model";
function Photo({ entry }: { entry: Entry }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true,
      objectUrl = "";
    setUrl("");
    setError(false);
    db.storage
      .from("fitness-photos")
      .download(entry.data.path!)
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) {
          setError(true);
          return;
        }
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.data.path]);
  return url ? (
    <img src={url} alt={`${entry.data.view} progress photo, ${displayDay(entry.day)}`} draggable={false} />
  ) : (
    <div className="photo-loading">{error ? "Photo unavailable. Refresh to retry." : "Loading private photo…"}</div>
  );
}
export function Photos({
  entries,
  onAdd,
  onEdit,
  onArchive,
}: {
  entries: Entry[];
  onAdd: () => void;
  onEdit: (e: Entry) => void;
  onArchive: (e: Entry) => void;
}) {
  const [view, setView] = useState("all");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [split, setSplit] = useState(50);
  const [limit, setLimit] = useState(24);
  const photos = entries.filter((e) => e.kind === "photo" && (view === "all" || e.data.view === view)).sort((a, b) => b.day.localeCompare(a.day));
  const a = photos.find((e) => e.id === before),
    b = photos.find((e) => e.id === after);
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Progress photos</h2>
          <p className="muted">A private record, at your own pace.</p>
        </div>
        <button onClick={onAdd}>+ Add photo</button>
      </div>
      {!photos.length && view === "all" ? (
        <div className="photo-empty">
          <div className="photo-outline" aria-hidden="true">
            <div />
            <div />
          </div>
          <h3>Your first frame.</h3>
          <p>
            Start with a front, side, or back photo.
            <br />
            Future you will have a point of comparison.
          </p>
          <button onClick={onAdd}>Upload a progress photo</button>
          <p className="hint">Only accessible with your admin access.</p>
        </div>
      ) : (
        <>
          <div className="photo-tools">
            <label>
              View
              <select
                value={view}
                onChange={(e) => {
                  setView(e.target.value);
                  setBefore("");
                  setAfter("");
                }}
              >
                <option value="all">All views</option>
                {["front", "side", "back", "other"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Earlier photo
              <select
                value={before}
                onChange={(e) => {
                  setBefore(e.target.value);
                  if (e.target.value === after) setAfter("");
                }}
              >
                <option value="">Choose a photo</option>
                {photos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayDay(p.day, { month: "short", day: "numeric", year: "numeric" })} · {p.data.view}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Later photo
              <select value={after} onChange={(e) => setAfter(e.target.value)}>
                <option value="">Choose a photo</option>
                {photos
                  .filter((p) => p.id !== before)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayDay(p.day, { month: "short", day: "numeric", year: "numeric" })} · {p.data.view}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {a && b && (
            <section className="comparison">
              <div className="compare-stage">
                <div className="compare-layer">
                  <Photo entry={b} />
                </div>
                <div className="compare-layer" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                  <Photo entry={a} />
                </div>
                <div className="compare-line" style={{ left: `${split}%` }} />
              </div>
              <div className="compare-labels">
                <span>
                  {displayDay(a.day)} · {a.data.view}
                </span>
                <span>
                  {displayDay(b.day)} · {b.data.view}
                </span>
              </div>
              <label>
                Reveal comparison
                <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(Number(e.target.value))} />
              </label>
              {a.data.view !== b.data.view && <p className="hint">These photos have different views.</p>}
            </section>
          )}
          <div className="photo-grid">
            {photos.slice(0, limit).map((p) => (
              <article key={p.id}>
                <div className="photo-frame">
                  <Photo entry={p} />
                </div>
                <div className="photo-meta">
                  <div>
                    <strong>{displayDay(p.day)}</strong>
                    <span>{p.data.view}</span>
                  </div>
                  <button className="text-button" onClick={() => onEdit(p)}>
                    Edit
                  </button>
                  <button className="text-button" onClick={() => onArchive(p)}>
                    Archive
                  </button>
                </div>
                {p.data.notes && <p className="hint">{p.data.notes}</p>}
              </article>
            ))}
          </div>
          {photos.length > limit && (
            <button className="secondary" onClick={() => setLimit(limit + 24)}>
              Show more photos
            </button>
          )}
        </>
      )}
    </>
  );
}
