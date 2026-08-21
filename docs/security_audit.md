# Security Audit

Audit date: 2026-08-21

Audited baseline: commit `964b427` (`Refine price chart labels`) with a clean worktree at the time of review. Uncommitted source changes that appeared after the audit are not covered by this report.

Scope: all tracked application source, configuration, tests, production dependencies, privacy boundaries, and security-relevant runtime behavior in the audited baseline. This was a read-only code audit; no production penetration testing was performed, and the local `.env` file was not inspected.

## Executive Summary

No critical vulnerabilities were identified. The audit found:

- 1 high-severity finding
- 3 medium-severity findings
- 5 low-severity findings

The highest-priority issue is unlimited anonymous session creation, which can exhaust the Redis store in production or process memory during local development. Session identifier rotation after OAuth and abuse controls for expensive MCP and OpenRouter requests should also be addressed promptly.

## Findings

### SEC-01: Unlimited anonymous session creation

Severity: High

Every API request without a valid cookie creates a new session identifier. `/api/session` persists that session, and `/api/analytics` also persists it before returning `AUTH_REQUIRED` to an unauthenticated caller.

Relevant code:

- `src/server.mjs:47`
- `src/server.mjs:50`
- `src/server.mjs:68`
- `src/server.mjs:135`
- `src/lib/session-store.js:41`

On Vercel, an attacker can create an unlimited number of eight-hour Redis entries and consume storage or request quotas. In local memory mode, expired entries are removed only when the same identifier is loaded again. One-time sessions can therefore remain in the `Map` indefinitely and exhaust process memory.

Recommended remediation:

- Do not persist an anonymous session until `/api/auth/start` requires OAuth state.
- Avoid creating a session for unknown routes, unsupported methods, and unauthenticated read-only requests.
- Add edge and application-level rate limiting.
- Use an LRU store or periodic cleanup for local memory sessions.
- Validate session identifiers against the expected base64url format and exact length before storage access.

### SEC-02: No abuse controls for expensive authenticated requests

Severity: Medium

Authenticated users can invoke MCP and OpenRouter endpoints without request, concurrency, or cost limits. A request for a high recent-purchase offset can cause the server to retrieve up to 500 offline and 500 online records through dozens of MCP calls. Commentary endpoints can repeatedly consume the application's OpenRouter quota.

Relevant code:

- `src/server.mjs:68`
- `src/server.mjs:73`
- `src/server.mjs:79`
- `src/server.mjs:88`
- `src/lib/silpo-mcp.js:128`
- `src/lib/silpo-mcp.js:229`
- `src/lib/silpo-mcp.js:271`

This can cause Vercel and OpenRouter costs, application denial of service, or throttling by Silpo MCP.

Recommended remediation:

- Apply per-session and per-IP rate limits with stricter limits for commentary endpoints.
- Limit concurrent MCP operations per session.
- Add explicit connection and tool-call timeouts.
- Reduce request amplification for deep pagination, for example by using upstream cursors when available.
- Return `429 Too Many Requests` with a bounded retry policy.

### SEC-03: Session identifier is not rotated after OAuth

Severity: Medium

The same session identifier is retained before, during, and after successful OAuth authorization. If an attacker can place a known session cookie in a victim's browser through a sibling-domain cookie injection or a separate client-side compromise, the authenticated session can remain accessible through the attacker's copy of the identifier.

Relevant code:

- `src/server.mjs:57`
- `src/server.mjs:62`
- `src/server.mjs:135`
- `src/lib/silpo-mcp.js:42`

OAuth state validation and PKCE are present, but they do not replace session identifier rotation as a defense against session fixation.

Recommended remediation:

- Generate a new random session identifier immediately after successful `finishAuth`.
- Save the authenticated state under the new identifier and delete the old session.
- Return a replacement cookie in the OAuth callback response.
- Prefer the `__Host-silpo_session` cookie name in production, with `Secure`, `Path=/`, and no `Domain` attribute.

### SEC-04: Vercel adapter buffers request bodies before enforcing the limit

Severity: Medium

The Vercel adapter calls `request.text()` for every non-GET and non-HEAD request. The shared server's 4,096-character limit is checked only after the complete body has already been buffered in memory. This also affects routes such as authentication start and logout that do not consume a request body.

Relevant code:

- `api/index.mjs:11`
- `api/index.mjs:15`
- `src/server.mjs:116`

Repeated large requests can unnecessarily consume serverless memory and execution time.

Recommended remediation:

- Reject a declared `Content-Length` above the accepted byte limit before reading.
- Read request bodies only for routes that require JSON.
- Enforce a streaming byte limit instead of relying on string length after buffering.
- Validate the expected `Content-Type` for JSON endpoints.

### SEC-05: Internal error messages are returned to clients

Severity: Low

The global error handler returns `error.message` for most failures. Errors from Redis, the MCP client, response normalization, or configuration can therefore expose internal implementation or infrastructure details.

