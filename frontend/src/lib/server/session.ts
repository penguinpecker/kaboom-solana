import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Use first 32 bytes of HOUSE_AUTHORITY_KEY as AES-256 key
let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) {
    const raw = process.env.HOUSE_AUTHORITY_KEY;
    if (!raw) throw new Error("Missing HOUSE_AUTHORITY_KEY");
    const arr = JSON.parse(raw);
    _key = Buffer.from(arr.slice(0, 32));
  }
  return _key;
}

export interface SessionData {
  player: string;
  mineCount: number;
  mineLayout: number;
  salt: string; // hex
  commitment: string; // hex
  reveals: number[];
  createdAt: number;
}

export function encryptSession(data: SessionData): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: iv(12) + tag(16) + encrypted
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSession(token: string): SessionData {
  const key = getKey();
  const buf = Buffer.from(token, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
