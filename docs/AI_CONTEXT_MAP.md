# AI Context Map — Catevia / TNTTVN

> Bản đồ tra cứu hiện hành. Mỗi domain chỉ dẫn tới authority, tài liệu chuẩn,
> entrypoint triển khai, invariant và nguồn theo dõi vấn đề còn mở.
> Đây không phải changelog, kho lịch sử triển khai hay chứng nhận runtime.
> Navigation reviewed: 2026-09-19.

## Cách dùng

Bắt đầu tại [AGENTS.md](../AGENTS.md), phân loại task rồi chọn domain bên dưới.
Chỉ mở source và phần tài liệu liên quan; không đọc toàn bộ bộ docs theo thứ tự.
Khi kiểm tra hành vi, đối chiếu working tree hiện tại với tài liệu chuẩn.

- [Architecture & composition](#domain-architecture-and-composition)
- [Authentication & tenancy](#domain-authentication-and-tenancy)
- [Students, classes & import](#domain-students-classes-and-import)
- [Grades](#domain-grades)
- [Attendance & leave](#domain-attendance-and-leave)
- [Academic lifecycle & promotion](#domain-academic-lifecycle-and-promotion)
- [Reporting, print & export](#domain-reporting-print-and-export)
- [Exams & OMR](#domain-exams-and-omr)
- [Question Bank](#domain-question-bank)
- [Parish Memory & organization](#domain-parish-memory-and-organization)
- [Operations](#domain-operations)
- [Parish Events & calendar](#domain-parish-events-and-calendar)
- [Offline & reconciliation](#domain-offline-and-reconciliation)
- [Finance](#domain-finance)
- [Notices & push](#domain-notices-and-push)
- [Parent, recovery & feedback](#domain-parent-recovery-and-feedback)
- [UI, workspaces & device](#domain-ui-workspaces-and-device)
- [Database, runtime & delivery](#domain-database-runtime-and-delivery)

## Phân biệt nguồn và cách cập nhật

- **Current authority** chỉ nơi sở hữu quyết định/dữ liệu. Nó không chứng minh
  mọi đường gọi đều đúng; cần trace code cho câu hỏi đang xử lý.
- **Current canonical docs** sở hữu quy tắc. Đọc amendment trong ADR liên quan;
  ngày mới hơn không tự động thay thế quyết định cũ.
- **Current implementation entrypoints** là điểm bắt đầu trace, không phải
  danh sách mọi file hoặc bản sao implementation.
- **Current important invariants** là nhắc nhanh kèm nguồn; chi tiết thuộc
  [protected invariants](../.agents/protected-invariants.md), business rules và ADR.
- **Current unresolved items** chỉ dẫn tới nơi theo dõi. `UNKNOWN` nghĩa là map
  chưa xác nhận tình trạng hiện tại, không phải finding mới hoặc xác nhận chưa sửa.
  Audit/plan có ngày là evidence của revision ghi trong đó; phải kiểm lại source
  trước khi coi finding hay kết quả test là hiện hành.

Cập nhật tại chỗ khi authority, canonical doc, entrypoint hoặc nguồn theo dõi đổi.
Không thêm mục “latest changes”, module theo ngày, wave, số test PASS, lịch sử
supersession hay danh sách triển khai. Những nội dung đó thuộc audit/implementation
document liên quan; lịch sử chỉnh sửa còn tra được bằng Git.
Inventory chỉ nằm tại [Current Architecture](./02_ARCHITECTURE.md#1-current-architecture),
được đối chiếu source bởi [inventory gate](../scripts/check-architecture-inventory.mjs).
Map không giữ bản sao số lượng.

## Domain: Architecture and composition

- **Current authority:** [server composition root](../server/src/index.ts), [client bootstrap](../src/main.tsx) và [router](../src/router.tsx); command/transaction owner theo từng profile đã duyệt.
- **Current canonical docs:** [Architecture §2](./02_ARCHITECTURE.md#2-layer-boundaries--dependency-rules), [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) — tìm ADR-104/105/110; workflow tại [operating contract](../.agents/operating-contract.md).
- **Current implementation entrypoints:** [architecture boundary tests](../server/src/__tests__/architectureBoundaries.test.ts), [transaction helper](../server/src/db/transactions.ts), [sync bootstrap](../src/lib/syncCoordinator.ts).
- **Current important invariants:** service command, Operations receipt-service command, legacy route allowlist và read-only query snapshot là các profile khác nhau; xem [transaction ownership profiles](./02_ARCHITECTURE.md#command-and-transaction-ownership-profiles).
- **Current unresolved items:** `UNKNOWN` — đối chiếu finding cần xử lý với [architecture audit](./architecture-domain-design-audit-2026-09-04.md) và [cross-domain audit](./cross-domain-integration-invariant-audit-2026-09-07.md); map không giữ một backlog trùng lặp.

## Domain: Authentication and tenancy

- **Current authority:** server [auth middleware](../server/src/middleware/auth.ts), [auth routes](../server/src/routes/auth.ts), [user service](../server/src/services/userService.ts) và [refresh-session service](../server/src/services/refreshSessionService.ts).
- **Current canonical docs:** [API contract](./FRONTEND_API_CONTRACT.md) §6/9B–9D, [Business Rules](./BUSINESS_RULES.md) §10–11, [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) ADR-045/046/058/089/092/106.
- **Current implementation entrypoints:** [auth store](../src/stores/authStore.ts), [transport](../src/lib/api/core.ts), [tenant scope](../src/lib/tenantScope.ts), [deployment parish](../server/src/utils/deploymentParish.ts).
- **Current important invariants:** backend xác thực/phân quyền; single-parish deployment vẫn dùng tenant-scoped persistence; marker/cache không cấp server authority. Xem [Security Envelope](./02_ARCHITECTURE.md#3-security-envelope).
- **Current unresolved items:** `UNKNOWN` — xác nhận lại các mục theo revision trong [security audit log](./SECURITY_AUDIT_LOG.md) và [Tenant/Privacy Audit #04](../AUDIT04_TENANT_PRIVACY_REPORT.md), kể cả evidence ngoài môi trường local.

## Domain: Students classes and import

- **Current authority:** [student service](../server/src/services/studentService.ts), [class service](../server/src/services/classService.ts), [import service](../server/src/services/importService.ts); membership và assignment qua policy dùng chung.
- **Current canonical docs:** [Import/Export Specification](./IMPORT_EXPORT_SPECIFICATION.md), [Business Rules](./BUSINESS_RULES.md) §18/23, [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) ADR-064/099/108.
- **Current implementation entrypoints:** [membership policy](../server/src/services/studentMembershipPolicy.ts), [assignment policy](../server/src/services/classAssignmentPolicy.ts), [class dependency service](../server/src/services/classDependencyService.ts), [student store](../src/stores/studentStore.ts).
- **Current important invariants:** class/branch/year hợp lệ, correction có lý do, assignment đúng actor, import/undo giữ provenance và dependency checks; xem ADR-108 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current unresolved items:** `UNKNOWN` — production data và import/recovery evidence cần đọc tại [roster/import audit](./students-classes-personnel-import-audit-2026-09-06.md); trạng thái từng finding phải đối chiếu source.

## Domain: Grades

- **Current authority:** [GradeApplicationService](../server/src/services/GradeApplicationService.ts) / [gradeService](../server/src/services/gradeService.ts); [dailyEntryService](../server/src/services/dailyEntryService.ts) và Exam hoàn tất ghi ledger/projection qua server.
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §12, [API contract](./FRONTEND_API_CONTRACT.md) §3/10A/13, [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) ADR-047/103/104.
- **Current implementation entrypoints:** [grades route](../server/src/routes/grades.ts), [GradeAggregate](../server/src/domain/GradeAggregate.ts), [policy adapters](../server/src/services/policyAdapters.ts), [grade store](../src/stores/gradeStore.ts).
- **Current important invariants:** policy, lock, scope và audit đi cùng write transaction; `daily_avg` lấy từ server ledger; UI preview không trở thành grade authority. Xem [Security Envelope](./02_ARCHITECTURE.md#3-security-envelope).
- **Current unresolved items:** `UNKNOWN` — tra dependency và reconciliation questions tại [cross-domain audit](./cross-domain-integration-invariant-audit-2026-09-07.md), xác nhận lại writer đang xử lý.

## Domain: Attendance and leave

- **Current authority:** [AttendanceApplicationService](../server/src/services/AttendanceApplicationService.ts), [batch service](../server/src/services/BatchAttendanceApplicationService.ts) và command duyệt đơn tại [leave requests route](../server/src/routes/leaveRequests.ts).
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §2/17/20/23.1, [API contract](./FRONTEND_API_CONTRACT.md) §14, [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) ADR-033/034/038.
- **Current implementation entrypoints:** [attendance route](../server/src/routes/attendance.ts), [attendance service](../server/src/services/attendanceService.ts), [academic-year service](../server/src/services/academicYearService.ts), [attendance store](../src/stores/attendanceStore.ts).
- **Current important invariants:** duyệt đơn và cập nhật chuyên cần phải atomic; date-keyed locks không được bỏ qua bằng đổi year hiện hành. Xem [Business Rules](./BUSINESS_RULES.md) §2/23.1 và [Security Envelope](./02_ARCHITECTURE.md#3-security-envelope).
- **Current unresolved items:** `UNKNOWN` — tra lock/date/downstream reporting questions tại [cross-domain invariant matrices](./cross-domain-invariant-matrices-2026-09-07.md).

## Domain: Academic lifecycle and promotion

- **Current authority:** [AcademicYearLifecycleService](../server/src/services/AcademicYearLifecycleService.ts) sở hữu finalization/snapshot; [PromotionApplicationService](../server/src/services/PromotionApplicationService.ts) sở hữu promotion command.
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §1/4, [API contract](./FRONTEND_API_CONTRACT.md) §4/15, [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) ADR-103/105/108.
- **Current implementation entrypoints:** [academic years route](../server/src/routes/academicYears.ts), [semester locks route](../server/src/routes/semesterLocks.ts), [batch promotion](../server/src/services/BatchPromotionApplicationService.ts), [academic year store](../src/stores/academicYearStore.ts).
- **Current important invariants:** frozen facts không dựng lại từ current class/settings; promotion decision và membership completion là hai fact; tạo năm cần server ACK. Xem [Business Rules](./BUSINESS_RULES.md) §1/4.
- **Current unresolved items:** `UNKNOWN` — dữ liệu thiếu historical provenance và promotion reconciliation cần kiểm theo [cross-domain audit](./cross-domain-integration-invariant-audit-2026-09-07.md), không tự backfill bằng mutable state.

## Domain: Reporting print and export

- **Current authority:** [ReportingApplicationService](../server/src/services/ReportingApplicationService.ts) chọn open-year hoặc frozen evidence; reporting là read model.
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §3/20, [API contract](./FRONTEND_API_CONTRACT.md) §12, [Architecture](./02_ARCHITECTURE.md), [Import/Export Specification](./IMPORT_EXPORT_SPECIFICATION.md).
- **Current implementation entrypoints:** [reporting route](../server/src/routes/reporting.ts), [report-card projection](../server/src/repositories/ReportCardProjectionRepository.ts), [class-summary projection](../server/src/repositories/ClassSummaryProjectionRepository.ts), [official client reporting gateway](../src/services/officialReporting.ts).
- **Current important invariants:** official report/print/export cùng server truth; thiếu frozen evidence phải báo lỗi, không fallback Zustand/Dexie/settings hiện hành. Xem [historical boundary](./02_ARCHITECTURE.md#3-security-envelope).
- **Current unresolved items:** `UNKNOWN` — đối chiếu câu hỏi còn lại với [export audit](./export_audit_report_2026_08_14.md) và [cross-domain audit](./cross-domain-integration-invariant-audit-2026-09-07.md); hai nguồn này là evidence lịch sử.

## Domain: Exams and OMR

- **Current authority:** [exam service](../server/src/services/examService.ts) sở hữu session/result/scoring/finalization; camera/OMR phía client tạo đề xuất chấm.
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §21, [API contract](./FRONTEND_API_CONTRACT.md) §10/16, [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) ADR-023/048/049/053/060/062/067–071/094/107.
- **Current implementation entrypoints:** [exam route](../server/src/routes/exams.ts), [variant manifest](../server/src/services/examVariantManifest.ts), [exam store](../src/stores/examStore.ts), [OMR engine](../src/lib/omr.ts), [continuous scan](../src/lib/examContinuousScan.ts).
- **Current important invariants:** server tính điểm, immutable question/variant evidence, result mutation identity và finalize receipt; human review/corpus gates vẫn áp dụng. Xem [Business Rules](./BUSINESS_RULES.md) §21.3.
- **Current unresolved items:** physical-device/corpus/rollout qualification phải có evidence riêng → [continuous-scan plan](./OMR_CONTINUOUS_SCAN_RESEARCH_PLAN_2026-08-28.md) §9/17; finding trạng thái `UNKNOWN` → [assessment audit revision](./assessment-question-bank-exam-omr-audit-2026-09-06-r1.md).

## Domain: Question Bank

- **Current authority:** [questionBankService](../server/src/services/questionBankService.ts) sở hữu authoring, immutable versions, blueprint selection và materialization sang Exam.
- **Current canonical docs:** [Architecture §6](./02_ARCHITECTURE.md#6-question-bank-to-smart-exam-boundary-adr-096), [Business Rules](./BUSINESS_RULES.md) §30, [API contract](./FRONTEND_API_CONTRACT.md) §24; ADR-096/107 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [question-bank route](../server/src/routes/questionBank.ts), [QuestionBankView](../src/components/exam/QuestionBankView.tsx), [import parser](../src/utils/questionBankImport.ts).
- **Current important invariants:** bank edits không sửa snapshot đã materialize; authoring/build online, chấm Exam theo pipeline của Exam. Xem [Architecture §6](./02_ARCHITECTURE.md#6-question-bank-to-smart-exam-boundary-adr-096).
- **Current unresolved items:** `UNKNOWN` — import resilience, assessment boundaries và qualification được tra từ [assessment audit revision](./assessment-question-bank-exam-omr-audit-2026-09-06-r1.md).

## Domain: Parish Memory and organization

- **Current authority:** [parishProfileService](../server/src/services/parishProfileService.ts) sở hữu people, units, service terms, records/assets; account và academic assignment có writer riêng.
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §24, [API contract](./FRONTEND_API_CONTRACT.md) §19 và Academic organization projection; ADR-081/082/112 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [parish-profile route](../server/src/routes/parishProfile.ts), [academic organization projection](../server/src/services/academicOrganizationService.ts), [organizational position policy](../server/src/utils/organizationalPosition.ts), [parish profile store](../src/stores/parishProfileStore.ts).
- **Current important invariants:** person identity khác login account; linked user cùng parish; academic projection không thành writer của academic assignment; Operations authority đọc term/position policy, không suy quyền từ free-text title. Xem ADR-081/112 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current unresolved items:** `UNKNOWN` — organization projection/recovery và operator data readiness → [academic organization plan](./ACADEMIC_ORGANIZATION_LINK_PLAN_2026-09-10.md), [authority research](./OPERATIONS_AUTHORITY_GATE_B_IMPLEMENTATION_RESEARCH_2026-09-10.md).

## Domain: Operations

- **Current authority:** command composition tại [operations route](../server/src/routes/operations.ts); [operationsIdempotency](../server/src/services/operationsIdempotency.ts) sở hữu transaction/receipt; [operationsAuthorization](../server/src/services/operationsAuthorization.ts) quyết định capability.
- **Current canonical docs:** [Architecture §7](./02_ARCHITECTURE.md#7-task--event-operations-boundary-adr-110), [Business Rules](./BUSINESS_RULES.md) §31, [API contract](./FRONTEND_API_CONTRACT.md) §25, ADR-110/112 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [event lifecycle policy](../server/src/domain/OperationsEventLifecycle.ts), [event lifecycle service](../server/src/services/operationsEventLifecycleService.ts), [task dispatch](../server/src/services/operationsTaskDispatchService.ts), [operations store](../src/stores/operationsStore.ts).
- **Current important invariants:** online server ACK, parish/resource authority, accepted assignment, OCC + receipt + audit; planning → public calendar projection và completion → Parish Memory có owner cụ thể. Xem [Architecture §7](./02_ARCHITECTURE.md#7-task--event-operations-boundary-adr-110).
- **Current unresolved items:** operator readiness, receipt retention và production/device acceptance → [implementation plan](./TASK_EVENT_OPERATIONS_IMPLEMENTATION_PLAN_2026-09-07.md), [authority research](./OPERATIONS_AUTHORITY_GATE_B_IMPLEMENTATION_RESEARCH_2026-09-10.md); trạng thái UI follow-up cần tái xác nhận → [UX/sync remediation notes](./OPERATIONS_UX_SYNC_UPGRADE_PLAN_2026-09-13.md).

## Domain: Parish Events and calendar

- **Current authority:** Operations ghi canonical public calendar projection; [parishEvents route](../server/src/routes/parishEvents.ts) chỉ đọc. Lịch phụng vụ thuật toán là nguồn riêng.
- **Current canonical docs:** [API contract](./FRONTEND_API_CONTRACT.md) §18A, [Business Rules](./BUSINESS_RULES.md) §19/31, ADR-037/038/098 với amendment ADR-110 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [Operations projection writer](../server/src/routes/operations.ts), [parish event cache](../src/stores/parishEventStore.ts), [Organization dashboard](../src/pages/OrganizationDashboardPage.tsx).
- **Current important invariants:** cache không cấp quyền command; route mutation cũ trả `CALENDAR_READ_ONLY`; public calendar không làm lộ private planning. Xem [Architecture §7](./02_ARCHITECTURE.md#7-task--event-operations-boundary-adr-110).
- **Current unresolved items:** `UNKNOWN` — publication/portal integration follow-up → [portal integration review](./PARISH_PORTAL_INTEGRATION_REVIEW_2026-09-10.md); không dùng mô tả CRUD trước amendment làm contract hiện hành.

## Domain: Offline and reconciliation

- **Current authority:** server command quyết định business fact; encrypted queue sở hữu local intent chưa ACK; document-local tenant/session scope giữ owner xuyên request/retry/reconciliation.
- **Current canonical docs:** [Architecture §5](./02_ARCHITECTURE.md#5-durable-delta-sync-and-exam-variant-boundary-adr-094), [API contract](./FRONTEND_API_CONTRACT.md) §18, ADR-016/023/094/101/109 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [sync store](../src/stores/syncStore.ts) → [sync trigger](../src/lib/syncTrigger.ts) → [coordinator](../src/lib/syncCoordinator.ts) → [processor](../src/lib/syncProcessor.ts); [apply/reconcile](../src/lib/syncApply.ts), [tenant scope](../src/lib/tenantScope.ts), [session boundary](../src/lib/syncSessionBoundary.ts).
- **Current important invariants:** exact `parishId:userId`, owner continuity, durable ACK trước remap, dependency ordering, CREATE đã có thể gửi phải giữ intent bất biến; server [create idempotency](../server/src/services/createIdempotency.ts) không coi payload khác là replay thành công. Xem ADR-016 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current unresolved items:** `UNKNOWN` — legacy recovery/multi-tab/device questions → [Tenant/Privacy Audit #04](../AUDIT04_TENANT_PRIVACY_REPORT.md), [frontend boundary audit](./frontend-architecture-ux-performance-audit-2026-09-06.md); replay regression source → [focused tests](../server/src/__tests__/createIdempotencyPayload.test.ts).

## Domain: Finance

- **Current authority:** [FinanceApplicationService](../server/src/services/FinanceApplicationService.ts) sở hữu financial commands và linked fee/ledger reconciliation; [financeService](../server/src/services/financeService.ts) cung cấp read surfaces.
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §22/23.3, [API contract](./FRONTEND_API_CONTRACT.md) §18B, ADR-101 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [finance route](../server/src/routes/finances.ts), [finance store](../src/stores/financeStore.ts), [database schema](../server/src/db/schema.ts).
- **Current important invariants:** fee và ledger cùng transaction, voucher sequence theo parish, historical fee đọc persisted class/year facts; xem [Business Rules](./BUSINESS_RULES.md) §22 và [Security Envelope](./02_ARCHITECTURE.md#3-security-envelope).
- **Current unresolved items:** `UNKNOWN` — legacy data/reconciliation và scope questions → [cross-domain audit](./cross-domain-integration-invariant-audit-2026-09-07.md); UI evidence → [finance UX evaluation](./UX_UI_EVALUATION_FINANCE_PAGE.md).

## Domain: Notices and push

- **Current authority:** [noticeService](../server/src/services/noticeService.ts) sở hữu notices; [notificationQueue](../server/src/services/notificationQueue.ts) sở hữu durable delivery, [appPushService](../server/src/services/appPushService.ts) dispatch web/native providers.
- **Current canonical docs:** [API contract](./FRONTEND_API_CONTRACT.md) §7, [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md) ADR-095/102/111, [Deployment Guide](./DEPLOYMENT_GUIDE.md) §8.
- **Current implementation entrypoints:** [notification routes](../server/src/routes/notifications.ts), [notice store](../src/stores/noticeStore.ts), [push manager](../src/lib/pushManager.ts), [Operations reminders](../server/src/services/operationsReminderService.ts).
- **Current important invariants:** Web/Native Push là external channel hiện hành; Telegram retired. Provider-accept/DB-ACK crash window không bảo đảm exactly-once; payload/log tối thiểu PII. Xem ADR-102/111 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current unresolved items:** provider credentials/background/device delivery cần evidence thực tế → [Deployment Guide](./DEPLOYMENT_GUIDE.md); Telegram decommission evidence → [retirement research](./TELEGRAM_DECOMMISSION_RESEARCH_2026-09-08.md), không diễn giải nó là feature đang dùng.

## Domain: Parent recovery and feedback

- **Current authority:** [parentService](../server/src/services/parentService.ts) giới hạn linked children; [passwordResetRequestService](../server/src/services/passwordResetRequestService.ts) xử lý recovery ticket; [feedbackService](../server/src/services/feedbackService.ts) sở hữu mailbox.
- **Current canonical docs:** [Business Rules](./BUSINESS_RULES.md) §10/26, [API contract](./FRONTEND_API_CONTRACT.md) §6/9/20, ADR-058/086/087 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [parents route](../server/src/routes/parents.ts), [reset requests route](../server/src/routes/passwordResetRequests.ts), [feedback route](../server/src/routes/feedback.ts), [Parent page](../src/pages/ParentPage.tsx).
- **Current important invariants:** không dùng dữ liệu trẻ em làm KBA tự reset; anonymous feedback không lưu sender identity hay offline copy; app anonymity không chứng nhận proxy/provider logs. Xem [Business Rules](./BUSINESS_RULES.md) §10/26.
- **Current unresolved items:** `UNKNOWN` — operational recovery và transport-log retention → [security audit log](./SECURITY_AUDIT_LOG.md), [Tenant/Privacy Audit #04](../AUDIT04_TENANT_PRIVACY_REPORT.md).

## Domain: UI workspaces and device

- **Current authority:** [route policy](../src/constants/routePolicy.ts) sở hữu workspace/navigation; [CSS entrypoint](../src/index.css) và shared components triển khai design tokens; backend giữ security authority.
- **Current canonical docs:** [Design System](./03_DESIGN_SYSTEM.md), [UI rule](../.agents/rules/ui-design-system.md), ADR-081/082/085/088/091/092 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [RootLayout](../src/components/common/RootLayout.tsx), [desktop shell](../src/components/desktop/DesktopAppShell.tsx), [mobile shell](../src/components/mobile/MobileAppShell.tsx), [app lock store](../src/stores/appLockStore.ts), [biometric adapter](../src/lib/biometricAppLock.ts).
- **Current important invariants:** academic/organization/parent là presentation boundaries; desktop/mobile dùng shared contracts; biometric app lock không thay server session/auth. Xem [Design System](./03_DESIGN_SYSTEM.md) và [Business Rules](./BUSINESS_RULES.md) §25.
- **Current unresolved items:** `UNKNOWN` — desktop/mobile/a11y/physical-device follow-up → [app-wide UX evaluation](./MOBILE_UX_APP_WIDE_EVALUATION_AND_PLAN_2026-09-12.md), [mobile audit](./mobile-ui-audit-2026-08-29.md), [E2E strategy](./08_E2E_TESTING_STRATEGY.md); không tổng hợp lại từng wave ở đây.

## Domain: Database runtime and delivery

- **Current authority:** [schema](../server/src/db/schema.ts) + [migration runner](../server/src/db/migrationRunner.ts) cho persisted structure; [server root](../server/src/index.ts) cho startup/readiness/shutdown; CI/deploy workflows cho release.
- **Current canonical docs:** [Database Specification](./07_DATABASE_PLAN.md), [Deployment Guide](./DEPLOYMENT_GUIDE.md), [E2E strategy](./08_E2E_TESTING_STRATEGY.md), ADR-041/056/057/059/100/105/106 trong [ADRs](./ADR_ARCHITECTURE_DECISION_RECORDS.md).
- **Current implementation entrypoints:** [transactions](../server/src/db/transactions.ts), [backup scheduler](../server/src/services/backupScheduler.ts), [remote backup](../server/src/services/remoteBackup.ts), [purge service](../server/src/services/purgeService.ts), [CI](../.github/workflows/ci.yml), [package scripts](../package.json).
- **Current important invariants:** SQLite/Turso runtime differences phải được xét; migration/restore fail closed, audit snapshot cùng transaction, producers/delivery readiness trước HTTP bind và graceful shutdown theo dependency. Xem [Architecture](./02_ARCHITECTURE.md) và [Business Rules](./BUSINESS_RULES.md) §9.
- **Current unresolved items:** production restore/recovery, release/device và observability evidence → [Deployment Guide](./DEPLOYMENT_GUIDE.md), [security audit log](./SECURITY_AUDIT_LOG.md); inventory đối chiếu source tại [Architecture §1](./02_ARCHITECTURE.md#1-current-architecture), không lấy count từ snapshot cũ.





