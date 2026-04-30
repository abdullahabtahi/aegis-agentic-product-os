# Plan — 001 CORS Fix & Demo Stability

**Created:** April 2026  
**Revised:** April 2026 — scoped for hackathon context

---

## Approach

Single workstream. One functional bug (CORS) + one deployment reliability fix (`BACKEND_URL` hardcoded fallback).

**~~Workstream A — Authentication~~** — DEFERRED (judge friction)  
**Workstream B — CORS fix** (backend `main.py` only, ~5 lines)  
**~~Workstream C — Rate limiting + Debug gating~~** — DEFERRED (judge friction)

---

## Files to Change

### Workstream B — CORS Fix

**`backend/app/main.py`** (lines ~97–107)

Current (broken):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,   # can be ["*"]
    allow_credentials=True,           # ALWAYS True — browser rejects this with wildcard
    ...
)
```

Fix — decouple `allow_credentials` from `allow_origins`:
```python
_has_wildcard = "*" in _allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=not _has_wildcard,   # False when wildcard, True when explicit
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### BACKEND_URL Fallback Fix

**`frontend/lib/constants.ts`**

Current:
```ts
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
```

Add a dev-only console warning when `NEXT_PUBLIC_BACKEND_URL` is unset so it's visible during deployment rather than silently routing to localhost.

**`frontend/.env.example`**  
Ensure `NEXT_PUBLIC_BACKEND_URL=https://your-cloud-run-url` is documented.

---

## Design Decisions

- **No auth for hackathon:** Judges need zero-config access. The original pre-shared bearer token design (see audit) is the right post-hackathon fix.
- **CORS is a functional bug, not just a security concern:** Wildcard + credentials is rejected by the browser's CORS preflight before any server logic runs. The demo literally cannot work without this fix.
- **`allow_credentials=False` with wildcard is safe:** Wildcard without credentials is the correct browser-allowed combination for public APIs. All cookie-free XHR/fetch works fine.

