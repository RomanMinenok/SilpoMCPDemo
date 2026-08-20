import {
  Client,
  StreamableHTTPClientTransport
} from "@modelcontextprotocol/client";
import { normalizeOfflineOrders, normalizeOnlineOrders, withinPeriod } from "./normalize-orders.js";

const MCP_URL = new URL(process.env.SILPO_MCP_URL || "https://mcp.silpo.ua/mcp");
const CLIENT_NAME = "silpo-purchase-pulse";
const CLIENT_VERSION = "0.3.0";

export function createUserSession() {
  return {
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    state: crypto.randomUUID(),
    tokens: null,
    clientInformation: {},
    codeVerifier: null,
    discoveryState: null,
    authorizationUrl: null
  };
}

export async function startAuthorization(session, redirectUrl) {
  session.state = crypto.randomUUID();
  session.authorizationUrl = null;
  const connection = makeConnection(session, redirectUrl);

  try {
    await connection.client.connect(connection.transport);
    return { authenticated: true };
  } catch (error) {
    if (session.authorizationUrl) {
      return { authenticated: false, authorizationUrl: session.authorizationUrl };
    }
    throw new Error("Silpo MCP не розпочав авторизацію.", { cause: error });
  } finally {
    await closeConnection(connection);
  }
}

export async function finishAuthorization(session, callbackParams, redirectUrl) {
  if (!callbackParams.get("state") || callbackParams.get("state") !== session.state) {
    throw new Error("OAuth state не збігається.");
  }
  if (!session.codeVerifier || !Object.keys(session.clientInformation).length) {
    throw new Error("Сесію авторизації не знайдено. Почніть вхід ще раз.");
  }

  const connection = makeConnection(session, redirectUrl);
  try {
    await connection.transport.finishAuth(callbackParams);
  } finally {
    await closeConnection(connection);
    session.authorizationUrl = null;
    session.codeVerifier = null;
  }
}

export async function fetchPurchaseAnalytics(session, redirectUrl) {
  if (!session.tokens) return null;
  const connection = makeConnection(session, redirectUrl);

  try {
    await connection.client.connect(connection.transport);
    return await collectPurchaseAnalytics(connection.client);
  } finally {
    await closeConnection(connection);
  }
}

export function closeUserSession(session) {
  session.tokens = null;
  session.codeVerifier = null;
  session.discoveryState = null;
  session.authorizationUrl = null;
  session.clientInformation = {};
}

async function collectPurchaseAnalytics(client) {
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStartDate = new Date(now);
  periodStartDate.setUTCFullYear(periodStartDate.getUTCFullYear() - 1);
  const periodStart = periodStartDate.toISOString();
  const warnings = [];
  let offlineOrders = [];
  let onlineOrders = [];

  try {
    offlineOrders = await fetchOfflineOrders(client, periodStart, periodEnd);
  } catch {
    warnings.push("Не вдалося завантажити покупки з фізичних магазинів.");
  }

  try {
    onlineOrders = await fetchOnlineOrders(client, periodStart);
  } catch {
    warnings.push("Не вдалося завантажити онлайн-замовлення.");
  }

  return {
    source: "Silpo MCP · поточна сесія",
    generatedAt: now.toISOString(),
    periodStart,
    periodEnd,
    warnings,
    orders: withinPeriod(
      [...normalizeOfflineOrders(offlineOrders), ...normalizeOnlineOrders(onlineOrders)],
      periodStart,
      periodEnd
    )
  };
}

function makeConnection(session, redirectUrl) {
  const provider = createOAuthProvider(session, redirectUrl);
  const client = new Client(
    { name: CLIENT_NAME, version: CLIENT_VERSION },
    { versionNegotiation: { mode: "legacy" } }
  );
  const transport = new StreamableHTTPClientTransport(MCP_URL, { authProvider: provider });
  return { client, transport };
}

function createOAuthProvider(session, redirectUrl) {
  const redirectHost = new URL(redirectUrl).hostname;
  const localRedirect = redirectHost === "localhost" || redirectHost === "127.0.0.1";
  return {
    redirectUrl,
    clientMetadata: {
      client_name: "Сільпо / зріз",
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: localRedirect ? "native" : "web"
    },
    state: () => session.state,
    clientInformation: ({ issuer } = {}) => session.clientInformation[issuer || MCP_URL.origin],
    saveClientInformation: (information, { issuer } = {}) => {
      session.clientInformation[issuer || MCP_URL.origin] = information;
    },
    tokens: () => session.tokens || undefined,
    saveTokens: (tokens) => {
      session.tokens = tokens;
    },
    redirectToAuthorization: (authorizationUrl) => {
      session.authorizationUrl = authorizationUrl.toString();
    },
    saveCodeVerifier: (verifier) => {
      session.codeVerifier = verifier;
    },
    codeVerifier: () => {
      if (!session.codeVerifier) throw new Error("PKCE verifier не знайдено.");
      return session.codeVerifier;
    },
    saveDiscoveryState: (state) => {
      session.discoveryState = state;
    },
    discoveryState: () => session.discoveryState || undefined,
    invalidateCredentials: (scope) => {
      if (scope === "all" || scope === "tokens") session.tokens = null;
      if (scope === "all" || scope === "client") session.clientInformation = {};
      if (scope === "all" || scope === "verifier") session.codeVerifier = null;
      if (scope === "all" || scope === "discovery") session.discoveryState = null;
    }
  };
}

async function fetchOfflineOrders(client, dateStart, dateEnd) {
  const cartPointer = await callTool(client, "silpo_get_my_shopping_cart", {});
  const cartId = cartPointer.shoppingCartId;
  if (!cartId) throw new Error("Кошик користувача не знайдено.");

  const cartResponse = await callTool(client, "silpo_get_shopping_cart_by_id", { shoppingCartId: cartId });
  const cart = cartResponse.cart || {};
  const branchId = cart.shipments?.[0]?.branchId;
  const deliveryType = cart.deliveryType === "DeliveryExpressByPromise" ? "DeliveryHome" : cart.deliveryType;
  const timeslotStart = cart.timeslot?.start;
  const timeslotEnd = cart.timeslot?.end;
  if (!branchId || !deliveryType || !timeslotStart || !timeslotEnd) {
    throw new Error("У кошику бракує параметрів для історії офлайн-покупок.");
  }

  const orders = [];
  for (let offset = 0; offset < 500; offset += 10) {
    const page = await callTool(client, "silpo_get_my_offline_orders", {
      branchId,
      deliveryType,
      timeslotStart,
      timeslotEnd,
      dateStart,
      dateEnd,
      limit: 10,
      offset
    });
    orders.push(...(page.orders || []));
    if (orders.length >= Number(page.meta?.total || 0) || !(page.orders || []).length) break;
  }
  return orders;
}

async function fetchOnlineOrders(client, periodStart) {
  const orders = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const page = await callTool(client, "silpo_get_my_online_orders", { limit: 50, offset });
    const pageOrders = page.orders || [];
    orders.push(...pageOrders);
    const reachedOldOrders = pageOrders.some((order) => new Date(order.createdAt) < new Date(periodStart));
    if (orders.length >= Number(page.meta?.total || 0) || !pageOrders.length || reachedOldOrders) break;
  }
  return orders;
}

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const message = result.content?.find((item) => item.type === "text")?.text || `Silpo MCP tool failed: ${name}`;
    throw new Error(message);
  }
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) return {};
  return JSON.parse(text);
}

async function closeConnection({ client, transport }) {
  if (client) {
    try { await client.close(); } catch {}
  }
  if (transport) {
    try { await transport.close(); } catch {}
  }
}
