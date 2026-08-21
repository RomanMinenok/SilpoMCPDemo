import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeUserSession,
  createUserSession,
  fetchPurchaseAnalytics,
  fetchRecentPurchasePage,
  finishAuthorization,
  startAuthorization
} from "./lib/silpo-mcp.js";
import {
  deleteSession,
  loadSession,
  saveSession,
  sessionStoreMode
} from "./lib/session-store.js";
import {
  CommentaryError,
  createReceiptCommentary,
  createTopProductsCommentary,
  sanitizeReceiptItems,
  sanitizeTopProducts
} from "./lib/openrouter-commentary.js";

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
      response.writeHead(302, { Location: "/", "Cache-Control": "no-store" });
      return response.end();
    }
    if (requestUrl.pathname === "/api/analytics" && request.method === "GET") {
      const data = await fetchPurchaseAnalytics(session, `${origin}/api/auth/callback`);
      await saveSession(session);
      return data ? json(response, 200, data) : json(response, 401, { error: "AUTH_REQUIRED" });
    }
    if (requestUrl.pathname === "/api/recent-purchases" && request.method === "GET") {
      const offset = boundedInteger(requestUrl.searchParams.get("offset"), 0, 490, 0);
      const data = await fetchRecentPurchasePage(session, `${origin}/api/auth/callback`, { offset, limit: 10 });
      await saveSession(session);
      return data ? json(response, 200, data) : json(response, 401, { error: "AUTH_REQUIRED" });
    }
    if (requestUrl.pathname === "/api/top-products-commentary" && request.method === "POST") {
      if (!session.tokens) return json(response, 401, { error: "AUTH_REQUIRED" });
      const body = await readJson(request);
      const products = sanitizeTopProducts(body?.products);
      if (!products.length) return json(response, 400, { error: "INVALID_PRODUCTS", message: "Немає товарів для коментаря." });
      const commentary = await createTopProductsCommentary(products, origin);
      await saveSession(session);
      return json(response, 200, { commentary });
    }
    if (requestUrl.pathname === "/api/receipt-commentary" && request.method === "POST") {
      if (!session.tokens) return json(response, 401, { error: "AUTH_REQUIRED" });
      const body = await readJson(request);
      const items = sanitizeReceiptItems(body?.items);
      if (!items.length) return json(response, 400, { error: "INVALID_ITEMS", message: "Немає товарів для коментаря." });
      const commentary = await createReceiptCommentary(items, origin);
      await saveSession(session);
      return json(response, 200, { commentary });
    }
    if (requestUrl.pathname === "/api/auth/logout" && request.method === "POST") {
      closeUserSession(session);
      await deleteSession(session.id);
      clearCookie(response, origin);
      return json(response, 200, { success: true });
    }
    return json(response, 404, { error: "NOT_FOUND" });
  } catch (error) {
    const message = error instanceof CommentaryError
      ? error.message
      : error instanceof Error ? error.message : "Невідома помилка";
    if (request.url?.startsWith("/api/auth/callback")) {
      response.writeHead(302, { Location: "/?auth_error=1", "Cache-Control": "no-store" });
      return response.end();
    }
    return json(response, 500, { error: "SERVER_ERROR", message });
  }
}

async function readJson(request) {
  const body = typeof request.body === "string" ? request.body : await readRequestBody(request);
  if (!body || body.length > 4096) throw new CommentaryError("Не вдалося прочитати запит для коментаря.");
  try {
    return JSON.parse(body);
  } catch {
    throw new CommentaryError("Не вдалося прочитати запит для коментаря.");
  }
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new CommentaryError("Не вдалося прочитати запит для коментаря.");
  }
  return body;
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

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  createServer(handleRequest).listen(port, "127.0.0.1", () => {
    console.log(`Сільпо / зріз → http://127.0.0.1:${port}`);
    console.log(`OAuth session store → ${sessionStoreMode()}`);
  });
}
