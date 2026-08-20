import test from "node:test";
import assert from "node:assert/strict";
import { sealSession, unsealSession } from "../src/lib/session-store.js";
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
  assert.match(response.headers.get("set-cookie"), /^silpo_session=/);
});

test("restores API paths supplied by the Vercel rewrite", async () => {
  const request = new Request(
    "https://example.test/api?__silpo_api_path=session"
  );
  const response = await handleWebRequest(request);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).sessionStore, "memory");
});
