import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const memorySessions = new Map();
const redisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
const redis = redisConfigured ? Redis.fromEnv() : null;

export function sessionStoreMode() {
  if (redis) return "encrypted-redis";
  return "memory";
}

export function assertSessionStoreConfigured() {
  if (process.env.VERCEL === "1" && !redis) {
    throw new Error(
      "Vercel потребує UPSTASH_REDIS_REST_URL і UPSTASH_REDIS_REST_TOKEN."
    );
  }
  if (redis && String(process.env.SESSION_SECRET || "").length < 32) {
    throw new Error("SESSION_SECRET має містити щонайменше 32 символи.");
  }
}

export async function loadSession(id) {
  assertSessionStoreConfigured();
  if (!id) return null;

  if (redis) {
    const sealed = await redis.get(sessionKey(id));
    if (typeof sealed !== "string") return null;
    try {
      return unsealSession(sealed, process.env.SESSION_SECRET);
    } catch {
      await redis.del(sessionKey(id));
      return null;
    }
  }

  const entry = memorySessions.get(id);
  if (!entry || entry.expiresAt < Date.now()) {
    memorySessions.delete(id);
    return null;
  }
  return structuredClone(entry.session);
}

export async function saveSession(session) {
  assertSessionStoreConfigured();
  const serializable = structuredClone(session);

  if (redis) {
    const sealed = sealSession(serializable, process.env.SESSION_SECRET);
    await redis.set(sessionKey(session.id), sealed, { ex: SESSION_TTL_SECONDS });
    return;
  }

  memorySessions.set(session.id, {
    session: serializable,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  });
}

export async function deleteSession(id) {
  if (!id) return;
  if (redis) {
    await redis.del(sessionKey(id));
    return;
  }
  memorySessions.delete(id);
}

export function sealSession(session, secret) {
  const key = encryptionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function unsealSession(value, secret) {
  const payload = Buffer.from(value, "base64url");
  if (payload.length < 29) throw new Error("Пошкоджена сесія.");
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}

function encryptionKey(secret) {
  if (String(secret || "").length < 32) {
    throw new Error("SESSION_SECRET має містити щонайменше 32 символи.");
  }
  return createHash("sha256").update(secret).digest();
}

function sessionKey(id) {
  return `silpo-pulse:session:${id}`;
}
