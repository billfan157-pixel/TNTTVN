# Security Plan

---

## Current State Assessment

| Area | Status | Issue |
|------|--------|-------|
| Authentication | ✅ Working | JWT access (15m) + refresh (7d), bcrypt passwords |
| Authorization | ❌ Broken | `roleMiddleware` defined but never used |
| JWT Secret | ✅ Working | Required via `JWT_SECRET` env var |
| XSS Protection | ✅ Partial | CSP headers set, but `'unsafe-inline'` on script-src |
| CSRF Protection | ❌ Missing | No CSRF tokens, no SameSite cookies |
| Input Validation | ✅ Partial | Zod on endpoints, but no sanitization |
| Rate Limiting | ✅ Partial | In-memory (resets on restart) |
| Security Headers | ✅ Good | CSP, HSTS, X-Frame-Options, etc. |
| Password Storage | ✅ Good | bcrypt with 10 rounds |
| Token Storage | ❌ Weak | localStorage (XSS-accessible) |

---

## Authentication

### Current
- `POST /api/auth/login` — validates username + password against bcrypt hash
- `POST /api/auth/refresh` — accepts refresh token, returns new access token
- `GET /api/auth/me` — returns current user profile
- No logout endpoint
- No password change endpoint

### Changes Needed

| Change | Priority | Effort | Risk |
|--------|----------|--------|------|
| Add `POST /api/auth/logout` — invalidate refresh token | 🟡 High | 1h | Low |
| Add `POST /api/auth/change-password` — require current password | 🔴 Critical | 2h | Medium |
| Add `POST /api/auth/reset-password` — admin-only, generates temp | 🟡 High | 2h | Medium |
| Force password change on first login (`mustChangePassword` flag) | 🟡 High | 2h | Low |
| Add tracking: `failedAttempts`, `lastLoginAt`, `lockedUntil` | 🟡 High | 1h | Low |
| Auto-lock account after 5 consecutive failed logins | 🟡 High | 1h | Low |

---

## Authorization (RBAC)

### Current
- 4 roles defined: `admin`, `chunhiem`, `phuta`, `phuhuynh`
- `roleMiddleware(...roles)` function exists (server/src/middleware/auth.ts:52-59)
- **No route uses it** — all routes only check `authMiddleware`

### Target Permission Matrix

