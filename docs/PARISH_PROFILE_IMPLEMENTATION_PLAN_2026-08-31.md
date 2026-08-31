# Kế hoạch triển khai Hồ sơ Xứ đoàn — 2026-08-31

## Mục tiêu

Xây dựng Organization workspace `Xứ đoàn & Giáo xứ` trong cùng Catevia Platform và một Parish Memory bounded context làm nguồn dữ liệu chuẩn cho căn tính, lịch sử, cơ cấu, nhân sự phục vụ, hoạt động, thành tích và kho tư liệu của từng tenant. Phạm vi MVP giữ nội bộ: Admin quản trị/xuất bản; Chủ nhiệm và Phụ tá đọc nội dung đã xuất bản; Phụ huynh và anonymous không truy cập.

## Evidence baseline

- `parish_events` là lịch tác nghiệp, không có nội dung lịch sử/nhiệm kỳ/tư liệu và không có durable offline mutation.
- `users` là tài khoản, không bao phủ người tiền nhiệm; hồ sơ nhân sự lịch sử phải độc lập và chỉ liên kết tùy chọn.
- Route policy ADR-072 yêu cầu route, title và desktop/mobile navigation dùng một SSOT; server middleware vẫn là authority.
- Blob adapter hiện hỗ trợ R2/local, nhưng production archive phải fail-closed nếu thiếu R2 và mọi download phải qua authorization.
- Route/shell hiện hữu được tái phân loại thành ba workspace; không fork auth/backend/database/offline engine hoặc rewrite nghiệp vụ ổn định.
- `parish_people` là canonical organization identity. `linked_user_id` optional nhưng unique cho active profile, tránh duplicate identity giữa Academic và Organization.

## Phạm vi dữ liệu

1. Hồ sơ Xứ đoàn: tên, bổn mạng, ngày thành lập, khẩu hiệu, giới thiệu.
2. Nhân vật: tên thánh, họ tên, năm sinh tùy chọn, tiểu sử ngắn, trạng thái phục vụ.
3. Cơ cấu: đơn vị phân cấp và nhiệm kỳ/chức vụ/cấp bậc.
4. Bản ghi: cột mốc, hoạt động, thành tích; draft/published/archived; admin/staff visibility; timeline projection.
5. Kho tư liệu: metadata, external HTTPS link hoặc upload ảnh/PDF có kiểm soát; liên kết nhiều-nhiều với bản ghi.

## Phạm vi giao diện

- Dashboard `/parish`, desktop/mobile workspace switcher và last-workspace marker scoped theo account.
- Tổng quan: thông tin nền, chỉ số, nhiệm kỳ hiện tại, cột mốc gần nhất.
- Lịch sử & Timeline: nhóm theo năm, filter loại.
- Cơ cấu tổ chức: cây đơn vị và người giữ chức vụ theo nhiệm kỳ.
- Huynh trưởng / GLV: directory + hồ sơ phục vụ.
- Nhật ký hoạt động: bản ghi `ACTIVITY`.
- Kho tư liệu: ảnh/tài liệu/video-link có nhãn visibility.
- Khen thưởng: bản ghi `ACHIEVEMENT` và người liên quan.

## Hard acceptance

- Cross-parish read/write/reference bị chặn bằng test.
- Staff không thấy draft/archived/admin-only; parent bị 403 và route redirect.
- Upload vượt 8 MiB, MIME/signature mismatch, path/file name bất hợp lệ bị từ chối; production thiếu R2 trả lỗi có kiểm soát.
- Timeline không lưu bản sao; được suy ra từ records/terms.
- Delete soft-delete; audit redacted; không có optimistic offline success.
- 320px/light/dark/keyboard semantics dùng shared primitives; không thêm bottom-nav item.
- Organization sidebar không render bộ lọc phân ngành/lớp của Academic; navigation dùng sentence case và modal bản ghi dùng vertical `.form-group` contract.
- Axe/layout matrix bao phủ `/parish`, `/parish-profile` và modal tạo bản ghi ở 1440/390/320, light/dark.
- Schema/migration/API/business/security/architecture/design docs đồng bộ trước khi kết thúc.

## Design-system remediation evidence

- Organization navigation đã tách academic filters, chuẩn hóa sentence case và giữ một navy–gold shell.
- Modal bản ghi dùng vertical `.form-group`; layout containment và label/control overlap được kiểm tra ở 1440/390/320.
- Playwright Axe + visual/layout + CRUD + role: **41/41 tests PASS**; Axe và visual/layout đều đạt **78/78 observations** trên ma trận mở rộng.
- Final serialized `npm run verify:ci`: **PASS**; Vitest **264/264 files, 1,864/1,864 tests**, `lint:ds` **0/115**, client/server TypeScript và production/PWA build đều xanh.
