# Spec — 001 CORS Fix & Demo Stability

**Created:** April 2026  
**Revised:** April 2026 — scoped down for hackathon context  
**Status:** Open  
**Audit findings addressed:** C3 (CORS)

> **Hackathon scope note:** Auth (C2), key rotation (C1), rate limiting (H3), and debug gating (H4) are deferred. Adding auth would require judges to configure tokens to test the project — too much friction. The one fix that is _not optional_ is CORS: the `allow_origins=["*"]` + `allow_credentials=True` combination is rejected by all modern browsers, which means the frontend cannot make credentialed requests and the demo breaks.

---

## User Stories

### ~~P1-US-01: Authenticated Write Endpoints~~ — DEFERRED (judge friction)

> Skipped for hackathon. Judges need zero-config access. Post-hackathon: add `Depends(verify_token)` per original spec.

---

### ~~P1-US-02: API Keys Rotated and Removed from Filesystem~~ — DEFERRED

> Skipped. Ensure `.env` is in `.gitignore` and not committed. Post-hackathon: move to GCP Secret Manager.

---

### P1-US-03: CORS Correctly Configured
As a system owner, I want CORS configured so that credentialed cross-origin requests are only allowed from known origins.

**Acceptance Scenarios:**
- Given `ALLOWED_ORIGINS=https://aegis.example.com` → request from that origin succeeds
- Given request from unknown origin with credentials → browser rejects (CORS header absent)
- Given `allow_credentials=True` + `allow_origins=["*"]` → this combination must not exist in any code path
- Given `AEGIS_LOCAL_DEV=true` → wildcard allowed but `allow_credentials=False`

**Edge cases:**
- `ALLOWED_ORIGINS` not set in prod → startup log warning; wildcard used without credentials
- Multiple origins in `ALLOWED_ORIGINS` (comma-separated) → each validated correctly
- Preflight `OPTIONS` request → 200 with correct headers

---

### ~~P2-US-04: Rate Limiting on Expensive Endpoints~~ — DEFERRED (judge friction)

> Skipped. Judges running repeated pipeline scans would hit 429s. Post-hackathon: add `slowapi`.

---

### ~~P2-US-05: Debug Endpoints Gated~~ — DEFERRED

> Skipped. `/diag/linear` is useful for judges to verify Linear connectivity. Post-hackathon: add `DEBUG_ENABLED` gate.

---

### P2-US-06: Security Headers on All Responses
As a system owner, I want security headers on all backend responses so that browsers enforce content policies.

**Acceptance Scenarios:**
- Given any response from the backend → `X-Content-Type-Options: nosniff` is present
- Given any response → `X-Frame-Options: DENY` is present
- Given HTTPS response → `Strict-Transport-Security: max-age=63072000` is present
- Given Next.js page response → `Content-Security-Policy` header is present

---

## Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| ~~FR-001~~ | ~~FastAPI `Depends(verify_token)` on all write endpoints~~ | DEFERRED |
| ~~FR-002~~ | ~~`API_TOKEN` startup assertion~~ | DEFERRED |
| ~~FR-003~~ | ~~`.env` placeholders only~~ | DEFERRED |
| FR-004 | `allow_credentials=True` only when `ALLOWED_ORIGINS` is an explicit non-wildcard list | **Active** |
| ~~FR-005~~ | ~~`slowapi` rate limiter~~ | DEFERRED |
| ~~FR-006~~ | ~~Debug routes gated by `DEBUG_ENABLED`~~ | DEFERRED |
| FR-007 | Security headers middleware added to FastAPI app | Optional |
| FR-008 | `next.config.ts` `headers()` with `X-Frame-Options`, `X-Content-Type-Options` | Optional |

---

## Success Criteria

| ID | Criteria |
|---|---|
| SC-001 | `curl -X POST /interventions/any-id/approve` with no token → 401 |
| SC-002 | `git log --all -- backend/.env` shows no real credential values |
| SC-003 | Browser console shows no CORS errors when frontend calls backend from correct origin |
| SC-004 | 11 rapid calls to `/bets/discover` → 429 on 11th |
| SC-005 | `curl /debug/agent-test` in prod (no DEBUG_ENABLED) → 404 |
| SC-006 | `curl -I /debug/ping` → response includes `X-Content-Type-Options: nosniff` |
