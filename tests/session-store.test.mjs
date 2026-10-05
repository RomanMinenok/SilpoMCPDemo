import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_START_RATE_LIMIT,
  consumeAuthStartAllowance,
  deleteSession,
  isValidSessionId,
  loadSession,
  MAX_MEMORY_SESSIONS,
  saveSession,
  sealSession,
  unsealSession
} from "../src/lib/session-store.js";
import { createUserSession } from "../src/lib/silpo-mcp.js";
import vercelHandler, { handleWebRequest } from "../api/index.mjs";

const secret = "synthetic-test-secret-with-more-than-thirty-two-characters";

test("encrypts session state without exposing token values", () => {
  const session = {
    id: "synthetic-session",
    tokens: { access_token: "synthetic-access-token" },
    state: "synthetic-state"
  };
  const sealed = sealSession(session, secret);

  assert.equal(sealed.includes("synthetic-access-token"), false);
  assert.deepEqual(unsealSession(sealed, secret), session);
});

test("rejects modified encrypted sessions", () => {
  const sealed = sealSession({ id: "synthetic-session" }, secret);
  const replacement = sealed.endsWith("a") ? "b" : "a";
  assert.throws(() => unsealSession(sealed.slice(0, -1) + replacement, secret));
});

test("creates a JSON-serializable OAuth session", () => {
  const session = createUserSession();
  assert.doesNotThrow(() => JSON.stringify(session));
  assert.deepEqual(session.clientInformation, {});
});

test("exposes a Vercel Web Handler", () => {
  assert.equal(vercelHandler.fetch, handleWebRequest);
});

test("adapts Vercel Web requests to the shared HTTP handler", async () => {
  const response = await handleWebRequest(new Request("https://example.test/api/session"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.authenticated, false);
  assert.equal(body.sessionStore, "memory");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("restores API paths supplied by the Vercel rewrite", async () => {
  const request = new Request(
    "https://example.test/api?__silpo_api_path=session"
  );
  const response = await handleWebRequest(request);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).sessionStore, "memory");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("does not create sessions for anonymous reads or unsupported requests", async () => {
  const cases = [
    [new Request("https://example.test/api/analytics"), 401],
    [new Request("https://example.test/api/recent-purchases?offset=20"), 401],
    [new Request("https://example.test/api/missing"), 404],
    [new Request("https://example.test/api/session", { method: "POST" }), 404],
    [new Request("https://example.test/api/session", {
      headers: { Cookie: "silpo_session=invalid" }
    }), 200]
  ];

  for (const [request, expectedStatus] of cases) {
    const response = await handleWebRequest(request);
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("validates session identifiers before storage access", async () => {
  const validId = Buffer.alloc(24, 7).toString("base64url");

  assert.equal(isValidSessionId(validId), true);
  assert.equal(isValidSessionId("too-short"), false);
  assert.equal(isValidSessionId(`${validId.slice(0, -1)}%`), false);
  assert.equal(await loadSession("too-short"), null);
  await assert.rejects(saveSession({ id: "too-short" }), /identifier is invalid/u);
});

test("bounds the local session store with least-recently-used eviction", async () => {
  const ids = [];
  for (let index = 0; index <= MAX_MEMORY_SESSIONS; index += 1) {
    const bytes = Buffer.alloc(24);
    bytes.writeUInt32BE(index, 20);
    const id = bytes.toString("base64url");
    ids.push(id);
    await saveSession({ id, synthetic: true });
  }

  assert.equal(await loadSession(ids[0]), null);
  assert.deepEqual(await loadSession(ids.at(-1)), { id: ids.at(-1), synthetic: true });
  await Promise.all(ids.map((id) => deleteSession(id)));
});

test("rate limits repeated OAuth session creation attempts", async () => {
  const client = "synthetic-rate-limit-client";
  const now = Date.now();

  for (let attempt = 0; attempt < AUTH_START_RATE_LIMIT; attempt += 1) {
    assert.equal((await consumeAuthStartAllowance(client, now)).allowed, true);
  }
  const rejected = await consumeAuthStartAllowance(client, now);

  assert.equal(rejected.allowed, false);
  assert.ok(rejected.retryAfterSeconds > 0);
});
