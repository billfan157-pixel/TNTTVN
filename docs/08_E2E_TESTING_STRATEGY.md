# Catevia E2E Testing Strategy

> Version: 1.0 | Last reviewed: 2026-09-01 | Status: Current | Decision: ADR-093

## 1. Mục tiêu và ranh giới

Bộ E2E bảo vệ một tập nhỏ các user journey có thiệt hại production cao. Một test chỉ thuộc critical portfolio khi nó đi qua ít nhất hai boundary thực (UI, HTTP, authorization, database hoặc offline queue) và xác minh outcome nghiệp vụ, không chỉ xác minh page/button render.

E2E không thay thế:

- unit test cho công thức điểm, state machine, OMR detector/geometry và pure domain rules;
- integration test cho transaction, tenant query, migration, idempotency, conflict resolution và error matrix lớn;
- accessibility matrix, visual capture và field qualification trên camera/thiết bị thật.

## 2. Kiến trúc harness

```text
Playwright action qua UI
        │
        ▼
Vite :3100 ── /api proxy ──► Hono :3101 ──► SQLite sandbox riêng từng run
        │                         │
        └── Dexie syncQueue       └── RBAC + tenant + domain services thật
```

- `scripts/e2e-dev.mjs` tạo database UUID trong OS temp, owner marker và endpoint chỉ trên `127.0.0.1`.
- Harness scrub mọi remote/Turso environment, không đọc server `.env`, seed trước khi phát `READY`, và cleanup bằng reporter.
- `scripts/e2e-seed-users.mjs` chỉ tạo dữ liệu tổng hợp: admin, Chủ nhiệm, Phụ tá, hai phụ huynh có SĐT khác nhau, hai thiếu nhi và assignment tối thiểu.
- Arrange phức tạp được phép qua API thật; hành động đang được bảo vệ phải đi qua UI; assert cuối đọc lại bằng API và/hoặc reload UI.
- `testKey(testInfo, prefix)` tạo namespace ổn định theo test + retry. Test không dùng dữ liệu do test khác tạo và không dựa vào execution order.

## 3. Critical journey portfolio

| Risk | Journey/outcome E2E | Tầng bổ sung |
| :--- | :--- | :--- |
| Auth/session | Staff login thật, refresh-cookie sau reload, access token không persist, logout dọn marker và protected route fail-closed | auth-cookie, token rotation và limiter ở integration/security |
| Parent isolation | Parent login thật; UI/API chỉ trả con liên kết; staff roster và foreign detail trả 403 | query/tenant matrix ở server integration |
| Role/permission | Payload hợp lệ nhưng Phụ tá/Parent/Chủ nhiệm ngoài assignment vẫn bị backend từ chối; UI route không cấp quyền giả | exhaustive RBAC matrix ở integration |
| Lớp | Admin tạo lớp qua UI; API read-back và reload giữ code/ngành/năm học/tenant | validation, delete constraints và assignment transaction ở integration |
| Thiếu nhi | Admin tạo hồ sơ qua UI; server sinh identity; class/tenant đúng; class-filtered reload vẫn thấy record | import, duplicate, soft-delete và field validation ở integration |
| Điểm số | Nhập điểm ma trận qua UI; sync batch tới server; API và reload giữ đúng điểm | formula, override/audit, OCC và lock matrix ở unit/integration |
| Tài chính | Tạo phiếu thu qua UI; ledger có transaction và số dư quỹ tính lại đúng; reload giữ dữ liệu | atomic rollback, fee/debt và re-auth paths ở integration |
| Offline/sync | Điểm danh khi browser offline tạo Dexie queue; reconnect gửi batch; server read-back đúng và queue sạch | compaction, retry/backoff, conflict và ownership matrix ở integration |
| Năm học/khóa | Khóa HK1 qua UI; backend từ chối ghi điểm và xét lên lớp sớm | positive promotion, policy thresholds và lifecycle transition matrix ở integration |
| Smart Exam/OMR | Tạo phiên MC qua UI; server tính lại đáp án thay vì tin score client; reload giữ kết quả; complete ghi điểm và khóa mutation | detector/QR/geometry/corpus, multi-frame consensus và offline barriers ở integration/field gate |
| Workspaces/navigation | Full suite traverses staff/parent/mobile workspaces và route-policy redirects | route inventory, a11y và visual matrix riêng |

Physical camera accuracy, target-device latency, thermal behavior và release corpus ADR-060 không được tuyên bố PASS từ browser E2E.

