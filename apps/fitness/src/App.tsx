import { useEffect, useRef, useState, type FormEvent } from "react";
import { db, loadJournal, saveEntry, saveSettings, preparePhoto } from "./backend";
import { savedPassword, rememberPassword, forgetPasswords, unlockAdmin } from "./auth";
import {
  today,
  weekStart,
  displayDay,
  nutrition,
  strengthPoints,
  defaults,
  description,
  demoEntries,
  type Entry,
  type Kind,
  type Settings as Preferences,
} from "./model";
import { LineChart, NutritionChart } from "./Charts";
import { EntryForm } from "./EntryForm";
import { Photos } from "./Photos";
import { Settings } from "./Settings";
import config from "./config.json";
import { Notebook } from "./Notebook";
const tabs = ["Overview", "Nutrition", "Training", "Photos", "Settings"] as const;
type Tab = (typeof tabs)[number];
function Metric({ label, value, unit, detail }: { label: string; value: string | number; unit?: string; detail: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
function History({ entry, demo, onClose }: { entry: Entry; demo: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<{ id: string; recorded_at: string; operation: string; current: Entry }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    if (demo) {
      setRows([{ id: "demo", recorded_at: entry.created_at, operation: "INSERT", current: entry }]);
      return;
    }
    let live = true;
    db.from("fitness_history")
      .select("*")
      .eq("entry_id", entry.id)
      .order("recorded_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setError(error.message);
        else setRows(data ?? []);
      });
    return () => {
      live = false;
    };
  }, [entry.id, demo]);
  return (
    <dialog ref={dialog} className="entry-dialog" onCancel={onClose}>
      <div className="section-head">
        <h2>Entry history</h2>
        <button className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <h3>{entry.title}</h3>
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <div className="history-item" key={r.id}>
          <div>
            {r.operation === "INSERT" ? "Recorded" : "Corrected"} · {new Date(r.recorded_at).toLocaleString()}
          </div>
          <p>{description(r.current)}</p>
          <small>
            Revision {r.current.revision} · {r.current.source === "agent" ? "Agent" : "Website"}
            {r.current.archived_at ? " · Archived" : ""}
          </small>
          {r.current.data.notes && <p>{r.current.data.notes}</p>}
        </div>
      ))}
    </dialog>
  );
}
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [demo, setDemo] = useState(false);
  const [owner, setOwner] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Preferences>(defaults);
  const [tab, setTab] = useState<Tab>("Overview");
  const [selectedDay, setSelectedDay] = useState(today());
  const [form, setForm] = useState<{ kind: Kind; entry?: Entry } | null>(null);
  const [history, setHistory] = useState<Entry | null>(null);
  const [metric, setMetric] = useState<"calories" | "protein">("calories");
  const [exercise, setExercise] = useState("");
  const [journalLimit, setJournalLimit] = useState(30);
  const [dark, setDark] = useState(
    document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches)
  );
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("fitness-theme", next ? "dark" : "light");
    } catch {}
  }
  const authGeneration = useRef(0);
  async function refresh() {
    const generation = authGeneration.current;
    const result = await loadJournal();
    if (generation !== authGeneration.current) return;
    setEntries(result.entries);
    setSettings(result.settings ?? defaults);
  }
  async function unlock(value: string) {
    const generation = ++authGeneration.current;
    setBusy(true);
    setError("");
    try {
      const access = await unlockAdmin(value);
      if (!access) throw new Error("Admin access is valid. Fitness backend setup is still being completed.");
      if (access.url !== config.url) throw new Error("Fitness account configuration does not match this project.");
      const { data, error } = await db.auth.signInWithPassword({ email: access.email, password: access.password });
      if (error) throw error;
      const allowed = await db.rpc("fitness_is_owner");
      if (allowed.error) throw new Error("The private journal database is not ready yet.");
      if (!allowed.data) throw new Error("This account does not have access to the fitness journal.");
      const journal = await loadJournal();
      if (generation !== authGeneration.current) {
        await db.auth.signOut({ scope: "local" });
        return;
      }
      rememberPassword(value);
      setOwner(data.user.id);
      setEntries(journal.entries);
      setSettings(journal.settings ?? defaults);
      setDemo(false);
      setUnlocked(true);
      setPassword("");
    } catch (e) {
      if (generation === authGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === authGeneration.current) setBusy(false);
    }
  }
  useEffect(() => {
    const p = savedPassword();
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("example") === "1") explore();
    else if (p) void unlock(p);
    const listen = (e: StorageEvent) => {
      if (e.key === "admin-password" && !e.newValue) void lock();
    };
    window.addEventListener("storage", listen);
    return () => window.removeEventListener("storage", listen);
  }, []);
  useEffect(() => {
    if (!unlocked || demo || form) return;
    let live = true;
    const update = () => {
      if (live && document.visibilityState === "visible") void refresh().catch(() => {});
    };
    window.addEventListener("focus", update);
    const timer = setInterval(update, 30000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [unlocked, demo, form]);
  async function lock() {
    authGeneration.current++;
    setUnlocked(false);
    setEntries([]);
    setOwner("");
    setDemo(false);
    setForm(null);
    setHistory(null);
    setError("");
    setNotice("");
    setBusy(false);
    forgetPasswords();
    await db.auth.signOut({ scope: "local" });
  }
  function explore() {
    authGeneration.current++;
    setDemo(true);
    setUnlocked(true);
    setOwner("example");
    setEntries(demoEntries());
    setSettings(defaults);
    setBusy(false);
    setError("");
  }
  async function handleSave(value: Partial<Entry> & Pick<Entry, "kind" | "day" | "title" | "data">, file?: File) {
    const existing = !!value.id;
    const id = value.id ?? crypto.randomUUID();
    const time = new Date().toISOString();
    const e: Entry = { owner_id: owner, source: "web", revision: 1, created_at: time, updated_at: time, archived_at: null, ...value, id };
    let uploadedPath = "";
    if (file) {
      if (demo) throw new Error("Personal photos can only be uploaded to your real journal.");
      const blob = await preparePhoto(file);
      uploadedPath = `${owner}/${id}.jpg`;
      const upload = await db.storage.from("fitness-photos").upload(uploadedPath, blob, { contentType: "image/jpeg", upsert: false });
      if (upload.error) throw upload.error;
      e.data = { ...e.data, path: uploadedPath };
    }
    try {
      const saved = demo ? { ...e, revision: existing ? e.revision + 1 : 1, updated_at: time } : await saveEntry(e, existing);
      setEntries((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
      setNotice(demo ? "Example updated for this visit." : "Saved to your private journal.");
    } catch (error) {
      if (uploadedPath) {
        // A lost response can follow a successful insert. Never remove its photo.
        const recovery = await db.from("fitness_entries").select("*").eq("id", id).maybeSingle();
        if (recovery.data) {
          const recovered = recovery.data as Entry;
          setEntries((prev) => [recovered, ...prev.filter((x) => x.id !== recovered.id)]);
          setNotice("Saved to your private journal.");
          return;
        }
        if (!recovery.error) await db.storage.from("fitness-photos").remove([uploadedPath]);
      }
      throw error;
    }
  }
  async function archive(e: Entry) {
    if (
      !window.confirm(
        `Archive “${e.title}”? It will leave your active journal; its history${e.kind === "photo" ? " and private photo file" : ""} will be retained.`
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (!demo) await saveEntry({ ...e, archived_at: new Date().toISOString() }, true);
      setEntries((prev) => prev.filter((x) => x.id !== e.id));
      setNotice("Entry archived. Its history is retained.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function completeDay(day: string) {
    const existing = entries.find((e) => e.kind === "checkin" && e.day === day);
    setBusy(true);
    setError("");
    try {
      await handleSave({ ...existing, kind: "checkin", day, title: "Food journal", data: { complete: !existing?.data.complete } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportJournal() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), example: demo, settings, entries }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitness-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const now = today(),
    dayStats = nutrition(entries, selectedDay),
    week = weekStart(now);
  const workouts = entries.filter((e) => e.kind === "workout");
  const sessions = workouts.filter((e) => e.day >= week && e.day <= now).length;
  const allExercises = [...new Set(workouts.flatMap((e) => (e.data.exercises ?? []).map((x) => x.name)))].sort();
  const chosenExercise = allExercises.includes(exercise) ? exercise : (allExercises[0] ?? "");
  function entryList(list: Entry[]) {
    return list.length ? (
      <div className="entry-list">
        {list.map((e) => (
          <article className="journal-row" key={e.id}>
            <div className="entry-date">
              <span>{displayDay(e.day, { month: "short" })}</span>
              <strong>{Number(e.day.slice(-2))}</strong>
            </div>
            <div className="entry-main">
              <div className="entry-heading">
                <h3>{e.title}</h3>
                {e.kind === "meal" && (
                  <span className="tag">
                    {e.data.confidence === "estimated" ? "Estimate" : e.data.confidence === "weighed" ? "Weighed" : "Label"}
                  </span>
                )}
                {e.source === "agent" && <span className="tag">Agent</span>}
              </div>
              <p>{description(e)}</p>
              {e.data.notes && <div className="entry-notes">{e.data.notes}</div>}
            </div>
            <div className="entry-actions">
              {e.kind !== "checkin" && (
                <button className="text-button" onClick={() => setForm({ kind: e.kind, entry: e })}>
                  Edit
                </button>
              )}
              <button className="text-button" onClick={() => setHistory(e)}>
                History
              </button>
              <button className="text-button" disabled={busy} onClick={() => archive(e)}>
                Archive
              </button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="empty-line">No entries yet. Start whenever you’re ready.</div>
    );
  }
  return (
    <div className="fitness-app">
      <header className="site-header">
        <a href="/" className="wordmark">
          nir pechuk<span> / fitness</span>
        </a>
        <div className="header-actions">
          <span className="private-label">Private journal</span>
          <button className="text-button theme-switch" onClick={toggleTheme} aria-label={dark ? "Use paper theme" : "Use night theme"}>
            {dark ? "Paper" : "Night"}
          </button>
          {unlocked && (
            <button className="text-button" onClick={() => void lock()}>
              {demo ? "Exit example" : "Lock"}
            </button>
          )}
        </div>
      </header>
      {!unlocked ? (
        <main className="gate">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void unlock(password);
            }}
          >
            <label htmlFor="admin-password">Admin password</label>
            <div className="unlock-row">
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <button disabled={busy}>{busy ? "Unlocking…" : "Unlock"}</button>
            </div>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </main>
      ) : (
        <>
          {demo && (
            <div className="demo-banner">
              Example journal · Illustrative data · Changes last only for this visit
              <button
                className="text-button"
                onClick={() => {
                  setUnlocked(false);
                  setDemo(false);
                  setEntries([]);
                }}
              >
                Open my journal
              </button>
            </div>
          )}
          <nav className="app-nav" aria-label="Fitness sections">
            {tabs.map((t) => (
              <button key={t} className={tab === t ? "active" : ""} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <main className="content">
            <div className="page-heading">
              <div>
                <p className="date-label">{displayDay(now, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
                <h1>
                  {tab === "Overview"
                    ? "A study in consistency."
                    : tab === "Nutrition"
                      ? "The nutrition record."
                      : tab === "Training"
                        ? "The training record."
                        : tab === "Photos"
                          ? "The photographic record."
                          : "Your journal, your way."}
                </h1>
              </div>
              {tab !== "Settings" && (
                <div className="quick-actions">
                  {tab === "Photos" ? null : (
                    <>
                      <button onClick={() => setForm({ kind: tab === "Training" ? "workout" : "meal" })}>
                        + {tab === "Training" ? "Log workout" : "Log a meal"}
                      </button>
                      <button className="secondary" onClick={() => setForm({ kind: tab === "Training" ? "measurement" : "workout" })}>
                        + {tab === "Training" ? "Weigh in" : "Workout"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {error && (
              <div role="alert" className="error notice">
                {error}
                <button className="text-button" onClick={() => setError("")}>
                  Dismiss
                </button>
              </div>
            )}
            {notice && (
              <div role="status" className="notice">
                {notice}
                <button className="text-button" onClick={() => setNotice("")}>
                  Dismiss
                </button>
              </div>
            )}
            {tab === "Overview" && (
              <>
                <Notebook entries={entries} settings={settings} end={now} onWeigh={() => setForm({ kind: "measurement" })} />
                <section className="section-block">
                  <div className="section-head">
                    <h2>Latest observations</h2>
                    <button
                      className="text-button"
                      disabled={busy || demo}
                      onClick={() => {
                        setBusy(true);
                        refresh()
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      {busy ? "Refreshing…" : "Refresh"}
                    </button>
                  </div>
                  {entryList(
                    [...entries]
                      .filter((e) => e.kind !== "photo")
                      .sort((a, b) => b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at))
                      .slice(0, 6)
                  )}
                </section>
              </>
            )}
            {tab === "Nutrition" && (
              <>
                <div className="day-toolbar">
                  <label>
                    Journal date
                    <input type="date" value={selectedDay} max={now} onChange={(e) => e.target.value && setSelectedDay(e.target.value)} />
                  </label>
                  <button className={dayStats.complete ? "secondary" : "primary"} disabled={busy} onClick={() => completeDay(selectedDay)}>
                    {dayStats.complete ? "Reopen food journal" : "Mark day complete"}
                  </button>
                </div>
                <div className="metrics four">
                  <Metric
                    label="Calories"
                    value={Math.round(dayStats.calories).toLocaleString()}
                    unit="kcal"
                    detail={settings.calorie_goal ? `Your target: ${settings.calorie_goal.toLocaleString()} kcal` : "Recorded intake"}
                  />
                  <Metric
                    label="Protein"
                    value={Math.round(dayStats.protein)}
                    unit="g"
                    detail={settings.protein_goal ? `Your target: ${settings.protein_goal} g` : "Recorded protein"}
                  />
                  <Metric label="Carbs" value={Math.round(dayStats.carbs)} unit="g" detail="From entries with carb values" />
                  <Metric label="Fat" value={Math.round(dayStats.fat)} unit="g" detail="From entries with fat values" />
                </div>
                <p className="nutrition-status">
                  {dayStats.complete ? "Food journal marked complete." : "This journal is open; totals may be incomplete."}
                  {dayStats.estimated ? " Includes estimated meals." : ""}
                </p>
                {entryList(
                  entries.filter((e) => e.kind === "meal" && e.day === selectedDay).sort((a, b) => a.created_at.localeCompare(b.created_at))
                )}
                <section className="section-block">
                  <div className="section-head">
                    <h2>The past two weeks</h2>
                    <div className="segmented">
                      <button aria-pressed={metric === "calories"} onClick={() => setMetric("calories")}>
                        Calories
                      </button>
                      <button aria-pressed={metric === "protein"} onClick={() => setMetric("protein")}>
                        Protein
                      </button>
                    </div>
                  </div>
                  <NutritionChart entries={entries} end={selectedDay} metric={metric} />
                </section>
              </>
            )}
            {tab === "Training" && (
              <>
                <div className="metrics">
                  <Metric
                    label="Sessions this week"
                    value={sessions}
                    unit={settings.weekly_sessions ? `/ ${settings.weekly_sessions}` : ""}
                    detail="Counted from recorded workouts"
                  />
                  <Metric
                    label="Training time this week"
                    value={workouts.filter((e) => e.day >= week && e.day <= now).reduce((s, e) => s + (e.data.minutes ?? 0), 0)}
                    unit="min"
                    detail="From sessions with a duration"
                  />
                  <Metric label="Total recorded sessions" value={workouts.length} detail="Your cumulative training record" />
                </div>
                <section className="section-block">
                  <div className="section-head">
                    <h2>Strength progression</h2>
                    {allExercises.length > 0 && (
                      <label className="compact-label">
                        Exercise
                        <select value={chosenExercise} onChange={(e) => setExercise(e.target.value)}>
                          {allExercises.map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <LineChart points={strengthPoints(entries, chosenExercise, settings.weight_unit)} unit={settings.weight_unit} label="Strength" />
                  <p className="hint">Compare reps and sets in the session log alongside the working weight.</p>
                </section>
                <section className="section-block">
                  <h2>Session log</h2>
                  {entryList([...workouts].sort((a, b) => b.day.localeCompare(a.day)).slice(0, journalLimit))}
                  {workouts.length > journalLimit && (
                    <button className="secondary" onClick={() => setJournalLimit(journalLimit + 30)}>
                      Show more sessions
                    </button>
                  )}
                </section>
              </>
            )}
            {tab === "Photos" && (
              <Photos
                entries={entries}
                onAdd={() => setForm({ kind: "photo" })}
                onEdit={(e) => setForm({ kind: e.kind, entry: e })}
                onArchive={(e) => void archive(e)}
              />
            )}
            {tab === "Settings" && (
              <Settings
                value={settings}
                demo={demo}
                onSave={async (v) => {
                  if (!demo) await saveSettings(v, owner);
                  setSettings(v);
                }}
                onExport={exportJournal}
              />
            )}
          </main>
          <footer className="app-footer">
            <span>Recorded honestly. Kept privately.</span>
            <span>
              {demo ? "Illustrative data" : "America/New_York"} · <a href="/">Back to the website</a>
            </span>
          </footer>
          {form && (
            <EntryForm
              key={form.entry?.id ?? form.kind}
              {...form}
              unit={settings.weight_unit}
              meals={entries.filter((e) => e.kind === "meal").sort((a, b) => b.day.localeCompare(a.day))}
              onSave={handleSave}
              onClose={() => setForm(null)}
            />
          )}{" "}
          {history && <History entry={history} demo={demo} onClose={() => setHistory(null)} />}
        </>
      )}
    </div>
  );
}
