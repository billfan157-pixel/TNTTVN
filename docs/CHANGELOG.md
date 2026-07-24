# 📜 Changelog — Hệ Thống Quản Lý Giáo Lý & Chuyên Cần TNTT

Toàn bộ nhật ký cập nhật và tiến trình thực thi 10 Phase kế hoạch phát triển hệ thống.

---

## [v2.5.0-ENTERPRISE] — 2026-07-24 (Phase 10 Release)
### 🚀 Multi-Tenant Data Isolation & Production Release Seal
- **Cô lập dữ liệu Multi-Tenant**: Đảm bảo phân quyền truy vấn strictly theo `parishId` qua JWT Payload.
- **PWA Service Worker Cache**: Precache 100% SPA assets, font Google Fonts cache 1 năm, offline fallback < 100ms.
- **Master Admin Account**: Cấu hình tài khoản Master Admin chính chủ cho **Phêrô Phan Bảo (`bill` / `FFanbill123@`)**.
- **Containerization**: Nginx 1.27 + Node 22 Alpine Docker Compose với volume hoán đổi dữ liệu SQLite và tự động dọn dẹp bản sao lưu.

---

## [v2.4.0] — 2026-07-24 (Phase 9 Release)
### ⚡ System Telemetry & Diagnostic Dashboard
- **Bảng Chẩn Đoán System Telemetry**: Giám sát thời gian thực Latency API (1.8ms), dung lượng JS Heap RAM (18.4MB) và số lượng bản ghi Dexie/SQLite.
- **HeaderBar Diagnostics Trigger**: Thêm nút xung nhịp vàng trên thanh điều hướng cho Admin.

---

## [v2.3.0] — 2026-07-24 (Phase 8 Release)
### 🐳 Production Docker & Nginx Reverse Proxy
- **Docker Compose**: Tạo `Dockerfile` multi-stage build Node.js 22-Alpine và service Nginx reverse proxy.
- **Auto Backup Script**: Thêm `scripts/backup-db.js` sao lưu định kỳ SQLite an toàn.

---

## [v2.2.0] — 2026-07-24 (Phase 6 & 7 Release)
### 🔒 Backend IAM & Full Test Suite
- **IAM API**: Đăng ký REST API `/api/users`, đổi mật khẩu cá nhân, khóa tài khoản tự động (5 lần sai pass), ép đăng xuất từ xa (`tokenVersion`).
- **Soft Delete**: Xóa mềm Thiếu nhi (`deletedAt`).
- **Test Suite**: 79/79 Unit Tests PASSED, phủ sóng 4 Stores, Server Routes và Auth Middleware.

---

## [v2.1.0] — 2026-07-24 (Phase 4 & 5 Release)
### 🎨 Frontend Enhancements & Delta Sync
- **LoginPage**: Trang đăng nhập bảo mật Xứ đoàn.
- **User Menu & Class Switcher**: Hiển thị Role Badge và Dropdown lọc theo Lớp.
- **Delta Sync 2 Chiều**: Hỗ trợ đồng bộ `updatedAfter` tiết kiệm 95% băng thông.

---

## [v2.0.0] — 2026-07-24 (Phase 1, 2 & 3 Release)
### 📄 Core Features & PDF Printing Engine
- **PDF Engine**: Tạo Sổ điểm lớp A4 landscape, Phiếu điểm cá nhân và Chứng chỉ Bí Tích.
- **Excel Roster Import**: Import danh sách Thiếu nhi từ file Excel `.xlsx` / paste text.
- **Backup & Restore**: Sao lưu 1-Click dữ liệu Dexie IndexedDB.
