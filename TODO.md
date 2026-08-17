# TODO - Đồng bộ logic lấy Client IP (Plan B)

## Mục tiêu
Tạo SSOT helper `getClientIp(c)` và áp dụng cho toàn bộ rate limiters + các routes ghi audit logs.

## Các bước

- [x] 1. Tạo helper `getClientIp(c: Context)` trong `server/src/utils/ip.ts`
- [x] 2. Cập nhật `server/src/middleware/security.ts` — áp dụng helper cho 4 rate limiters (`rateLimiter`, `loginRateLimiter`, `refreshRateLimiter`, `purgeRateLimiter`)
- [x] 3. Cập nhật các routes ghi audit logs dùng `getClientIp(c)`:
  - [x] `server/src/routes/students.ts`
  - [x] `server/src/routes/grades.ts`
  - [x] `server/src/routes/attendance.ts`
  - [x] `server/src/routes/classes.ts`
  - [x] `server/src/routes/users.ts`
  - [x] `server/src/routes/notices.ts`
  - [x] `server/src/routes/exams.ts`
  - [x] `server/src/routes/promotion.ts`
  - [x] `server/src/routes/settings.ts` (không có logic lấy IP — không cần sửa)
  - [x] `server/src/routes/semesterLocks.ts`
  - [x] `server/src/routes/import.ts`
  - [x] Các routes khác (auth, academicYears, parents, reporting, system, backup, auditLogs, notifications) — không có logic lấy IP trực tiếp, không cần sửa
- [x] 4. Chạy build server — ✅ Các file đã sửa không có lỗi. Phát hiện 9 lỗi pre-existing (không liên quan) ở DrizzleAttendanceRepository, DrizzlePromotionRepository, AcademicYearLifecycleService, attendanceService (lỗi type DbTransaction/SQLiteTransaction)
- [x] 5. Viết & chạy test cho helper + rate limiters:
  - [x] `server/src/__tests__/ip-helper.test.ts` — 8 test cho `getClientIp` (ưu tiên cf-connecting-ip, x-real-ip, split x-forwarded-for, trim, fallback unknown) ✅ pass
  - [x] `server/src/__tests__/rate-limiter.test.ts` — 5 test cho `loginRateLimiter`, `refreshRateLimiter`, `purgeRateLimiter` (chặn sau ngưỡng, chống bypass qua X-Forwarded-For spoof) ✅ pass
  - [x] Tổng cộng: 2 test files, 13 tests đều pass
