// Browser-to-browser handoff: only public keys and ciphertext enter URL fragments.
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function pair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
}
async function shared(privateKey, publicJwk) {
  const publicKey = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function createHandoff() {
  const keys = await pair();
  return { publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey), privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey) };
}
export async function sealHandoff(publicKey, payload, nonce) {
  const keys = await pair(),
    key = await shared(keys.privateKey, publicKey),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(nonce) },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return { publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey), iv: encode(iv), data: encode(data) };
}
export async function openHandoff(privateJwk, packet, nonce) {
  const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const key = await shared(privateKey, packet.publicKey);
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(packet.iv), additionalData: new TextEncoder().encode(nonce) },
        key,
        decode(packet.data)
      )
    )
  );
}