Relevant code:

- `src/server.mjs:104`
- `src/server.mjs:112`

Recommended remediation:

- Return stable public error codes and generic user-facing messages.
- Keep diagnostic details in redacted server-side telemetry only.
- Never log tokens, authorization URLs, raw MCP responses, account identifiers, or receipt URLs.

### SEC-06: Browser security headers are incomplete

Severity: Low

Local static responses set `X-Content-Type-Options` and `Referrer-Policy`, but they do not set a Content Security Policy or framing restrictions. Production static files are served from the Vercel output directory and do not pass through the local static handler; `vercel.json` does not define equivalent headers.

Relevant code:

- `src/server.mjs:172`
- `src/server.mjs:181`
- `vercel.json:1`

Recommended remediation:

- Add deployment headers in `vercel.json` for all frontend assets and HTML routes.
- Define a restrictive `Content-Security-Policy`, including `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and `form-action 'self'`.
- Add `Permissions-Policy` and an appropriate production HSTS policy.
- Keep `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` consistent between local and production responses.

### SEC-07: State-changing requests do not validate request origin

Severity: Low

POST routes rely on `SameSite=Lax` without checking `Origin` or Fetch Metadata headers. SameSite mitigates ordinary cross-site requests, but it does not protect against hostile sibling domains that are considered same-site. Such a domain could force logout or disrupt an OAuth flow by replacing its pending state.

Relevant code:

- `src/server.mjs:57`
- `src/server.mjs:79`
- `src/server.mjs:88`
- `src/server.mjs:97`

Recommended remediation:

- Require `Origin` to match the configured application origin for state-changing requests.
- Reject inappropriate `Sec-Fetch-Site` values when the header is present.
- Keep OAuth callback state validation and `SameSite=Lax` as additional defenses.

### SEC-08: URL trust boundaries are broader than necessary

Severity: Low

`SILPO_MCP_URL` accepts any syntactically valid absolute URL, including unencrypted HTTP. Product image normalization allows any HTTPS hostname, and the browser loads those URLs directly. A compromised or incorrectly configured upstream could therefore direct OAuth traffic over an insecure channel or use per-user image URLs to disclose browser IP addresses and viewing times to third parties.

Relevant code:

- `src/lib/silpo-mcp.js:220`
- `src/lib/normalize-orders.js:64`
- `src/app.js:597`

Recommended remediation:

- Require HTTPS for MCP endpoints except explicit loopback development addresses.
- Validate `APP_ORIGIN` as HTTPS in production and reject credentials, paths, queries, and fragments.
- Allowlist official Silpo image CDN hostnames.
- Restrict `img-src` to the same allowlist in the Content Security Policy.

### SEC-09: Local environment file permissions are overly broad

Severity: Low

The local `.env` file is correctly ignored by Git and was not inspected during this audit. Its filesystem mode is `0644`, which may allow other local operating-system users to read its contents.

Recommended remediation:

- Set the file mode with `chmod 600 .env`.
- Keep all real values out of tracked files and deployment logs.
- Continue storing production secrets only in Vercel environment settings.

## Existing Security Controls

The following controls were confirmed:

- OAuth state is validated before finishing authorization.
- OAuth uses PKCE through the official `@modelcontextprotocol/client` package.
- Session identifiers contain 192 bits of randomness.
- Redis session payloads use AES-256-GCM authenticated encryption.
- Redis sessions have an eight-hour TTL.
- Session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` for HTTPS origins.
- Private API responses use `Cache-Control: no-store`.
- MCP data is normalized through an explicit browser-facing allowlist.
- Receipt URLs and tested account-related fields are removed during normalization.
- Product image URLs reject non-HTTPS schemes.
- Dynamic MCP and AI text is escaped before insertion into browser HTML.
- Commentary payloads are reduced to bounded product names and quantities or receipt frequencies.
- Shopping bags are excluded from analytics.
- Tracked tests use synthetic records only.
- No secrets or real purchase histories were found in tracked files.

No directly exploitable DOM XSS, path traversal, token exposure in browser JavaScript, unsafe CORS policy, or known vulnerable production dependency was identified.

## Validation Performed

- `npm test`: 24 tests passed.
- `npm run lint`: passed for every JavaScript module.
- `npm audit --omit=dev`: zero known vulnerabilities across production dependencies.
- Tracked-file secret-pattern scan: no credential material found.
- Generated frontend comparison: the existing `dist` frontend files match their source files byte for byte.
- The Git worktree remained unchanged while the audited baseline was being reviewed.

## Remediation Priority

1. Stop anonymous session persistence and add rate limiting.
2. Rotate the session identifier after successful OAuth.
3. Enforce request-body limits before buffering in the Vercel adapter.
4. Add cost and concurrency controls for MCP and OpenRouter calls.
5. Add production security headers and origin validation.
6. Reduce URL trust boundaries and return generic public errors.
7. Restrict local `.env` permissions.
