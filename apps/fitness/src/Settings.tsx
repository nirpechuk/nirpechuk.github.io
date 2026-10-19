import { useEffect, useState, type FormEvent } from "react";
import { db } from "./backend";
import { type Settings as Preferences, type Unit } from "./model";
import { PluginConnections } from "./PluginConsent";
interface Key {
  id: string;
  name: string;
  expires_at: string;
  revoked_at: string | null;
}
export function Settings({
  value,
  onSave,
  demo,
  onExport,
}: {
  value: Preferences;
  onSave: (v: Preferences) => Promise<void>;
  demo: boolean;
  onExport: () => void;
}) {
  const [cal, setCal] = useState(value.calorie_goal?.toString() ?? "");
  const [protein, setProtein] = useState(value.protein_goal?.toString() ?? "");
  const [sessions, setSessions] = useState(value.weekly_sessions);
  const [unit, setUnit] = useState(value.weight_unit);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("Personal agent");
  const [token, setToken] = useState("");
  async function loadKeys() {
    if (demo) return;
    const { data, error } = await db.rpc("fitness_list_agent_keys");
    if (error) throw error;
    setKeys(data ?? []);
  }
  useEffect(() => {
    loadKeys().catch((e) => setError(e.message));
  }, [demo]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        calorie_goal: cal ? Number(cal) : null,
        protein_goal: protein ? Number(protein) : null,
        weekly_sessions: sessions,
        weight_unit: unit,
      });
      setMessage("Preferences saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createKey() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await db.rpc("fitness_create_agent_key", { p_name: name });
      if (error) throw error;
      setToken(data.token);
      await loadKeys();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      const { error } = await db.rpc("fitness_revoke_agent_key", { p_id: id });
      if (error) throw error;
      setToken("");
      await loadKeys();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Make it yours.</h2>
      <div className="settings-layout">
        <section>
          <h3>Targets & preferences</h3>
          <p className="muted">Set your own targets. Leave nutrition targets blank to simply observe.</p>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>
                Daily calories · kcal
                <input type="number" min="1" max="20000" value={cal} onChange={(e) => setCal(e.target.value)} placeholder="No target" />
              </label>
              <label>
                Daily protein · g
                <input type="number" min="1" max="1000" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="No target" />
              </label>
              <label>
                Sessions per week
                <input type="number" min="0" max="21" required value={sessions} onChange={(e) => setSessions(Number(e.target.value))} />
              </label>
              <label>
                Display weight in
                <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  <option>lb</option>
                  <option>kg</option>
                </select>
              </label>
            </div>
            <button disabled={busy}>Save preferences</button>
            {message && (
              <p role="status" className="hint">
                {message}
              </p>
            )}
          </form>
          <div className="settings-section">
            <h3>Your data</h3>
            <p className="muted">Download your journal entries and preferences. Photo files remain in private storage.</p>
            <button className="secondary" onClick={onExport}>
              Export journal
            </button>
          </div>
        </section>
        <section>
          <PluginConnections demo={demo} />
          <h3>Log through an agent</h3>
          <p className="muted">
            Create a revocable key for logging meals, workouts, weigh-ins, and complete days. It can read text entries from the past year, but cannot
            access photos.
          </p>
          <label>
            Connection name
            <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button disabled={demo || busy || !name.trim()} onClick={createKey}>
            Create agent key
          </button>
          {demo && <p className="hint">Agent connections are available in your real journal.</p>}
          {token && (
            <div className="token-box">
              <p>Save this key in your agent’s private configuration. It is shown only now and expires in 90 days.</p>
              <code>{token}</code>
              <button
                className="secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(token)
                    .then(() => setMessage("Agent key copied."))
                    .catch(() => setError("Could not copy. Select and copy the key manually."))
                }
              >
                Copy key
              </button>
              <button className="text-button" onClick={() => setToken("")}>
                Hide
              </button>
            </div>
          )}
          <div className="key-list">
            {keys.map((k) => (
              <div key={k.id}>
                <span>
                  {k.name}
                  <small>{k.revoked_at ? "Revoked" : `Expires ${new Date(k.expires_at).toLocaleDateString()}`}</small>
                </span>
                {!k.revoked_at && (
                  <button className="text-button" disabled={busy} onClick={() => revoke(k.id)}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="hint">
            An agent must be connected to the logging API before chat messages can be saved. Creating a key does not connect a chat automatically.
          </p>
        </section>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
