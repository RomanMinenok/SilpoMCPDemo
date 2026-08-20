import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeUserSession,
  createUserSession,
  fetchPurchaseAnalytics,
  finishAuthorization,
  startAuthorization
} from "./lib/silpo-mcp.js";
import {
  deleteSession,
  loadSession,
  saveSession,
  sessionStoreMode
} from "./lib/session-store.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export async function handleRequest(request, response) {
  try {
    const origin = safeOrigin(request);
    const requestUrl = new URL(request.url, origin);

    if (!requestUrl.pathname.startsWith("/api/")) {
      return serveStatic(requestUrl.pathname, response);
    }

    const session = await getSession(request, response, origin);
    session.lastSeenAt = Date.now();

    if (requestUrl.pathname === "/api/session" && request.method === "GET") {
      await saveSession(session);
      return json(response, 200, {
        authenticated: Boolean(session.tokens),
        sessionStore: sessionStoreMode()
      });
    }
    if (requestUrl.pathname === "/api/auth/start" && request.method === "POST") {
      const result = await startAuthorization(session, `${origin}/api/auth/callback`);
      await saveSession(session);
      return json(response, 200, result);
    }
    if (requestUrl.pathname === "/api/auth/callback" && request.method === "GET") {
      await finishAuthorization(session, requestUrl.searchParams, `${origin}/api/auth/callback`);
      await saveSession(session);
      response.writeHead(302, { Location: "/#/", "Cache-Control": "no-store" });
      return response.end();
    }
    if (requestUrl.pathname === "/api/analytics" && request.method === "GET") {
      const data = await fetchPurchaseAnalytics(session, `${origin}/api/auth/callback`);
      await saveSession(session);
      return data ? json(response, 200, data) : json(response, 401, { error: "AUTH_REQUIRED" });
    }
    if (requestUrl.pathname === "/api/auth/logout" && request.method === "POST") {
      closeUserSession(session);
      await deleteSession(session.id);
      clearCookie(response, origin);
      return json(response, 200, { success: true });
    }
    return json(response, 404, { error: "NOT_FOUND" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Невідома помилка";
    if (request.url?.startsWith("/api/auth/callback")) {
      response.writeHead(302, { Location: "/?auth_error=1#/", "Cache-Control": "no-store" });
      return response.end();
    }
    return json(response, 500, { error: "SERVER_ERROR", message });
  }
}

async function getSession(request, response, origin) {
  const cookies = parseCookies(request.headers.cookie);
  const existing = await loadSession(cookies.silpo_session);
  if (existing) return existing;

  const session = createUserSession();
  session.id = randomBytes(24).toString("base64url");
  response.setHeader("Set-Cookie", sessionCookie(session.id, origin));
  return session;
}

function safeOrigin(request) {
  if (process.env.APP_ORIGIN) {
    const configured = new URL(process.env.APP_ORIGIN);
    return configured.origin;
  }

  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "");
  const protocol = String(request.headers["x-forwarded-proto"] || "http").split(",")[0];
  if (host === `127.0.0.1:${port}` || host === `localhost:${port}`) {
    return `http://${host}`;
  }
  if (process.env.VERCEL === "1" && protocol === "https" && /^[a-z0-9-]+\.vercel\.app$/iu.test(host)) {
    return `https://${host}`;
  }
  return `http://127.0.0.1:${port}`;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim().split("=").map(decodeURIComponent))
      .filter(([key, value]) => key && value)
  );
}

async function serveStatic(pathname, response) {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, safePath === "/" ? "index.html" : safePath);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(root, "index.html");
  }
  const body = await readFile(file);
  response.writeHead(200, {
    "Content-Type": mime[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  response.end(body);
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function sessionCookie(id, origin) {
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  return `silpo_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`;
}

function clearCookie(response, origin) {
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `silpo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  );
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  createServer(handleRequest).listen(port, "127.0.0.1", () => {
    console.log(`Сільпо / зріз → http://127.0.0.1:${port}`);
    console.log(`OAuth session store → ${sessionStoreMode()}`);
  });
}
