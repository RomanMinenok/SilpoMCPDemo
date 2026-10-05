import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const SESSION_ID_BYTES = 24;
export const MAX_MEMORY_SESSIONS = 1_000;
export const AUTH_START_RATE_LIMIT = 5;
export const AUTH_START_GLOBAL_RATE_LIMIT = 120;
export const AUTH_START_RATE_WINDOW_SECONDS = 10 * 60;
const MAX_MEMORY_AUTH_RATE_KEYS = 5_000;
const memorySessions = new Map();
const memoryAuthStarts = new Map();
const memoryRateLimitSalt = randomBytes(32);
let memoryGlobalAuthStarts = { count: 0, resetAt: 0 };
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

export function sessionStoreMode() {
  if (redis) return "encrypted-redis";
  return "memory";
}

export function assertSessionStoreConfigured() {
  if (process.env.VERCEL === "1" && !redis) {
    throw new Error(
      "Vercel потребує KV_REST_API_URL/KV_REST_API_TOKEN або відповідні UPSTASH_REDIS_REST змінні."
    );
  }
  if (redis && String(process.env.SESSION_SECRET || "").length < 32) {
    throw new Error("SESSION_SECRET має містити щонайменше 32 символи.");
  }
}

export async function loadSession(id) {
  assertSessionStoreConfigured();
  if (!isValidSessionId(id)) return null;

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
  memorySessions.delete(id);
  memorySessions.set(id, entry);
  return structuredClone(entry.session);
}

export async function saveSession(session) {
  assertSessionStoreConfigured();
  if (!isValidSessionId(session?.id)) {
    throw new Error("Session identifier is invalid.");
  }
  const serializable = structuredClone(session);

  if (redis) {
    const sealed = sealSession(serializable, process.env.SESSION_SECRET);
    await redis.set(sessionKey(session.id), sealed, { ex: SESSION_TTL_SECONDS });
    return;
  }

  pruneMemorySessions();
  memorySessions.delete(session.id);
  while (memorySessions.size >= MAX_MEMORY_SESSIONS) {
    memorySessions.delete(memorySessions.keys().next().value);
  }
  memorySessions.set(session.id, {
    session: serializable,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  });
}

export async function deleteSession(id) {
  if (!isValidSessionId(id)) return;
  if (redis) {
    await redis.del(sessionKey(id));
    return;
  }
  memorySessions.delete(id);
}

export async function consumeAuthStartAllowance(clientIdentifier, now = Date.now()) {
  const fingerprint = rateLimitFingerprint(clientIdentifier);
  const windowMilliseconds = AUTH_START_RATE_WINDOW_SECONDS * 1000;
  pruneMemoryAuthStarts(now);
  const current = memoryAuthStarts.get(fingerprint);
  const clientWindow = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMilliseconds };
  clientWindow.count += 1;
  memoryAuthStarts.delete(fingerprint);
  while (memoryAuthStarts.size >= MAX_MEMORY_AUTH_RATE_KEYS) {
    memoryAuthStarts.delete(memoryAuthStarts.keys().next().value);
  }
  memoryAuthStarts.set(fingerprint, clientWindow);

  if (memoryGlobalAuthStarts.resetAt <= now) {
    memoryGlobalAuthStarts = { count: 0, resetAt: now + windowMilliseconds };
  }
  memoryGlobalAuthStarts.count += 1;

  return {
    allowed: clientWindow.count <= AUTH_START_RATE_LIMIT
      && memoryGlobalAuthStarts.count <= AUTH_START_GLOBAL_RATE_LIMIT,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((Math.max(clientWindow.resetAt, memoryGlobalAuthStarts.resetAt) - now) / 1000)
    )
  };
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

export function isValidSessionId(id) {
  return typeof id === "string"
    && id.length === Math.ceil(SESSION_ID_BYTES * 4 / 3)
    && /^[A-Za-z0-9_-]+$/u.test(id);
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

function rateLimitFingerprint(clientIdentifier) {
  return createHmac("sha256", memoryRateLimitSalt)
    .update(String(clientIdentifier || "unknown").slice(0, 256))
    .digest("base64url");
}

function pruneMemorySessions(now = Date.now()) {
  for (const [id, entry] of memorySessions) {
    if (entry.expiresAt < now) memorySessions.delete(id);
  }
}

function pruneMemoryAuthStarts(now) {
  for (const [fingerprint, entry] of memoryAuthStarts) {
    if (entry.resetAt <= now) memoryAuthStarts.delete(fingerprint);
  }
}
