import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandoff, sealHandoff, openHandoff } from "./migration-crypto.mjs";

test("room handoff requires the initiating browser's private key and nonce", async () => {
  const keys = await createHandoff(),
    other = await createHandoff();
  const value = { keys: ["private-room-capability"], active: "room-id" };
  const packet = await sealHandoff(keys.publicKey, value, "session-one");
  assert.deepEqual(await openHandoff(keys.privateKey, packet, "session-one"), value);
  assert.equal(JSON.stringify(packet).includes("private-room-capability"), false);
  assert.equal(packet.publicKey.d, undefined);
  await assert.rejects(openHandoff(other.privateKey, packet, "session-one"));
  await assert.rejects(openHandoff(keys.privateKey, packet, "session-two"));
  await assert.rejects(openHandoff(keys.privateKey, { ...packet, data: packet.data.slice(4) }, "session-one"));
});
