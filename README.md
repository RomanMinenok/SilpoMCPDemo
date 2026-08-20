# Silpo / Pulse

A browser prototype for personal purchase analytics powered by Silpo MCP. The
application shows a user's top 10 products for a selected period (seven days,
one, two, three, or six months, or one year) and a detailed purchase history
for each product.

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

#### Environment Variables Detected During Import

Vercel may show **5 Detected** because it reads the variable names from
`.env.example`. The empty values in that file are intentional: it is a safe
template and does not contain deployable credentials.

| Variable | Required | Where the value comes from | Vercel environments |
| --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Yes | Added automatically by the Vercel Upstash integration, or copied from the database's **REST API** section in the Upstash Console | Production and Preview |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Added automatically by the integration, or copied as the standard `UPSTASH_REDIS_REST_TOKEN` from the database's **REST API** section | Production and Preview |
| `SESSION_SECRET` | Yes | Generated locally; it is not supplied by Vercel, Upstash, or Silpo | Production and Preview |
| `APP_ORIGIN` | Recommended for production | The final public HTTPS origin shown by Vercel after the first deployment, for example `https://silpo-mcp-demo.vercel.app` | Production only |
| `SILPO_MCP_URL` | No | The public Silpo MCP endpoint; the application already defaults to `https://mcp.silpo.ua/mcp` | Leave unset unless overriding the endpoint |

Some Vercel storage integrations provide `KV_REST_API_URL` and
`KV_REST_API_TOKEN` instead of the two `UPSTASH_REDIS_REST_*` names. The
application supports both pairs; only one complete pair is required. If both
exist, the Vercel-managed `KV_REST_API_*` pair takes precedence. The application
does not use `KV_URL`, `REDIS_URL`, or `KV_REST_API_READ_ONLY_TOKEN`.

If this form is shown before the first deployment:

1. Supply the two Upstash values only if a database has already been created.
2. Generate and supply `SESSION_SECRET` as described below.
3. Remove or leave `APP_ORIGIN` empty until Vercel assigns the production
   domain. Add it after the first deployment and scope it to Production only.
4. Remove or leave `SILPO_MCP_URL` empty. If the form requires a value, use
   `https://mcp.silpo.ua/mcp`.

Never paste any of these values into source files, `.env.example`, GitHub, build
logs, screenshots, or browser-side code.

### 2. Connect a Free Upstash Redis Database

1. Open **Vercel Project → Storage → Create Database**.
2. Choose **Upstash for Redis** from the Marketplace.
3. Sign in to Upstash or create an account, then select the **Free** plan.
4. Create a Redis database and connect it to this Vercel project.
5. Enable the required environments: at least **Production**, plus **Preview**
   if pull request deployments should work.

Depending on the integration version, it automatically adds one of these
equivalent pairs:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

or:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

If the integration is connected before deployment, do not create these
variables manually. Open **Vercel Project → Settings → Environment Variables**
and confirm that one complete pair exists for Production and Preview. When the
managed `KV_REST_API_*` pair already exists, manually added
`UPSTASH_REDIS_REST_*` duplicates may be removed.

To configure them manually instead:

1. Open the database in the [Upstash Console](https://console.upstash.com/).
2. Find the **REST API** or **Connect** section.
3. Copy the HTTPS endpoint into `UPSTASH_REDIS_REST_URL`.
4. Copy the standard token into `UPSTASH_REDIS_REST_TOKEN`.

The application creates, refreshes, and deletes session keys, so it requires
the standard token rather than the read-only token. Keep the token marked as
sensitive. Do not copy either value into the repository or `vercel.json`. See
the official [Upstash REST API documentation](https://upstash.com/docs/redis/features/restapi)
for the current console location.

### 3. Add `SESSION_SECRET`

Generate a secret locally:

    openssl rand -base64 48

If OpenSSL is unavailable, use Node.js:

    node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"

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

Copy the domain from the production deployment or from **Vercel Project →
Settings → Domains**, then add the `https://` scheme. Use only the origin: do
not include a path, query string, fragment, or trailing slash. It is usually
best to leave `APP_ORIGIN` unset for Preview deployments so the application can
use the current `*.vercel.app` domain for its OAuth callback automatically.
When using a custom domain, set `APP_ORIGIN` to its HTTPS origin instead.

You do not need to set `SILPO_MCP_URL` when using the built-in default endpoint
at https://mcp.silpo.ua/mcp. This value is not a credential. Only add the
variable when intentionally connecting to a different compatible endpoint.

### 5. Redeploy and Verify

After connecting the integration or changing environment variables, trigger a
**Redeploy**. Then verify that:

1. The home page opens successfully.
2. `GET /api/session` returns `encrypted-redis` as its `sessionStore` value.
3. The **Sign in with Silpo** button opens the `mcp.silpo.ua` domain.
4. The current user's purchases load after the OAuth callback.
5. Signing out deletes both the Redis session and the HttpOnly cookie.

If the API returns HTTP 500, first confirm that all three required variables
are present: `SESSION_SECRET` plus either the `KV_REST_API_*` pair or the
`UPSTASH_REDIS_REST_*` pair. Also remove `SILPO_MCP_URL` temporarily to use the
built-in endpoint and confirm that `APP_ORIGIN` is a valid HTTPS origin without
a path or trailing slash.

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
- The optional comic commentary sends only the current top-product names and
  their receipt frequencies to OpenRouter after the user explicitly requests it.
  It is never stored by this application.
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
- `src/lib/openrouter-commentary.js` creates the optional, on-demand comic
  commentary without exposing its API key to the browser.
- `api/index.mjs` exposes the Node.js Vercel Function.
- `vercel.json` defines the build, API rewrites, and function timeout.
- `tests/` contains synthetic fixtures only; real purchases are prohibited.

Products are ranked by the number of receipts in which they appear, and
shopping bags are excluded. This makes weighted and unit-based products
comparable.
