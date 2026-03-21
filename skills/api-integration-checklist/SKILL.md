---
name: api-integration-checklist
description: Use before implementing any external API integration — verifies endpoints against live API, checks CORS support, auth/security requirements, rate limits, pagination, timeout, caching, and decides whether a proxy layer is needed. Run at design time to catch integration blockers before coding.
---

# /api-integration-checklist

Run this checklist before finalising architecture for any project that fetches data from a third-party API. Catches integration blockers at design time instead of runtime.

## Step 0: Verify endpoint documentation against live API

Before writing any code, confirm that every endpoint in the API docs (or `api.md`) actually works as documented. Documentation errors are the #1 source of wasted implementation cycles.

```bash
# For each documented endpoint, run a real curl and confirm:
# 1. Status 200 (or expected success code)
# 2. Parameters match exactly (name, casing, required vs optional)
# 3. Response shape matches documented schema

# Example — compare documented ?id= vs actual parameter name:
curl -si "https://api.example.com/search?id=abc123" | head -5
# vs
curl -si "https://api.example.com/search?i=abc123" | head -5
```

**Checklist — for each endpoint:**

| Check | How to verify |
|-------|---------------|
| URL path is correct | 200 vs 404 |
| Query parameter names are exact | Try the documented names — wrong names silently return wrong data or errors |
| Required parameters are identified | Omit each one — confirm the error |
| Response JSON keys match documented schema | `jq 'keys'` on the response |
| Any hidden required parameters (e.g. `nsfw=1`, `n=300`) | Compare different parameter combinations |

**If docs diverge from live API:**
- Update `api.md` / docs immediately — **never guess, never assume the docs are right**
- Record the correct parameters in `SPEC.md → External Dependencies`
- Do not start implementation until all endpoints are verified

> This step exists because undocumented or mis-documented API parameters (e.g. `?id=` when the actual param is `?i=`) will cause ExternalServiceBlock failures that workers cannot recover from without re-verification.

## Step 1: CORS check

```bash
# Standard GET request — simple requests skip preflight, so check CORS headers here too
curl -si "<API_BASE_URL>/any-endpoint" \
  -H "Origin: http://localhost:3000" | grep -i "access-control"

# Also check preflight (required for custom headers, non-simple methods)
curl -si -X OPTIONS "<API_BASE_URL>/any-endpoint" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control"
```

> **Check both.** Simple requests (GET, no custom headers) skip preflight — some APIs return CORS headers on GET but not OPTIONS, or vice versa. You need both to pass for non-trivial usage (custom headers, auth tokens).

| Result | Meaning |
|--------|---------|
| `access-control-allow-origin: *` or your domain on both | Browser fetch OK — no proxy needed |
| Header on GET but not OPTIONS | Simple requests work, but custom headers / auth will fail — **proxy likely needed** |
| No header on either request | CORS blocked — **proxy required** |

## Step 2: Response & error format

```bash
# Check success response
curl -si "<API_BASE_URL>/any-endpoint" | head -40

# Check error response (use a deliberately bad parameter)
curl -si "<API_BASE_URL>/any-endpoint?bad_param=xyz" | head -20
```

**Success response — check `Content-Type` and body shape:**

| Content-Type | Handling |
|---|---|
| `application/json` | Standard `JSON.parse()` |
| `application/x-ndjson` or `application/octet-stream` | Line-by-line — `text.split('\n').filter(Boolean).map(JSON.parse)` |
| Streaming / chunked | ReadableStream or accumulate with `response.text()` |
| `text/event-stream` (SSE) | `EventSource` API or `fetch` + ReadableStream line parser |
| WebSocket (`wss://`) | Separate connection — see CORS note below |

> **WebSocket / SSE:** These protocols have different CORS behavior. WebSocket connections are not subject to CORS (no preflight), but the server can check `Origin` header to reject. SSE follows standard CORS rules. If the API uses either, document the protocol in SPEC.md and design the client layer accordingly.

**Error response — document the actual shape:**

| Shape | Example | Risk |
|-------|---------|------|
| JSON error object | `{"error": "not found"}` | Safe to parse |
| Inline NDJSON | `{"kind": "error", "message": "..."}` in the stream | Must check `kind` field |
| HTTP status only | 404/500 with no body | `response.json()` will throw |
| HTML gateway error | `<html>502 Bad Gateway</html>` | `JSON.parse` will throw |

**Undocumented APIs:** treat both formats as unstable. Write a parser unit test against the actual observed shape — regressions surface at test time, not in production.

## Step 3: Security check

- **HTTPS only** — confirm the API base URL uses `https://`. Never send keys or session tokens over HTTP.
- **Secret key exposure** — will any API key end up in the client bundle?
  - Public read-only key → client-side OK
  - Secret / privileged key → server-side proxy required, regardless of CORS
- **Session cookies** — does the API authenticate via browser cookies?
  - Requires `credentials: 'include'` on fetch AND `withCredentials: true` on proxy
  - Proxy must forward `Cookie` header to upstream — verify end-to-end before committing
