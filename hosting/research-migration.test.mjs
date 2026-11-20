import test from "node:test";
import assert from "node:assert/strict";
import { migrateSavedUnlock, stopPasswordMigration } from "../assets/research/migration.js";
import { sealHandoff } from "../assets/research/handoff.js";
function storage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
}
function browser(t) {
  const names = ["localStorage", "sessionStorage", "location", "history"],
    old = new Map(names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => {
    for (const [k, d] of old) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k];
  });
  const destinations = [];
  const location = {
    origin: "https://nir.pechuk.com",
    pathname: "/research/example/",
    search: "?x=1",
    hash: "#figure",
    replace: (value) => destinations.push(value),
  };
  Object.defineProperties(globalThis, {
    localStorage: { value: storage(), configurable: true },
    sessionStorage: { value: storage(), configurable: true },
    location: { value: location, configurable: true },
    history: { value: { replaceState: () => {} }, configurable: true },
  });
  return { location, destinations };
}
test("saved research/admin unlocks transfer encrypted to the initiating browser and return to the requested report", async (t) => {
  const { location, destinations } = browser(t);
  assert.equal(await migrateSavedUnlock("research-password"), false);
  const outgoing = new URL(destinations[0]);
  assert.equal(outgoing.origin, "https://nirpechuk.github.io");
  const request = JSON.parse(decodeURIComponent(outgoing.hash.slice(9)));
  assert.equal(request.publicKey.d, undefined);
  const packet = await sealHandoff(
    request.publicKey,
    { "research-password": "test research secret", "admin-password": "test admin secret" },
    request.nonce
  );
  assert.ok(!JSON.stringify(packet).includes("test research secret"));
  location.hash = "#research-migrate=" + encodeURIComponent(JSON.stringify({ ...packet, nonce: request.nonce }));
  assert.equal(await migrateSavedUnlock("admin-password"), false);
  assert.equal(localStorage.getItem("research-password"), "test research secret");
  assert.equal(localStorage.getItem("admin-password"), "test admin secret");
  assert.equal(sessionStorage.getItem("research:domain-migration:pending"), null);
  assert.equal(destinations.at(-1), "/research/example/?x=1#figure");
  location.hash = "";
  assert.equal(await migrateSavedUnlock("research-password"), true);
});
test("unsolicited handoffs cannot install credentials; Lock does not reimport old passwords", async (t) => {
  const { location, destinations } = browser(t);
  location.hash = "#research-migrate=%7B%7D";
  assert.equal(await migrateSavedUnlock("research-password"), true);
  assert.equal(localStorage.getItem("research-password"), null);
  stopPasswordMigration();
  location.hash = "";
  assert.equal(await migrateSavedUnlock("research-password"), true);
  assert.equal(destinations.length, 0);
});

test("a carried password never shadows a newer password already stored on the new domain", async (t) => {
  const { location, destinations } = browser(t);
  localStorage.setItem("research-password", "new password");
  assert.equal(await migrateSavedUnlock("admin-password"), false);
  const request = JSON.parse(decodeURIComponent(new URL(destinations[0]).hash.slice(9)));
  const packet = await sealHandoff(request.publicKey, { "research-password": "old password", "admin-password": "admin" }, request.nonce);
  location.hash = "#research-migrate=" + encodeURIComponent(JSON.stringify({ ...packet, nonce: request.nonce }));
  await migrateSavedUnlock("admin-password");
  assert.equal(localStorage.getItem("research-password"), "new password");
  assert.equal(sessionStorage.getItem("research-password"), null);
  assert.equal(localStorage.getItem("admin-password"), "admin");
});
