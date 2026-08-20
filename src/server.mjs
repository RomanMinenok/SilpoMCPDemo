import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeUserSession,
  createUserSession,
  fetchPurchaseAnalytics,
  finishAuthorization,
  startAuthorization
} from "./lib/silpo-mcp.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const sessions = new Map();
const sessionTtl = 8 * 60 * 60 * 1000;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, safeOrigin(request));
    const session = getSession(request, response);
    session.lastSeenAt = Date.now();

    if (requestUrl.pathname === "/api/session" && request.method === "GET") {
      return json(response, 200, { authenticated: Boolean(session.tokens) });
    }
    if (requestUrl.pathname === "/api/auth/start" && request.method === "POST") {
      const result = await startAuthorization(session, `${safeOrigin(request)}/api/auth/callback`);
      return json(response, 200, result);
    }
    if (requestUrl.pathname === "/api/auth/callback" && request.method === "GET") {
      await finishAuthorization(session, requestUrl.searchParams, `${safeOrigin(request)}/api/auth/callback`);
      response.writeHead(302, { Location: "/#/" });
      return response.end();
    }
    if (requestUrl.pathname === "/api/analytics" && request.method === "GET") {
      const data = await fetchPurchaseAnalytics(session, `${safeOrigin(request)}/api/auth/callback`);
      return data ? json(response, 200, data) : json(response, 401, { error: "AUTH_REQUIRED" });
    }
    if (requestUrl.pathname === "/api/auth/logout" && request.method === "POST") {
      await closeUserSession(session);
      sessions.delete(session.id);
      clearCookie(response);
      return json(response, 200, { success: true });
    }
    if (requestUrl.pathname.startsWith("/api/")) return json(response, 404, { error: "NOT_FOUND" });

    return serveStatic(requestUrl.pathname, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Невідома помилка";
    if (request.url?.startsWith("/api/auth/callback")) {
      response.writeHead(302, { Location: "/?auth_error=1#/" });
      return response.end();
    }
    return json(response, 500, { error: "SERVER_ERROR", message });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Сільпо / зріз → http://127.0.0.1:${port}`);
  console.log("OAuth-токени зберігаються лише в пам’яті цього процесу.");
});

setInterval(() => {
  const oldest = Date.now() - sessionTtl;
  for (const [id, session] of sessions) {
    if (session.lastSeenAt < oldest) {
      closeUserSession(session).catch(() => {});
      sessions.delete(id);
    }
  }
}, 15 * 60 * 1000).unref();

function getSession(request, response) {
  const cookies = Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("=").map(decodeURIComponent))
      .filter(([key, value]) => key && value)
  );
  const existing = cookies.silpo_session && sessions.get(cookies.silpo_session);
  if (existing) return existing;

  const session = createUserSession();
  session.id = randomBytes(24).toString("base64url");
  sessions.set(session.id, session);
  response.setHeader("Set-Cookie", `silpo_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
  return session;
}

function safeOrigin(request) {
  const host = String(request.headers.host || "");
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowed.has(host)) return `http://127.0.0.1:${port}`;
  return `http://${host}`;
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

function clearCookie(response) {
  response.setHeader("Set-Cookie", "silpo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}