- **PII in responses** — does the API return personal data (emails, names, tokens)?
  - Never log or cache raw responses client-side if they contain PII
- **Origin/Referrer restrictions** — some APIs only allow calls from whitelisted domains. Test from your actual domain, not just localhost.
- **API key rotation** — if using secret keys in a proxy, plan for rotation:
  - Keys should come from env vars, never hardcoded
  - Document the rotation procedure (who rotates, how to deploy new key without downtime)
  - Consider dual-key support during rotation window (old + new key both valid)

## Step 4: Proxy decision

If CORS is blocked **or** a secret key is required, pick a proxy layer and lock it in SPEC.md:

| Option | When to use |
|--------|-------------|
| **Dev server proxy** (Vite `server.proxy`, Next.js rewrites) | Dev-only — does **NOT** work in production builds |
| **Next.js Route Handler** | Full-stack Next.js project |
| **Express / Hono proxy server** | SPA that needs a production backend |
| **Cloudflare Worker / Vercel Edge Function** | Serverless, no backend infra |

> Dev proxy covers local development only. Production always needs a separate solution — choose it upfront, not after deployment.

See `vercel-react-best-practices` for Server Components / Route Handler patterns when using Next.js.

## Step 5: Resilience

Decide upfront what happens when the external API is down — this is independent of whether you use a proxy:

| Pattern | When to use |
|---------|-------------|
| **Fallback UI** | Show cached/stale data or "service unavailable" message — never a blank screen |
| **Circuit breaker** | After N consecutive failures, stop calling the API for a cooldown period — prevents cascading failures |
| **Graceful degradation** | Feature that depends on the API is disabled, rest of the app works normally |

> Document the degradation behavior in SPEC.md. "What does the user see when the API is down?" must have an answer before implementation starts.

## Step 6: Pagination & data volume

```bash
# Check if response includes pagination metadata
curl -s "<API_BASE_URL>/any-endpoint" | head -5
```

| Pattern | What to check |
|---------|---------------|
| Fixed `limit=N` | Is N always enough? If the API provides no cursor, clients cannot fetch more — document this constraint in SPEC.md |
| Cursor-based | Does the response include a next cursor? Document the field name. |
| Offset/limit | Confirm max page size — exceeding it often silently truncates |

If infinite scroll is a UI requirement, the data fetching layer must support pagination from day one — retrofitting is expensive.

## Step 7: Rate limits & retry

```bash
# Check for rate limit headers
curl -si "<API_BASE_URL>/any-endpoint" | grep -i "x-ratelimit\|retry-after"
```

If no headers: assume unknown rate limit — record as such in SPEC.md and consider limiting concurrency.

**Retry & backoff strategy** — decide upfront how the client handles `429` or `5xx`:

| Strategy | When to use |
|----------|-------------|
| **Exponential backoff** | Default for all external APIs — `delay = min(baseDelay * 2^attempt, maxDelay)` with jitter |
| **`Retry-After` header** | If the API provides it, always respect it over your own backoff |
| **No retry** | Idempotency-unsafe mutations (POST that creates a resource) — retry causes duplicates |

```ts
// Minimal retry with exponential backoff + jitter
async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(10_000),
    })
    if (response.ok) return response

    const isRetryable = response.status === 429 || response.status >= 500
    if (attempt === maxRetries || !isRetryable) {
      throw new Error(`HTTP ${response.status}`)
    }

    const retryAfter = response.headers.get('Retry-After')
    const delay = retryAfter
      ? parseRetryAfter(retryAfter)
      : Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 1000
    await new Promise(r => setTimeout(r, delay))
  }
  throw new Error('Unreachable') // satisfies TypeScript — loop always returns or throws above
}

// Retry-After can be seconds ("120") or HTTP-date ("Wed, 21 Oct 2025 07:28:00 GMT")
function parseRetryAfter(value: string): number {
  const seconds = Number(value)
  if (!Number.isNaN(seconds)) return seconds * 1000
  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.max(date - Date.now(), 0)
  return 5000 // fallback if unparseable
}
```

## Step 8: Timeout

Every external fetch must have a timeout. Unbounded requests block UI and exhaust connection pools.

| Method | Browser support | How |
|--------|----------------|-----|
| **`AbortSignal.timeout(ms)`** | Chrome 103+, Firefox 100+, Safari 16+ | `fetch(url, { signal: AbortSignal.timeout(10_000) })` |
| **`AbortController` + `setTimeout`** | All modern browsers | Manual setup — use when targeting Safari < 16 or SSR runtimes without `AbortSignal.timeout` |
| **Proxy-level timeout** | N/A (server-side) | Set on the proxy server (e.g. `proxyTimeout: 15000` in Vite, `timeout` in Express) |

> Default recommendation: **10s for reads, 30s for writes/uploads.** Adjust based on observed API latency from Step 0. Document chosen timeouts in SPEC.md.

