import { useEffect, useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { db } from "./backend";

export function PluginConsent({ authorizationId }: { authorizationId: string }) {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    db.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      else if (data && "authorization_id" in data) setDetails(data);
      else if (data && "redirect_url" in data) window.location.assign(data.redirect_url);
    });
    return () => {
      live = false;
    };
  }, [authorizationId]);
  async function decide(approve: boolean) {
    if (!details) return;
    setBusy(true);
    setError("");
    try {
      if (approve) {
        const allowed = await db.rpc("fitness_allow_plugin_client", {
          p_client_id: details.client.id,
          p_name: details.client.name.slice(0, 100) || "Fitness plugin",
        });
        if (allowed.error) throw allowed.error;
      }
      const { data, error } = approve
        ? await db.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await db.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (error) throw error;
      if (data?.redirect_url) window.location.assign(data.redirect_url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="plugin-consent">
      <p className="eyebrow">Private connection</p>
      <h1>Connect your journal.</h1>
      {details ? (
        <>
          <p>
            <strong>{details.client.name}</strong> is asking to connect to your fitness journal.
          </p>
          <p>It can read and log meals, workouts, weigh-ins, and food-journal completion, and correct those entries with history retained.</p>
          <p>Photos, preferences, deletion, and creating other connections are excluded. You can disconnect it in Settings.</p>
          <p className="hint">Return to: {details.redirect_uri}</p>
          {details.scope && <p className="hint">Account permissions requested: {details.scope}</p>}
          <div className="plugin-consent-actions">
            <button disabled={busy} onClick={() => void decide(true)}>
              {busy ? "Connecting…" : "Connect journal"}
            </button>
            <button className="secondary" disabled={busy} onClick={() => void decide(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        !error && <p>Loading connection request…</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

export function PluginConnections({ demo }: { demo: boolean }) {
  const [clients, setClients] = useState<{ client_id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (demo) return;
    let live = true;
    db.rpc("fitness_list_plugin_clients").then(({ data, error }) => {
      if (!live) return;
      if (error) setError("Cloud connections are not ready yet.");
      else setClients(data ?? []);
    });
    return () => {
      live = false;
    };
  }, [demo]);
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      const { error } = await db.rpc("fitness_revoke_plugin_client", { p_client_id: id });
      if (error) throw error;
      setClients((items) => items.filter((c) => c.client_id !== id));
      const result = await db.auth.oauth.revokeGrant({ clientId: id });
      if (result.error) setError("Journal access has been removed. Disconnect Fitness in ChatGPT too to clear its sign-in.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-section">
      <h3>Cloud connections</h3>
      <p className="muted">Your Fitness plugin can log from ChatGPT and your dot while your computer is off.</p>
      <div className="key-list">
        {clients.map((c) => (
          <div key={c.client_id}>
            <span>{c.name}</span>
            <button className="text-button" disabled={busy} onClick={() => void revoke(c.client_id)}>
              Disconnect
            </button>
          </div>
        ))}
      </div>
      {!clients.length && !error && <p className="hint">No cloud connections yet. Connect Fitness in ChatGPT to get started.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