XD-06 cross-domain regression (`e2e/cross-domain-scope.spec.ts`): real staff login → Grade/Attendance API pull → encrypted IndexedDB readback → browser offline → admin revokes assignment via real API → reconnect → scope-aware full pull retracts both caches → reload does not resurrect rows. Admin readback verifies server history remains intact. No API mocks or direct Zustand mutations; browser readback decrypts synthetic sandbox data solely to assert the persisted outcome. Original assignments are restored in `finally`. This does not certify disconnected-device erasure, physical crash recovery or every domain cache.

## 4. Quy tắc deterministic và chống flaky

1. Không dùng `waitForTimeout`, sleep hoặc retry thủ công. Chờ observable event: response có method/path đúng, URL, accessible state, IndexedDB state hoặc `expect.poll` trên authoritative read.
2. Locator ưu tiên role/name/label. Chỉ thêm `data-testid` khi entity động không có semantic locator ổn định.
3. Mọi mutation phải assert status và read-back. Với deny test, phải gửi payload hợp lệ và kiểm tra dữ liệu không đổi.
4. Retry CI chỉ để thu trace chẩn đoán; `failOnFlakyTests` làm CI fail nếu test chỉ pass sau retry.
5. Screenshot chỉ khi fail, video retain-on-failure, trace on-first-retry. Artifact không chứa production DB hoặc credential thật.
6. Test phải chạy riêng được bằng file, title grep hoặc `--project`; không có serial dependency giữa spec.

## 5. Browser/mobile và CI policy

- Chromium desktop là browser chính cho mutation-heavy journey nhằm giữ feedback nhanh và ổn định.
- Viewport mobile 390×844 chỉ áp dụng nơi interaction thay đổi thật: Parent Portal và offline attendance.
- Cross-browser/viewport mở rộng chỉ được thêm khi có risk/browser evidence; không nhân toàn bộ mutation suite theo mọi browser.
- Pull request chạy `npm run test:e2e:critical` sau security/unit/build gates.
- Push vào main và manual dispatch chạy `npm run test:e2e`, gồm critical + smoke/role/a11y/visual suites.

Các lệnh chuẩn:

```bash
npm run test:e2e:critical
npm run test:e2e
npm run test:e2e:list
npx playwright test e2e/critical-data-journeys.spec.ts
npx playwright test --grep "finance income"
npx playwright show-report
```

## 6. Ownership và maintenance

- Thay business rule phải cập nhật unit/integration trước, sau đó chỉ cập nhật E2E nếu user outcome thay đổi có chủ đích.
- Không sửa business rule hoặc seed production để test pass.
- Khi E2E phát hiện code khó quan sát, ưu tiên label/ARIA hoặc read-back endpoint hiện hữu; không đưa test-only bypass vào production.
- Mỗi incident production ở critical journey phải có regression ở tầng thấp nhất đủ tái hiện; chỉ thêm E2E khi incident vượt boundary thực.
- Review hàng quý: runtime, flake rate, duplicate coverage, stale selector, synthetic PII và journey risk. Test không còn bảo vệ outcome riêng phải được gộp hoặc xóa.

## 7. Acceptance gate

Suite được chấp nhận khi critical tests pass từ sandbox sạch, chạy độc lập và chạy trong full suite; TypeScript/lint liên quan pass; CI config parse được; không có flaky retry; tài liệu/ADR phản ánh đúng coverage và residual gate. Mục tiêu vận hành ban đầu là critical suite dưới 2 phút và full browser suite dưới 8 phút trên CI chuẩn; đây là SLO tối ưu hóa, không phải lý do bỏ hard assertion.

### Evidence tại snapshot 2026-09-01

- Critical portfolio: **10/10 PASS** trong 44,7 giây từ sandbox sạch.
- Full Playwright: **72/72 PASS**, không skip, không flaky retry; 5,4 phút và sandbox được cleanup.
- Unit regressions trực tiếp cho class assignment, mobile attendance/classes, grade/attendance sync và sandbox đều PASS. Full Vitest chẩn đoán trước bản sửa fixture đạt 1.943 PASS/5 FAIL; hai file từng fail đã được chạy lại độc lập **21/21 PASS**. Theo yêu cầu tiết kiệm thời gian, các test đã pass không được chạy lại lần nữa.
- TypeScript, oxlint và design-system lint đã PASS sau các thay đổi production; patch cuối chỉ sửa test/strategy documentation.