## Step 9: Caching

| Caching option | When to use |
|----------------|-------------|
| **SWR / React Query** | Client-side deduplication, automatic revalidation |
| **Proxy-level cache** | Proxy caches upstream responses — reduces rate limit pressure from parallel requests |
| **None** | Real-time data where stale results are unacceptable |

## Step 10: Type safety

- Officially documented API with OpenAPI/Swagger → generate types from spec
- Undocumented / unstable API → receive as `unknown`, validate at runtime:

```ts
import { z } from 'zod'
const ItemSchema = z.object({ id: z.string(), url: z.string() })
const data = ItemSchema.parse(raw) // throws on unexpected shape — catches API changes early
```

Never use `any` for external API responses. If skipping zod, document the reason in SPEC.md.

## Step 11: Mock strategy & environment variables

**Mock strategy** — mandatory if API has no CORS support or requires auth (tests must never hit the live API):

| Option | When to use |
|--------|-------------|
| **MSW (Mock Service Worker)** | Browser + test runner, intercepts at network level — best for integration tests |
| **`vi.mock` / `jest.mock`** | Unit tests only, mocking the API module directly |
| **Fixture JSON files** | Static response snapshots in `src/test/fixtures/` |
| **Mock env flag** | Env var switches to fixture data at runtime for offline dev / CI |

**Environment variables** — define upfront and commit a `.env.example`:

```bash
# .env.example — commit this, never commit .env.local
API_BASE_URL=https://api.example.com    # server-side (no prefix)
NEXT_PUBLIC_API_URL=https://...         # Next.js client-side
VITE_API_BASE_URL=https://...           # Vite client-side
USE_MOCK=false                          # set true for offline dev / CI
```

Rules:
- `NEXT_PUBLIC_` / `VITE_` prefix = exposed to browser bundle — **never put secrets here**
- Secret keys go in `.env.local` (gitignored), accessed server-side only
- All contributors must use the same variable names — define the canonical list in SPEC.md

## Output: add to SPEC.md

```markdown
## External Dependencies
- API: <name> — <base URL>
- HTTPS: yes / no
- CORS: supported / not supported
- Auth: <none | public key | secret key (server-side only) | session cookies>
- Key rotation: <env var swap | dual-key window | N/A (no secret key)>
- Proxy: <none | dev proxy only | Next.js Route Handler | Express | Edge Function>
- Protocol: <REST | SSE | WebSocket>
- Response format: <JSON | NDJSON stream | SSE | other>
- Error format: <JSON object | inline NDJSON | HTTP status only | HTML>
- Pagination: <none | cursor (field: X) | offset/limit (max: N) | fixed limit N — no more>
- Rate limit: <N req/min | unknown — limit concurrency>
- Retry: <exponential backoff | Retry-After | none (unsafe mutation)>
- Timeout: <read Ns | write Ns>
- Resilience: <fallback UI | circuit breaker | graceful degradation>
- Caching: <SWR | proxy cache | none>
- Type validation: <zod | none — reason: X>
- Mock strategy: <MSW | vi.mock | fixture files | mock env flag>
- Env vars: <list> (see .env.example)
- PII in responses: yes / no
```

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Dev proxy assumed to work in production | Choose a production proxy solution upfront |
| Secret key in client-side env var (`VITE_`, `NEXT_PUBLIC_`) | Move to server-side, use proxy |
| Skipping CORS check, discovering it at runtime | Always run Step 1 before writing SPEC |
| "It worked in Postman / curl" | Both ignore CORS — browsers enforce it |
| Session-cookie API, cookies not forwarded through proxy | `credentials: 'include'` + `changeOrigin: true` + forward `Cookie` header |
| Trusting docs without curl-verifying parameters | Run Step 0 — parameter names in docs are often wrong (`?id=` vs `?i=`) |
| Parsing undocumented API without verifying format | curl the endpoint first, write a parser unit test |
| Tests hitting the live API | No CORS or auth = mock is mandatory |
| `any` typed API response | Use `unknown` + zod — API shape changes break silently with `any` |
| Fixed `limit=N` API + infinite scroll requirement | Document the constraint before building UI — no retrofit path |
| No `.env.example` committed | Future contributors (or workers) won't know what vars are needed |
| No timeout on `fetch` calls | Add `AbortSignal.timeout(10_000)` — unbounded requests block UI and exhaust connections |
| 429 response crashes the app | Implement exponential backoff with jitter — respect `Retry-After` header if present |
| No plan for API downtime | Define fallback UI / graceful degradation before implementation — "blank screen" is not acceptable |
| Retrying non-idempotent mutations | POST that creates resources must not retry — duplicates are worse than failures |
| WebSocket assumed to need CORS proxy | WebSocket is not subject to CORS preflight — server checks `Origin` header directly |
| API key hardcoded, no rotation plan | Keys in env vars, document rotation procedure, consider dual-key window |
