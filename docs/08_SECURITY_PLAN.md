# Security

> Current security state. Most planned improvements have been implemented.
> Version: 1.0 | Last reviewed: 2026-07-25 | Status: ✅ Current | Prerequisites: 01

---

## Current State Assessment

| Area | Status | Notes |
|------|--------|-------|
| Authentication | ✅ Working | JWT access (15m) + refresh (7d), bcrypt, change-password |
| Authorization | ✅ Enforced | `roleMiddleware` on all routes + class-scoped access |
| JWT Secret | ✅ Working | Required via `JWT_SECRET` env var |
| XSS Protection | ✅ Partial | CSP headers set |
| CSRF Protection | ✅ Sufficient | CORS restricted + JSON content type |
| Input Validation | ✅ Good | Zod on all endpoints with trim/format |
| Rate Limiting | ✅ Partial | In-memory (resets on restart) |
| Security Headers | ✅ Good | CSP, HSTS, X-Frame-Options, etc. |
| Password Storage | ✅ Good | bcrypt with 10 rounds |
| Token Storage | ❌ Weak | localStorage (XSS-accessible) |

---

## Authentication

### Current
- `POST /api/auth/login` — validates username + password, tracks failedAttempts, auto-locks at 5
- `POST /api/auth/refresh` — accepts refresh token, returns new access token
- `POST /api/auth/change-password` — requires current password
- `GET /api/auth/me` — returns current user profile
- `mustChangePassword` flag — first login forces password change
- `tokenVersion` — validated on every request; increment forces logout

### Not Yet Implemented
- `POST /api/auth/logout` — invalidate refresh token
- `POST /api/auth/reset-password` — admin generates temp password

---

## Authorization (RBAC)

### Current
- 4 roles: `admin`, `chunhiem`, `phuta`, `phuhuynh`
- `roleMiddleware(...roles)` enforced on all protected endpoints
- Class-scoped access via `checkUserClassAccess()` for class-level roles

### Permission Matrix

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
| POST /api/auth/reset-password | ✅ | ✅ | ❌ | ❌ |
| GET /api/audit-logs | ✅ | ❌ | ❌ | ❌ |

---

## JWT

### Current
- Algorithm: HS256
- Secret: single `JWT_SECRET` env var
- Access token expiry: 15 minutes
- Refresh token expiry: 7 days
- Payload: `{ userId, username, role, parishId, tokenVersion }`
- `tokenVersion` validated against DB on every request

### Remaining
- Rotate refresh token on use (prevents replay)
- Consider RS256 (asymmetric) for public key verification

---

## XSS / CSRF / Input Validation

### Current
- CSP header set with `default-src 'self'`, `script-src 'self' 'unsafe-inline'`
- React handles JSX escaping by default
- CORS allows known origins with credentials
- State-changing requests use JSON body (not form-encoded)
- Zod schemas validate types, enums, trim strings, enforce max lengths
- No `dangerouslySetInnerHTML` usage

### Recommendations
- Add nonce-based CSP if moving to SSR
- Accept JSON-only CSRF protection (sufficient for current architecture)

---

## Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| General API | 30 requests | 60s |
| Auth Login | 10 requests | 60s |

Both in-memory (reset on restart). Acceptable for single-parish scale.

---

## Security Headers

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-XSS-Protection | `0` (disabled) |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` |

---

## Permission Model

Current: Role-based RBAC (4 roles), hardcoded in route middleware.
Future: Read from `permissions` + `role_permissions` tables (already seeded).

### Role → Permission Map (seeded)

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

### Implemented
- [x] `roleMiddleware` applied to all routes per matrix
- [x] Auth middleware on notification routes
- [x] `POST /api/auth/change-password`
- [x] `failedAttempts` tracking + auto-lock at 5
- [x] `tokenVersion` in JWT payload + DB validation
- [x] Body size limit (10MB)
- [x] Zod refinements (trim, max length)
- [x] IP + user_agent in audit logs
