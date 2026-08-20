# Repository Guidelines

## Project Overview

This repository contains **Сільпо / зріз**, a local browser prototype for
personal Silpo purchase analytics. Every user authenticates directly with Silpo
MCP via OAuth. The repository and filesystem must never contain a user's
receipts, purchase history, account data, access tokens, refresh tokens, or
OAuth client credentials.

Node.js 20 or newer is required. Use the official @modelcontextprotocol/client
package for MCP transport and OAuth instead of implementing protocol details
manually.

## Project Structure & Module Organization

- src/index.html is the browser entry point.
- src/app.js owns UI state, navigation, and rendering.
- src/styles.css contains the responsive design system.
- src/server.mjs owns the local HTTP server, cookies, and in-memory sessions.
- src/lib/silpo-mcp.js contains the Silpo MCP client and OAuth provider.
- src/lib/normalize-orders.js allowlists MCP fields for the browser.
- src/lib/analytics.js contains pure aggregation helpers.
- tests/ contains Node test-runner coverage with synthetic fixtures only.

Keep the repository root limited to configuration and high-level documentation.
Do not commit dist/, node_modules/, caches, logs, secrets, or generated MCP
responses.

## Build, Test, and Development Commands

- npm run dev — serve at http://127.0.0.1:4173 with OAuth callback.
- npm test — run all Node test-runner tests.
- npm run lint — syntax-check every JavaScript module.
- npm run build — create the local runtime in dist/.

Set PORT to override the development port. Document new canonical commands in
both package.json and README.md.

## Privacy & Silpo MCP Rules

- Fetch purchases at runtime only after the current user completes OAuth.
- Keep tokens, OAuth registration data, and MCP responses in memory only.
- Use random HttpOnly cookies with SameSite=Lax; validate OAuth state.
- Never log authorization URLs, tokens, raw MCP responses, home addresses,
  account identifiers, or receipt URLs.
- Normalize MCP responses through an explicit allowlist before returning JSON
  to the browser.
- Do not add fallback snapshots, example exports, recorded responses, or real
  product histories to the repository.
- Test integrations with synthetic records whose names, IDs, dates, stores, and
  URLs are obviously fictional.
- Mark shopping bags as excluded so they do not affect analytics.
- Do not claim that historical prices are current catalog prices.

## Coding Style & Accessibility

Use ECMAScript modules and two-space indentation. Prefer small pure functions
for normalization and analytics. Use descriptive camelCase JavaScript names and
kebab-case CSS classes. Derive visuals from :root tokens and preserve keyboard
focus, meaningful alternative text, responsive behavior, and
prefers-reduced-motion support.

## Testing Guidelines

Add tests for analytics, normalization, privacy boundaries, OAuth state handling,
and regression fixes. Tests must never access a real Silpo account. Run npm test,
npm run lint, and npm run build before committing.

## Commits & Pull Requests

Use concise imperative commit subjects such as Add per-user Silpo OAuth flow.
Keep commits narrowly scoped. Pull requests should explain privacy impact, list
validation performed, and include screenshots for visual changes. Never commit
credentials or personal customer data.
