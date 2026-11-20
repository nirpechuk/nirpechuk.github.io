export function createHandoff(): Promise<{ publicKey: JsonWebKey; privateKey: JsonWebKey }>;
export function sealHandoff(publicKey: JsonWebKey, payload: unknown, nonce: string): Promise<{ publicKey: JsonWebKey; iv: string; data: string }>;
export function openHandoff(privateKey: JsonWebKey, packet: { publicKey: JsonWebKey; iv: string; data: string }, nonce: string): Promise<unknown>;