| Endpoint | admin | chunhiem | phuta | phuhuynh |
|----------|-------|----------|-------|----------|
| GET /api/students | ✅ | ✅ | ✅ (own class) | ✅ (own children) |
| POST /api/students | ✅ | ✅ | ❌ | ❌ |
| PUT /api/students/:id | ✅ | ✅ | ❌ | ❌ |
| DELETE /api/students/:id | ✅ | ❌ | ❌ | ❌ |
| GET /api/grades | ✅ | ✅ | ✅ (own class) | ✅ (own children) |
| POST /api/grades | ✅ | ✅ | ✅ (own class) | ❌ |
| POST /api/grades/batch | ✅ | ✅ | ✅ (own class) | ❌ |
| GET /api/attendance | ✅ | ✅ | ✅ (own class) | ✅ (own children) |
| POST /api/attendance | ✅ | ✅ | ✅ (own class) | ❌ |
| POST /api/attendance/batch | ✅ | ✅ | ✅ (own class) | ❌ |
| GET /api/notices | ✅ | ✅ | ✅ | ✅ |
| POST /api/notices | ✅ | ✅ | ❌ | ❌ |
| DELETE /api/notices/:id | ✅ | ✅ | ❌ | ❌ |
| GET /api/users | ✅ | ❌ | ❌ | ❌ |
| POST /api/users | ✅ | ❌ | ❌ | ❌ |
| PUT /api/users/:id | ✅ | ❌ | ❌ | ❌ |
| POST /api/auth/reset-password | ✅ | ✅ (own class) | ❌ | ❌ |
| POST /api/backup/* | ✅ | ❌ | ❌ | ❌ |

### Implementation

1. Apply `roleMiddleware` to all existing routes according to matrix above
2. For class-scoped roles (phuta), implement `classScopeMiddleware(classId)` that verifies user has assignment to the requested class
3. For parent-scoped role (phuhuynh), implement `parentScopeMiddleware(studentId)` that verifies student's parentPhone matches user's phone

---

## JWT

### Current
- Algorithm: HS256 (default)
- Secret: single `JWT_SECRET` env var
- Access token expiry: 15 minutes
- Refresh token expiry: 7 days
- Payload: `{ userId, username, role, parishId }`

### Changes Needed

| Change | Reason | Effort |
|--------|--------|--------|
| Add `tokenVersion` to JWT payload | Force logout capability | 1h |
| Add `iat` usage check | Optional: detect token issuance before password change | 0.5h |
| Rotate refresh token on use | Prevent refresh token replay | 2h |
| Consider RS256 (asymmetric) | Allow public key verification without secret | 4h (optional) |

---

## XSS

### Current
- CSP header set with `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` (unsafe-inline needed for Vite dev + some inline scripts)
- React handles JSX escaping by default
- No server-side HTML rendering

### Recommendations
1. Keep `'unsafe-inline'` for now (React requires it for dev, and for prod it's needed for bundled scripts)
2. Add `nonce`-based CSP when moving to SSR or if stricter policy needed
3. Ensure no `dangerouslySetInnerHTML` usage in codebase
4. Validate all user input even if React escapes output (backend should sanitize too)

---

## CSRF

### Current
- No CSRF protection
- CORS allows `http://localhost:5173`, `http://localhost:4173` with credentials
- State-changing requests use JSON body (not form-encoded)

### Recommendations
1. **Option A (Recommended)**: Use custom header `X-CSRF-Token` — frontend reads token from meta tag or cookie, sends as header; backend validates
2. **Option B**: Use `SameSite=Strict` cookie for refresh token, but requires migrating from localStorage
3. **Option C**: Accept `Content-Type: application/json` as CSRF protection (browsers block cross-origin JSON POST without CORS preflight)

Given CORS is already restricted to localhost dev origins, and production will have a single origin, **Option C is sufficient** for this application. No immediate CSRF changes needed.

---

## Input Validation

### Current
- Zod schemas on POST/PUT endpoints validate types, required fields, enums
- No HTML sanitization (React handles output encoding)
- No file upload validation (not yet implemented)

### Recommendations
1. Add Zod refinement for business rules (e.g., grade score 0-10)
2. Add `trim()` to string inputs
3. Add max length constraints to all string fields
4. Add email/phone format validation where applicable

---

## Rate Limiting

### Current
- General API: 30 requests/minute/IP (in-memory Map)
- Auth login: 10 requests/minute/IP (separate counter)
- Both reset on server restart

### Recommendations
1. Accept in-memory rate limiting for current scale (single parish)
2. Add persistent rate limiting (DB-backed) only if deployed to multi-tenant or public internet
3. Consider adding per-endpoint limits (e.g., backup endpoint: 1/minute)

---

## Security Headers

### Current (Good)
| Header | Value | Status |
|--------|-------|--------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` | ✅ |
| X-Content-Type-Options | `nosniff` | ✅ |
| X-Frame-Options | `DENY` | ✅ |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | ✅ |
| Referrer-Policy | `strict-origin-when-cross-origin` | ✅ |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | ✅ |

### No Changes Needed
Headers are comprehensive. Only consider adding `X-XSS-Protection: 0` (already present) and `Cross-Origin-Embedder-Policy` if deploying with shared resources.

---

## Permission Model

### Current
- Hardcoded role string check (4 roles)
- No granular permissions
- No permission assignment UI

### Target
- Keep role-based RBAC (4 roles) for Phase 1
- Create `permissions` + `role_permissions` tables (schema only)
- Seed with full matrix for 4 roles
- Middleware checks role hardcoded for now; future: read from `role_permissions`

### Role → Permission Seed Map

```
admin:     all permissions
chunhiem:  student.read, student.create, student.edit, grade.read, grade.create,
           grade.edit, attendance.read, attendance.create, attendance.edit,
           notice.read, notice.create, notice.delete, user.read, user.reset-password
phuta:     student.read (own class), grade.read (own class), grade.edit (own class),
           attendance.read (own class), attendance.create (own class),
           attendance.edit (own class), notice.read
phuhuynh:  student.read (own children), grade.read (own children),
           attendance.read (own children), notice.read
```

---

## Immediate Actions (Priority Order)

| # | Action | Phase | Effort | Impact |
|---|--------|-------|--------|--------|
| 1 | Apply `roleMiddleware` to all routes | Phase 2 | 2h | Prevents unauthorized access |
| 2 | Add auth middleware to notification routes | Phase 1 | 30m | Closes public endpoints |
| 3 | Add `POST /api/auth/change-password` | Phase 6 | 2h | Allows password rotation |
| 4 | Add `failedAttempts` tracking + auto-lock | Phase 6 | 1h | Prevents brute force |
| 5 | Add `tokenVersion` to JWT payload | Phase 6 | 1h | Force logout capability |
| 6 | Add body size limit middleware | Phase 2 | 30m | Prevents abuse |
| 7 | Add Zod refinements (trim, max length, phone format) | Phase 2 | 1h | Input hygiene |
