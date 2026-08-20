# Silpo / Pulse

A browser prototype for personal purchase analytics powered by Silpo MCP. The
application shows a user's top 10 products from the previous 12 months and a
detailed purchase history for each product.

The repository **does not contain receipts, purchases, tokens, or account
data**. Each user signs in to their own Silpo account through OAuth, and the
application fetches data separately for that user's temporary session.

## Local Development

Node.js 20 or newer is required.

    npm install
    npm run dev

Open http://127.0.0.1:4173, select **Sign in with Silpo**, and complete the
authorization flow. To use another port:

    PORT=3000 npm run dev

Redis is not required for local development. The server uses a temporary
in-memory store that is cleared completely when the process stops.

## Deploying to Vercel

### 1. Import the Repository

1. In Vercel, select **Add New → Project**.
2. Import the `RomanMinenok/SilpoMCPDemo` GitHub repository.
3. Keep **Framework Preset: Other** and set the root directory to `./`.
4. The build and output settings are already defined in `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Start the first deployment. The API will become operational after Redis and
   the session secret are configured in the following steps.

### 2. Connect a Free Upstash Redis Database

1. Open **Vercel Project → Storage → Create Database**.
2. Choose **Upstash for Redis** from the Marketplace.
3. Sign in to Upstash or create an account, then select the **Free** plan.
4. Create a Redis database and connect it to this Vercel project.
5. Enable the required environments: at least **Production**, plus **Preview**
   if pull request deployments should work.

The integration automatically adds these environment variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Do not copy their values into the repository or `vercel.json`.

### 3. Add `SESSION_SECRET`

Generate a secret locally:

    openssl rand -base64 48

In Vercel, open **Settings → Environment Variables**, create
`SESSION_SECRET`, and paste the generated value. Mark it as sensitive and add
it to the Production and Preview environments. The value must contain at least
32 characters.

The secret encrypts OAuth sessions with AES-256-GCM before they are written to
Redis. Changing it invalidates every active session.

### 4. Set the Production URL

After Vercel assigns a domain, add this variable to the **Production**
environment:

    APP_ORIGIN=https://your-project.vercel.app

Do not include a trailing slash. It is usually best to leave `APP_ORIGIN`
unset for Preview deployments so the application can use the current
`*.vercel.app` domain for its OAuth callback automatically. When using a custom
domain, set `APP_ORIGIN` to its HTTPS origin instead.

You do not need to set `SILPO_MCP_URL` when using the default endpoint at
https://mcp.silpo.ua/mcp.

### 5. Redeploy and Verify

After connecting the integration or changing environment variables, trigger a
**Redeploy**. Then verify that:

1. The home page opens successfully.
2. `GET /api/session` returns `encrypted-redis` as its `sessionStore` value.
3. The **Sign in with Silpo** button opens the `mcp.silpo.ua` domain.
4. The current user's purchases load after the OAuth callback.
5. Signing out deletes both the Redis session and the HttpOnly cookie.

If the API returns HTTP 500, first confirm that all three required variables
are present: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and
`SESSION_SECRET`.

## Commands

- `npm run dev` — start the local server and OAuth callback.
- `npm test` — run analytics, normalization, and session-store tests.
- `npm run lint` — syntax-check the JavaScript modules.
- `npm run build` — create the static frontend output in `dist/` for Vercel.

## Privacy Model

- The official MCP client handles OAuth 2.1 with PKCE.
- Each browser receives a random HttpOnly session cookie with `SameSite=Lax`.
- During local development, OAuth state exists only in the Node.js process
  memory.
- On Vercel, OAuth state and tokens are encrypted with AES-256-GCM and stored in
  Redis for no longer than eight hours.
- Purchase history is never cached in Redis and is fetched from Silpo MCP for
  each request.
- The server does not write MCP responses to disk or include them in logs.
- Signing out deletes the session; inactive sessions expire after eight hours.
- Home addresses, electronic receipt URLs, and account data are never returned
  to the browser.

## Architecture

- `src/app.js` manages authentication and loading states, plus the two client
  screens.
- `src/server.mjs` provides the local HTTP server, sessions, and OAuth callback.
- `src/lib/silpo-mcp.js` provides the OAuth provider and Silpo MCP calls.
- `src/lib/session-store.js` provides in-memory or Redis storage and session
  encryption.
- `src/lib/normalize-orders.js` converts MCP responses into an allowlisted UI
  model.
- `src/lib/analytics.js` performs pure top-product and summary aggregation.
- `api/index.mjs` exposes the Node.js Vercel Function.
- `vercel.json` defines the build, API rewrites, and function timeout.
- `tests/` contains synthetic fixtures only; real purchases are prohibited.

Products are ranked by the number of receipts in which they appear, and
shopping bags are excluded. This makes weighted and unit-based products
comparable.
