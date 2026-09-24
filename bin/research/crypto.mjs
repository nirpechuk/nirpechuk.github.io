import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const iterations = 250000;

async function keyFor(password, salt, rounds) {
  const material = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(value, password) {
  if (!password) throw new Error("A research password is required.");
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt, iterations);
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return {
    version: 1,
    iterations,
    salt: Buffer.from(salt).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(data).toString("base64"),
  };
}

export async function decrypt(envelope, password) {
  if (envelope.version !== 1 || envelope.iterations !== iterations) throw new Error("Unsupported research file format.");
  const key = await keyFor(password, Buffer.from(envelope.salt, "base64"), envelope.iterations);
  const data = await subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(envelope.iv, "base64") }, key, Buffer.from(envelope.data, "base64"));
  return JSON.parse(new TextDecoder().decode(data));
}
