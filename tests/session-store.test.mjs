import test from "node:test";
import assert from "node:assert/strict";
import { sealSession, unsealSession } from "../src/lib/session-store.js";
import { createUserSession } from "../src/lib/silpo-mcp.js";

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
