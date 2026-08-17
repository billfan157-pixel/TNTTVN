# Sổ Điểm GL — Nền Tảng Quản Lý Giáo Lý Thiếu Nhi Thánh Thể

Nền tảng quản lý điểm số, chuyên cần, hồ sơ Thiếu Nhi Thánh Thể, thông báo và báo cáo thăng tiến cho Giáo Xứ. Hệ thống được xây dựng theo mô hình **Offline-First**, hỗ trợ đầy đủ cả giao diện **Desktop** và **Mobile** với khả năng tự động nhận diện thiết bị.

---

## 🛠️ Công Nghệ Sử Dụng (Technology Stack)

### Frontend (Client-side)
- **Core Framework**: React 19 + TypeScript 5.8
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS 4 + Design Token Variables (`src/index.css`)
- **Routing**: TanStack Router (16 paths, Auth Guard & RBAC Role Guards)
- **State Management**: Zustand 5 + Dexie.js (IndexedDB Persistence & Offline Sync Queue)
- **Table Component**: TanStack Table v8
- **Monitoring & Diagnostics**: Sentry React + Custom System Diagnostics Modal

### Backend (Server-side)
- **Server Framework**: Hono (Node.js)
- **Database**: SQLite via `@libsql/client` (WAL Mode enabled)
- **ORM**: Drizzle ORM (30 tables)
- **Authentication**: JWT (Access 15m, Refresh 7d), bcrypt, Role-Based Access Control (RBAC)
- **Integrations**: Grammy (Telegram Bot Notification Engine), Web Push Notifications

---

## 📁 Cấu Trúc Dự Án (Project Structure)

```text
brave-davinci/
├── src/                        # Frontend React Application
│   ├── components/             # 41 UI Components (common: 19, desktop: 15, mobile: 7)
│   ├── hooks/                  # 10 React Hooks (useAuth, useParentPortal, useSyncEngine, useEffectiveMode, ...)
│   ├── lib/                    # API Client, Dexie DB, Sync Engine, Sentry
│   ├── pages/                  # 14 Route Pages (Dashboard, Students, Grades, Attendance, Reports, ...)
│   ├── stores/                 # 15 Zustand State Stores (studentStore, gradeStore, attendanceStore, ...)
│   ├── types/                  # TypeScript Interfaces & Models
│   └── utils/                  # Pure Helpers (grades, sacraments, excelParser, pdfGenerator)
├── server/                     # Backend Hono Application
│   ├── src/
│   │   ├── db/                 # Drizzle Schema (30 tables) & DB Connection
│   │   ├── middleware/         # Auth, Security, RBAC & Class Access Guards
│   │   ├── repositories/       # 6 CQRS Read & Write Repositories
│   │   ├── routes/             # 20 REST Route Handlers
│   │   └── services/           # 28 Application Services & Business Specifications
├── docs/                       # Official System Documentation & ADRs
│   ├── AI_CONTEXT_MAP.md       # AI & Developer Navigation Sitemap
│   ├── 02_ARCHITECTURE.md      # System Architecture & Layer Boundaries
│   ├── 07_DATABASE_PLAN.md     # Database Schema & Design
│   ├── FRONTEND_API_CONTRACT.md # REST API Contract
│   ├── BUSINESS_RULES.md       # Consolidated Domain Business Rules
│   ├── ADR_ARCHITECTURE_DECISION_RECORDS.md # Architecture Decision Records
│   ├── IMPORT_EXPORT_SPECIFICATION.md # Import/Export Specification
│   └── DEPLOYMENT_GUIDE.md     # Deployment & Docker Guide
├── Dockerfile                  # Multi-stage Docker Build for Server + Web
├── docker-compose.yml          # Containerized Orchestration
└── nginx.conf                  # Nginx Reverse Proxy & Security Headers
```

---

## 🚀 Hướng Dẫn Khởi Chạy (Quick Start)

### 1. Cài Đặt & Dev Local

```bash
# Cài đặt dependencies cho cả Frontend và Server
npm install
cd server && npm install && cd ..

# Khởi chạy Dev Server đồng thời (Client Vite + Server Hono)
npm run dev:all
```

> **Lưu ý**: `npm run dev` (root) chỉ chạy Vite (client). Backend Hono phải chạy riêng bằng `npm run dev:server` (terminal 2) — nếu quên, API trả **502 Bad Gateway** (Vite proxy `/api` → `localhost:3001` không có server lắng nghe). `npm run dev:all` chạy cả hai tiến trình cùng lúc và tự dừng khi một trong hai thoát.

### 2. Kiểm Thử (Testing & Quality Assurance)

```bash
# Kiểm tra kiểu dữ liệu TypeScript (Frontend + Server)
npx tsc -b --noEmit

# Chạy toàn bộ 93 test suites (vitest) + 5 E2E (Playwright)
npm run test
```

### 3. Docker Deployment

```bash
# Đóng gói và chạy bằng Docker Compose
docker-compose up -d --build
```

---

## 📚 Hệ Thống Tài Liệu Chính Thức (Documentation Sitemap)

Tất cả các tài liệu chuẩn hóa về Kiến trúc, Thiết kế, Cơ sở dữ liệu và Quy chuẩn lập trình được lưu giữ tại thư mục [`docs/`](docs):

- 🗺️ **Sitemap & Onboarding**: [`docs/AI_CONTEXT_MAP.md`](docs/AI_CONTEXT_MAP.md)
- 🏗️ **Kiến trúc Hệ thống**: [`docs/02_ARCHITECTURE.md`](docs/02_ARCHITECTURE.md)
- 📐 **Quyết định Kiến trúc (ADR)**: [`docs/ADR_ARCHITECTURE_DECISION_RECORDS.md`](docs/ADR_ARCHITECTURE_DECISION_RECORDS.md)
- 🗄️ **Cơ sở dữ liệu**: [`docs/07_DATABASE_PLAN.md`](docs/07_DATABASE_PLAN.md)
- 🔌 **API Contract**: [`docs/FRONTEND_API_CONTRACT.md`](docs/FRONTEND_API_CONTRACT.md)
- 📋 **Quy tắc nghiệp vụ (Business Rules)**: [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md)
- 📥 **Import/Export**: [`docs/IMPORT_EXPORT_SPECIFICATION.md`](docs/IMPORT_EXPORT_SPECIFICATION.md)
- 🚢 **Triển khai**: [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md)
