import { useEffect, useRef, useState, type FormEvent } from "react";
import { description, today, type Entry, type EntryData, type Kind, type Unit } from "./model";
export function EntryForm({
  kind,
  entry,
  unit,
  onSave,
  onClose,
  meals,
}: {
  kind: Kind;
  entry?: Entry;
  unit: Unit;
  onSave: (entry: Partial<Entry> & { kind: Kind; day: string; title: string; data: EntryData }, file?: File) => Promise<void>;
  onClose: () => void;
  meals: Entry[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [day, setDay] = useState(entry?.day ?? today());
  const [title, setTitle] = useState(entry?.title ?? "");
  const [notes, setNotes] = useState(entry?.data.notes ?? "");
  const [calories, setCalories] = useState(String(entry?.data.calories ?? ""));
  const [protein, setProtein] = useState(String(entry?.data.protein ?? ""));
  const [carbs, setCarbs] = useState(String(entry?.data.carbs ?? ""));
  const [fat, setFat] = useState(String(entry?.data.fat ?? ""));
  const [confidence, setConfidence] = useState(entry?.data.confidence ?? "estimated");
  const [weight, setWeight] = useState(String(entry?.data.weight ?? ""));
  const [weightUnit, setWeightUnit] = useState<Unit>(entry?.data.unit ?? unit);
  const [minutes, setMinutes] = useState(String(entry?.data.minutes ?? ""));
  const [view, setView] = useState(entry?.data.view ?? "front");
  const [file, setFile] = useState<File>();
  const [exercises, setExercises] = useState((entry?.data.exercises ?? []).map((x) => ({ ...x, reps: x.reps.join(", ") })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const names: Record<Kind, string> = { meal: "meal", workout: "workout", measurement: "weigh-in", photo: "progress photo", checkin: "check-in" };
  function reuse(id: string) {
    const meal = meals.find((m) => m.id === id);
    if (!meal) return;
    setTitle(meal.title);
    setCalories(String(meal.data.calories ?? ""));
    setProtein(String(meal.data.protein ?? ""));
    setCarbs(String(meal.data.carbs ?? ""));
    setFat(String(meal.data.fat ?? ""));
    setConfidence(meal.data.confidence ?? "estimated");
    setNotes(meal.data.notes ?? "");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let data: EntryData = { notes };
      if (kind === "meal")
        data = {
          ...data,
          calories: Number(calories),
          protein: Number(protein),
          ...(carbs !== "" ? { carbs: Number(carbs) } : {}),
          ...(fat !== "" ? { fat: Number(fat) } : {}),
          confidence,
        };
      if (kind === "measurement") data = { ...data, weight: Number(weight), unit: weightUnit };
      if (kind === "photo") {
        if (!entry && !file) throw new Error("Choose a photo to upload.");
        data = { ...data, view, path: entry?.data.path };
      }
      if (kind === "workout") {
        const parsed = exercises.map((x) => ({ ...x, weight: Number(x.weight), reps: x.reps.split(",").map((s) => Number(s.trim())) }));
        if (parsed.some((x) => !x.name.trim() || x.reps.some((r) => !Number.isInteger(r) || r < 1)))
          throw new Error("Enter an exercise name and positive reps for every set.");
        if (!parsed.length && !minutes) throw new Error("Add an exercise or a duration.");
        data = { ...data, exercises: parsed, ...(minutes ? { minutes: Number(minutes) } : {}) };
      }
      await onSave(
        {
          ...entry,
          kind,
          day,
          title:
            title.trim() ||
            (kind === "measurement" ? "Morning weight" : kind === "photo" ? `${view[0].toUpperCase() + view.slice(1)} progress` : "Workout"),
          data,
        },
        file
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      className="entry-dialog"
    >
      <form onSubmit={submit}>
        <div className="section-head">
          <h2>
            {entry ? "Edit" : "Add"} {names[kind]}
          </h2>
          <button type="button" className="text-button" disabled={busy} onClick={onClose}>
            Close
          </button>
        </div>
        {kind === "meal" && !entry && meals.length > 0 && (
          <label>
            Use a recent meal
            <select onChange={(e) => reuse(e.target.value)} defaultValue="">
              <option value="">Start fresh</option>
              {meals.slice(0, 25).map((m) => (
                <option value={m.id} key={m.id}>
                  {m.title} · {description(m)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-grid">
          <label>
            Date
            <input type="date" required value={day} min="2000-01-01" max={today()} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label>
            {kind === "measurement" ? "Label" : kind === "photo" ? "Caption" : "Name"}
            <input
              required={kind === "meal"}
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "meal" ? "Chicken bowl" : kind === "workout" ? "Upper body" : kind === "photo" ? "Morning, natural light" : "Morning weight"
              }
            />
          </label>
        </div>
        {kind === "meal" && (
          <>
            <div className="form-grid four">
              <label>
                Calories · kcal
                <input type="number" min="0" max="20000" step="any" required value={calories} onChange={(e) => setCalories(e.target.value)} />
              </label>
              <label>
                Protein · g
                <input type="number" min="0" max="20000" step="any" required value={protein} onChange={(e) => setProtein(e.target.value)} />
              </label>
              <label>
                Carbs · g<input type="number" min="0" max="20000" step="any" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
              </label>
              <label>
                Fat · g<input type="number" min="0" max="20000" step="any" value={fat} onChange={(e) => setFat(e.target.value)} />
              </label>
            </div>
            <label>
              Nutrition source
              <select value={confidence} onChange={(e) => setConfidence(e.target.value as typeof confidence)}>
                <option value="estimated">Estimated</option>
                <option value="label">Nutrition label / published information</option>
                <option value="weighed">Weighed portions</option>
              </select>
            </label>
          </>
        )}
        {kind === "measurement" && (
          <div className="form-grid">
            <label>
              Weight
              <input type="number" required min="1" max="1500" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>
            <label>
              Unit
              <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value as Unit)}>
                <option>lb</option>
                <option>kg</option>
              </select>
            </label>
          </div>
        )}
        {kind === "workout" && (
          <>
            <label>
              Duration · minutes
              <input
                type="number"
                min="1"
                max="1440"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="Optional for strength sessions"
              />
            </label>
            <div className="exercise-list">
              {exercises.map((x, i) => (
                <fieldset key={i}>
                  <legend>Exercise {i + 1}</legend>
                  <div className="form-grid">
                    <label>
                      Exercise
                      <input
                        required
                        maxLength={100}
                        value={x.name}
                        onChange={(e) => setExercises(exercises.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)))}
                        placeholder="Bench press"
                      />
                    </label>
                    <label>
                      Reps per set
                      <input
                        required
                        value={x.reps}
                        onChange={(e) => setExercises(exercises.map((v, j) => (j === i ? { ...v, reps: e.target.value } : v)))}
                        placeholder="8, 8, 7"
                      />
                    </label>
                    <label>
                      Working weight
                      <input
                        type="number"
                        required
                        min="0"
                        max="2000"
                        step="any"
                        value={x.weight}
                        onChange={(e) => setExercises(exercises.map((v, j) => (j === i ? { ...v, weight: Number(e.target.value) } : v)))}
                      />
                    </label>
                    <label>
                      Unit
                      <select
                        value={x.unit}
                        onChange={(e) => setExercises(exercises.map((v, j) => (j === i ? { ...v, unit: e.target.value as Unit } : v)))}
                      >
                        <option>lb</option>
                        <option>kg</option>
                      </select>
                    </label>
                  </div>
                  <button type="button" className="text-button" onClick={() => setExercises(exercises.filter((_, j) => i !== j))}>
                    Remove exercise
                  </button>
                </fieldset>
              ))}
            </div>
            <button className="secondary" type="button" onClick={() => setExercises([...exercises, { name: "", weight: 0, unit, reps: "" }])}>
              + Add exercise
            </button>
          </>
        )}
        {kind === "photo" && (
          <>
            <label>
              View
              <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
                <option>front</option>
                <option>side</option>
                <option>back</option>
                <option>other</option>
              </select>
            </label>
            {!entry && (
              <label>
                Photo
                <input type="file" required accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0])} />
              </label>
            )}
            <p className="hint">
              Same distance, lighting, and pose help comparisons. Photos are stored privately; location metadata is removed before upload.
            </p>
          </>
        )}
        <label>
          Notes
          <textarea rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? "Saving…" : entry ? "Save changes" : `Save ${names[kind]}`}</button>
        </div>
      </form>
    </dialog>
  );
}
