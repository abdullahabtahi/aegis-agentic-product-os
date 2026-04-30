# Tasks — 001 CORS Fix & Demo Stability

**Created:** April 2026  
**Revised:** April 2026 — scoped for hackathon context  
**Convention:** [P] = can run in parallel with other [P] tasks.

> **Deferred (post-hackathon):** Phase 0 (key rotation), Phase 1 (bearer auth), Phase 3 (rate limiting + debug gating).  
> These are the right fixes for production but add judge friction. See spec.md for rationale.

---

## Phase 1 — CORS Fix (browser blocker — do first)

**Bug:** `allow_origins=["*"]` + `allow_credentials=True` coexist. All modern browsers reject this combination — credentialed requests fail with a CORS error before they reach any endpoint.

### TDD — Write tests first (RED)
- [ ] Write `tests/unit/test_cors.py`:
  - `test_wildcard_disables_credentials` — when `ALLOWED_ORIGINS=*`, `allow_credentials` must be `False`
  - `test_explicit_origins_enable_credentials` — when `ALLOWED_ORIGINS` is a real URL list, `allow_credentials` is `True`
  - `test_cors_config_never_has_wildcard_and_credentials` — assert the two can never coexist
- [ ] Run tests → confirm RED

### Implementation (GREEN)
- [ ] `backend/app/main.py` — split `allow_credentials` from `allow_origins`:
  - If `"*" in _allowed_origins` → `allow_credentials=False`
  - Else → `allow_credentials=True`
- [ ] Run tests → confirm GREEN

### Verify
- [ ] `curl -I http://localhost:8000/health` → response has no CORS error
- [ ] Browser DevTools (localhost:3000 → localhost:8000) → no `CORS policy` errors in console

---

## Phase 2 — `NEXT_PUBLIC_BACKEND_URL` Hardcoded Fallback (H6)

**Bug:** `frontend/lib/constants.ts` falls back to `http://localhost:8000` when `NEXT_PUBLIC_BACKEND_URL` is unset. In a deployed Cloud Run environment this silently routes all API calls to localhost — a dead address.

### Implementation
- [ ] Confirm `NEXT_PUBLIC_BACKEND_URL` is set in `frontend/.env.local` (and `.env.example`) pointing to the deployed backend URL
- [ ] `frontend/lib/constants.ts` — add a startup warning log when `NEXT_PUBLIC_BACKEND_URL` is not set in a non-localhost context
- [ ] Same check for `BACKEND_URL` in `frontend/app/api/copilotkit/route.ts`

### Verify
- [ ] `npm run build` → no type errors
- [ ] Deployed app: Network tab shows API calls going to the Cloud Run URL, not localhost

---

## Phase 3 — Final Validation

- [ ] Run `uv run pytest tests/unit/test_cors.py -v` → all GREEN
- [ ] Run `uv run pytest tests/unit -v` → no regressions
- [ ] `npm run build` → 0 errors
- [ ] Mark spec 001 as **Closed**
