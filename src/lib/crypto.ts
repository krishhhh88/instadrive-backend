import crypto from "crypto";

const KEY_B64 = process.env.TOKEN_ENCRYPTION_KEY || "";
if (!KEY_B64) throw new Error("TOKEN_ENCRYPTION_KEY not set");
const KEY = Buffer.from(KEY_B64, "base64"); // expect 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload");
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const ct = Buffer.from(parts[2], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out.toString("utf8");
}
