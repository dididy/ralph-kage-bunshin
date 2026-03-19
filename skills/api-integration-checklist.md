---
name: api-integration-checklist
description: Use when a project will call external APIs from the browser — checks CORS support, auth requirements, rate limits, and decides whether a proxy layer is needed before writing SPEC.md
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
# Standard request
curl -si "<API_BASE_URL>/any-endpoint" | grep -i "access-control"

# Also check preflight (some servers only respond to OPTIONS)
curl -si -X OPTIONS "<API_BASE_URL>/any-endpoint" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control"
```

| Result | Meaning |
|--------|---------|
| `access-control-allow-origin: *` or your domain | Browser fetch OK — no proxy needed |
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

## Step 5: Pagination & data volume

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

## Step 6: Rate limits & caching

```bash
# Check for rate limit headers
curl -si "<API_BASE_URL>/any-endpoint" | grep -i "x-ratelimit\|retry-after"
```

If no headers: assume unknown rate limit — record as such in SPEC.md and consider limiting concurrency.

| Caching option | When to use |
|----------------|-------------|
| **SWR / React Query** | Client-side deduplication, automatic revalidation |
| **Proxy-level cache** | Proxy caches upstream responses — reduces rate limit pressure from parallel requests |
| **None** | Real-time data where stale results are unacceptable |

## Step 7: Type safety

- Officially documented API with OpenAPI/Swagger → generate types from spec
- Undocumented / unstable API → receive as `unknown`, validate at runtime:

```ts
import { z } from 'zod'
const ItemSchema = z.object({ id: z.string(), url: z.string() })
const data = ItemSchema.parse(raw) // throws on unexpected shape — catches API changes early
```

Never use `any` for external API responses. If skipping zod, document the reason in SPEC.md.

## Step 8: Mock strategy & environment variables

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
- Proxy: <none | dev proxy only | Next.js Route Handler | Express | Edge Function>
- Response format: <JSON | NDJSON stream | other>
- Error format: <JSON object | inline NDJSON | HTTP status only | HTML>
- Pagination: <none | cursor (field: X) | offset/limit (max: N) | fixed limit N — no more>
- Rate limit: <N req/min | unknown — limit concurrency>
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
