# Đối chiếu 2 bản audit Operations + Verify & Đánh giá bản `OPERATIONS_UX_UI_DESKTOP_MOBILE_BACKEND_SYNC_AUDIT_2026-09-12.md`

- **Ngày:** 2026-09-13 · **Commit kiểm chứng:** `967f067` (UI Operations ≡ `0560dc9`)
- **Hai bản được đối chiếu:**
  - **Bản A (của tôi):** `docs/OPERATIONS_UX_SYNC_UPGRADE_PLAN_2026-09-13.md`
  - **Bản B (đối tượng đánh giá):** `docs/OPERATIONS_UX_UI_DESKTOP_MOBILE_BACKEND_SYNC_AUDIT_2026-09-12.md`
- **Phương pháp:** từng claim của B được tái đọc bằng code hiện hành (file:line); claim có tính "đã chạy" được **chạy lại thật** (`lint:ds`, vitest). Phân loại mỗi claim: ✅ XÁC MINH ĐÚNG / ⚠️ ĐÚNG-NHƯNG-ĐÁNH-GIÁ-SAI / ❌ SAI / 🚧 KHÔNG ÁP DỤNG.
- **Nguyên tắc trung thực (AGENTS §5/§10):** B là audit artifact độc lập; đánh giá dưới chỉ kết luận bằng chứng, không mặc định "audit nào mới hơn đúng hơn".

---

## 1. Kết luận nhanh

**Bản B là một audit tốt, có giá trị thật và bổ sung 3 phát hiện mà bản A bỏ sót** (orphan `TaskChecklistSection`, thiếu lối dời-giờ-reminder từ inbox, drift timezone/standalone-rút-gọn) — cả 3 đã được merge vào plan A. **Nhưng B không đáng tin nếu dùng một mình để xếp hạng ưu tiên**, vì: (1) elevates orphan-checklist lên "P0 nghiêm trọng" trong khi **bỏ sót 4 lỗi P1 có thật đã verify bằng code** mà A tìm ra; (2) chứa 2 "đính chính" nhắm vào các claim mà bản A **không hề viết** (strawman); (3) đề xuất mobile reorder **mâu thuẫn với Phase B đã được product duyệt** trong `OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md`; (4) đề xuất G6 "thêm nút Dời giờ vào inbox" là **lỗi nghiệp vụ authorization** nếu làm nguyên văn (server không cho recipient thường dời giờ — xem §2.6 dưới).

**Điểm đánh giá B: 7.5/10** — tốt về ma trận endpoint + bằng chứng đã-chạy (tôi re-run và xác nhận đúng), yếu về độ phủ P1 sâu, lệch vài mức độ, một đề xuất sai gate, và đính chính nhắm ảo.

---

## 2. Verify chi tiết từng claim chính của B

### 2.1 ✅ F0/M0 — Orphan `TaskChecklistSection` render đáy trang: **ĐÚNG (nhưng mức P1, không phải P0)**
- Bằng chứng xác nhận: `OperationsPage.tsx:1942` `{!selectedEvent && <TaskChecklistSection />}`; `TaskChecklistSection.tsx:34` trả null khi chưa chọn task; nút "Chi tiết nhiệm vụ" (:990–997) gọi `selectTask` mà không mở gì trên-screen; thứ tự mobile :1375–1382 đặt Utilities **cuối** → detail rơi sau cùng. **A bỏ sót finding này — merge vào Wave 1 (W1.7).**
- Hạ severity P0→P1 vì: (a) hành vi được **test pin có chủ đích** — `OperationsPage.test.tsx:71` "renders task detail and checklist without selecting an event" (tức là debt UX đã biết, không phải hỏng âm thầm); (b) không mất dữ liệu/khóa luồng (user vẫn tới được bằng cuộn); P0 của repo dành cho lỗi toàn vẹn/phân quyền. Kết luận: **bug thật, fix đáng làm ngay, nhưng là P1**.
- Lưu ý khi fix theo B (TaskDetailModal): phải **cập nhật test :71** (đổi assertion sang modal mở), không xóa test.

### 2.2 ✅ G6 — Inbox không có lối dời giờ reminder: **ĐÚNG một nửa, SAI ở chi tiết gate**
- Đúng: server có `POST /reminders/:id/reschedule` (:1798), client có `rescheduleReminder` (:343) và `EventReminderForm` dùng (:143); `renderInboxSection` (:1089–1123) chỉ có "Đánh dấu đã đọc"/"Hủy lịch nhắc" — recipient không có UI đổi giờ tại chỗ.
- **Sai/nghiêm trọng hơn B ghi:** nếu làm nguyên văn "inbox thêm nút Dời giờ dùng G6 sẵn có" như Phase 2 của B thì **user thường sẽ ăn 403**: reschedule **luôn** require capability manager (`assertOperationsCapability(task.assign/event.manage)` :1804, không có nhánh self-exemption), trong khi cancel có ngoại lệ recipient tự hủy (`row.recipientUserId !== user.userId` mới assert :1852). ⇒ Fix đúng: nút Dời giờ trong inbox **chỉ render khi** `permissions['operations.task.assign' | 'operations.event.manage']` khớp resource của reminder; recipient thường chỉ còn lối Cancel (đúng như hiện tại). B không phát hiện điều này.

### 2.3 ✅ G1–G5 (ma trận gap) — **ĐÚNG, trùng khớp hoàn toàn với matrix của A**
Re-verify từng endpoint: `assignments/:assignmentId/remove` :2563 (server có, 0 client fn), `PUT /workstreams/:id` :1986 (0 client fn), `GET /tasks/:id/dispatches` :2480, `POST /tasks/:id/dependencies` :2700 + `dependencies: unknown[]` (api :184), participants/headcount :1494/:1508/:1524 (server trả `participants` trong detail :1434, type client bỏ qua), `expectedHeadcount` không có trong body create/update client (:368–369). A và B **độc lập ra cùng 7 gap sản phẩm**; B gom participants trio thành 1 dòng, A tách 3 — chỉ khác trình bày, không khác nội dung. B đúng khi nhắc "cycle DFS :2700+, chặn DONE :2752–2753".

### 2.4 ✅ §3.3 — Drift mềm timezone + standalone task rút gọn: **ĐÚNG**
- `createStandaloneTask` (store :501) chỉ gửi `title/eventId:null/scopeUnitId/dueAt` trong khi `POST /tasks` nhận full `phase/priority/scheduled*/isRequired/workstreamId` (schema :192–196) — standalone bị rút gọn thật.
- Timezone browser ở `CreateEventForm:64` + `EventTemplatesPanel:208`; server lưu + validate IANA, service-term date dùng `PARISH_TIME_ZONE`. A có ghi cùng điểm (U-19) nhưng B nêu rõ hệ quả "hiển thị `toLocaleString('vi-VN')` không kèm TZ" — **hợp lý, merge thành đề xuất W2.11 (default parish TZ + label "Giờ Xứ đoàn")**.
- Chỉ mức: giáo xứ VN đơn TZ ⇒ drift hiếm gặp thực tế → P3/P2 thấp, không phải gap đồng bộ hợp đồng.

### 2.5 ✅ §2.1/§2.3/§5 — các claim đã chạy: **TÔI RE-RUN VÀ XÁC NHẬN ĐÚNG TOÀN BỘ**
- `npm run lint:ds` → **PASS 0/155** ✓ (re-run 2026-09-13).
- `vitest run src/__tests__/components/OperationsPage.test.tsx` → **40 passed (40)** ✓ (re-run; bản A ghi "~38 theo doc cũ" — B đúng, doc audit 09-12 đếm 38, hiện 40).
- `61 routes` = grep `^operationsRouter\.(get|post|put)` ✓ (A cũng đếm 61).
- `DesktopAppShell wide = 80rem` ✓ (40-mobile-shell.css:131).
- E2E 9 @critical ✓ (grep e2e/operations.spec.ts đúng 9 test).
- `useEffectiveMode` matchMedia 1023.9px ✓.
- Event search client-side chỉ hiện khi `events.length>2`, sai khi total>50 ✓ (:747, :134–141 — A cũng có U-10/D6 tương tự).

### 2.6 ⚠️ M2 — "FAB ẩn khi offline là sai, nên disable + tooltip": **quan điểm, không phải lỗi**
Điều kiện `canCreateAnything && canMutate && isMobileLayout` (:1365) đúng như B mô tả, nhưng **ẩn FAB khi offline là nhất quán có chủ đích với chính sách "không báo thành công giả"** (banner offline + mọi mutation disabled đồng bộ desktop). Đề xuất của B là trade-off sản phẩm trung tính — chấp nhận thảo luận, không phải finding. Ngược lại, **B bỏ sót lỗi FAB thật** của A: dùng class thô `fixed bottom-20 right-4 sm:hidden` thay primitive `.mobile-floating-action` (MB-01: lệch safe-area + mất FAB trên tablet 640–1023px).

### 2.7 🚧 §2.3 & M3 — Hai "đính chính nhắm bản A": **KHÔNG ÁP DỤNG — strawman**
- B viết: "KPI **không có thẻ 'Hoàn tất'** như audit khác ghi nhầm". Bản A **không hề claim** có thẻ Hoàn tất (A list đúng 4 card: Sự kiện/Việc của tôi/Chờ phản hồi/Đang bị chặn, khớp :463–494). Claim đính chính nhắm một audit khác, không nhắm A.
- B viết: "đính chính claim 'vi phạm' header của audit khác" rồi tự trả lời "không vi phạm". Bản A **không kết luận PageHeader-on-mobile là vi phạm invariant** (A đánh giá title ĐẠT; chỉ note `page-header__title` mobile 15px ở §MB). Vì vậy cả hai mục "đính chính" đều **sửa cho một đối tượng không tồn tại** — không phải lỗi lớn nhưng làm giảm độ tin cậy quy trình cross-review của B (dẫn chứng thứ B đọc để "đính chính" không phải bản này).
- Ghi nhận điểm tốt của M3: B verify đúng phạm vi `GEMINI.md` ("Có hiệu lực cho toàn bộ file trong `src/components/mobile/`" — dòng 4), và QuestionBankView.tsx (thực tế ở `src/components/exam/`, :395/:430) thật sự dùng hybrid SubpageHeader/PageHeader. Đề xuất hybrid cho Operations là **hợp lệ như lựa chọn polish**, không phải invariant.

### 2.8 ⚠️ M1 — "Thống nhất `KPI-compact → Events → MyTasks → Inbox → Utilities`": **XUNG ĐỘT với Phase B đã duyệt**
Thứ tự mobile hiện tại (Inbox → MyTasks → Events → KPI → Utilities, :1375–1382) **chính là** B1 đã product-duyệt trong `OPERATIONS_MOBILE_UX_EVALUATION_AND_PLAN_2026-09-12.md`: "my work → claim/accept → blockers → today's events; utilities secondary", và đã được **test pin WCAG focus-order** (`OperationsPage.test.tsx:574` "preserves mobile visual and DOM reading order"). Đề xuất reorder của B (KPI-first, Events-trước-MyTasks) đi ngược ưu tiên "my work first" và đụng test layout hợp đồng — nếu muốn segmented tabs kiểu mới, phải **chốt lại với product**, không làm như bug-fix. (B cũng tự nhận "doc Phase B hiện vẫn open" — nhưng phần mở là C/D, không phải phủ quyết B1.)

### 2.9 Các claim còn lại của B — verify nhanh
| Claim | Kết quả |
|---|---|
| F1 "event modal ôm đồm 5 tabs + 2 forms" | ✅ đúng (A có F4/MB-05 tương đương) |
| F2 "4–5 nút task, canExecute/hasPending loại trừ nhau" | ✅ đúng và **nuance tốt** (A chưa nêu sự loại trừ); fix gom `...` menu đáng nhận |
| "DS guard tốt, không raw pastel" | ✅ khớp A (grep sạch) |
| "chips lệch DS có document B5 — chấp nhận được" | ✅ khớp A |
| "nested modals cần kiểm tab-order" | ⚠️ hợp lý nhưng đã có cơ chế: `useAccessibleDialog` top-most trap + ModalPortal (A verify ModalShell/ConfirmDialog đạt); để ở E2E a11y checklist |
| §1 "6 gaps... trong đó 1 cái có client thiếu UI (reschedule)" | ✅ số học khớp matrix (§2.3 ở trên) |
| Phase 1 "add removeTaskAssignment/updateWorkstream/getTaskDispatches/addTaskDependency/getEventHeadcount/addEventParticipant + reschedule reuse" | ✅ trùng đề xuất client-wiring wave của A; B **thiếu** nhắc `removeDependency` không tồn tại server (B có ghi "+remove nếu backend bổ sung" — tự vá đúng) |
| Phase 3 deep-link `/operations/events/:id?tab=` | ✅ trùng U-07/W2.2 (khác: A chọn `?event=&tab=` search-params thay path — hợp lệ cả hai; path hợp thị giác hơn, cân nhắc khi implement) |
| Phase 3 "server-side search/filter events (`q/scope/status`)" | ✅ phát hiện **hay hơn A**: server `GET /events` chưa có filter query nào (chỉ pagination) — thêm vào W2.x; lưu ý two-phase read hiện tính total post-auth nên server-filter khả thi |
| Phase 3 tách còn <400 dòng | ⚠️ mục tiêu quá đà ngắn hạn (B2' audit 09-12 đề xuất tách section, không đặt KPI dòng code); agree hướng, disagree ngưỡng cứng |
| §8 invariants giữ nguyên | ✅ chuẩn, khớp AGENTS/ADR-110 |

### 2.10 Những gì A có mà **B thiếu** (độ phủ P1/P2 yếu hơn)
1. **U-01/X2** người có `override_readiness` bị chính client chặn (nút forward disabled :1446–1448 trong khi modal override chỉ mở qua error server) — *lỗi logic luồng nghiêm trọng nhất, không nằm trong B.*
2. **U-02/X1** inbox reminder không title/link despite `taskId/eventId` sẵn data.
3. **U-03/C1** KPI filter cards không keyboard-accessible (WCAG 2.1.1).
4. **U-04/G1** `SmartEventTimePicker` nested-interactive switch.
5. **E-01** 409-không-code bị map `CONFLICT` đè message server (lệch error contract).
6. **X3** không có nút IN_PROGRESS; **X4** dispatch cap 100 im lặng (store :265 bỏ meta).
7. **SYNC-01** freshness gap (không poll) — B chỉ nói chung "cần E2E/manual".
8. **MB-03** badge chờ trên bottom-nav; **MB-04** KPI tap không scroll; **MB-01** FAB lệch primitive/safe-area.
9. **X7/X13/X14/U-15…** text-white tokens, panel-wide busy, template-preview-gated, menu Tab-hang.

### 2.11 Những gì B có mà **A thiếu** (đã merge)
1. **F0/M0** orphan TaskChecklistSection → W1.7 (TaskDetailModal).
2. **G6** lối dời giờ reminder từ inbox (kèm gate permission sửa ở §2.2) → W2.12.
3. **§3.3** standalone task full fields + parish-TZ default/label → W2.11.
4. **Server-side search** cho events (q/status/scope) → W2.13.
5. **F2** gom 4–5 nút task vào overflow menu → W3.8.
6. Nuance "canExecute vs hasPending loại trừ nhau" → ghi chú W1.6.

---

## 3. Đánh giá tổng thể bản B

**Điểm mạnh:**
- Ma trận endpoint `server:line + client + UI` rõ, chính xác, **độc lập trùng kết luận với A** (tín hiệu tốt cho cả hai: 7 gap sản phẩm + 0 dead call + idempotency/OCC/tenant đạt).
- Phần "Verification đã chạy (evidence)" — **tôi re-run độc lập và xác nhận đúng 100%** (lint:ds 0/155, vitest 40/40, 61 routes, 9 @critical). Đây là điểm cộng lớn nhất: claim bằng chứng của B không bịa.
- Bắt được 3 debt UX thật (orphan checklist, reschedule-inbox, drift TZ/standalone) mà A misses.
- Giữ đúng tinh thần invariant §8 (không suy diễn rule participants/dependencies).

**Điểm yếu (theo trọng số):**
1. **Xếp hạng sai ưu tiên chiến lược:** gọi orphan-checklist là bug P0 duy nhất trong khi miss 4 lỗi P1 verify-bằng-code (override lockout, inbox mù, KPI keyboard, nested switch). Người đọc chỉ dùng B sẽ fix nhầm thứ tự.
2. **Đính chính nhắm strawman** (§2.3, M3) — không chỉ mặt bản nào được đính chính; cả hai claim bị "sửa" đều không thuộc bản A.
3. **Một đề xuất implement sai gate nghiệp vụ:** G6 trong inbox không nhắc reschedule là manager-only capability → làm theo nguyên văn sinh 403 hàng loạt (B tự mâu thuẫn với đúng invariant §8 của chính mình).
4. **Mâu thuẫn với Phase B đã product-duyệt** (M1 reorder KPI-first) mà không flag rằng đó là behavior change cần duyệt lại + đụng test layout :574.
5. Bỏ cụm vấn đề chất lượng/token/deep-state rộng (busy per-panel, text-white, freshness, dispatch cap) — tức B phủ ~60% số finding có thể tái kiểm chứng của cuộc đối chiếu kép.

**Khuyến nghị sử dụng:** coi **A là roadmap superset**, giữ **B làm byline cho 5 hạng mục đã merge** (W1.7, W2.11–W2.13, W3.8). Bản B **không nên** dùng độc lập để ưu tiên sprint.

---

## 4. Bản vá vào plan A (áp dụng ngay khi thực thi)

| Merge | Wave | Nội dung |
|---|---|---|
| **W1.7 (mới)** | Wave 1 | `TaskDetailModal` (slide-over desktop 640px / bottom-sheet mobile): gom `TaskChecklistSection` + comments/handover/restore; xóa render đáy trang :1942; **cập nhật test unit :71 + E2E @critical spec :643–652** (checklist label hiện pin rendering inline) |
| **W2.11 (mới)** | Wave 2 | Standalone task: đủ `phase/priority/scheduled*/isRequired`; create-event default **parish TZ** + label "Giờ Xứ đoàn" khi browser TZ ≠ parish |
| **W2.12 (mới)** | Wave 2 | Inbox: nút "Dời giờ" reuse `rescheduleReminder` **chỉ khi** caller có capability manager của resource reminder (gate :1804), recipient thường vẫn chỉ Đọc/Hủy |
| **W2.13 (mới)** | Wave 2 | Server-side search `GET /events?q&status&scope` (thêm vào route, giữ client-filter làm fallback cache); debounce 300ms |
| **W3.8 (mới)** | Wave 3 | Action cluster task card: giữ "Hoàn tất + Chi tiết", gom "Nhận/Từ chối/Báo chặn/Hủy" vào `...` menu (role=menu, keyboard pattern như create menu) |
| Sửa ghi chú | — | Xóa mọi ngưỡng "<400 dòng" khỏi kỳ vọng W3.2; deep-link chọn `?event=&tab=` hoặc path — chốt khi implement |

*Các file plan/wave cập nhật: `docs/OPERATIONS_UX_SYNC_UPGRADE_PLAN_2026-09-13.md` (đã vá W1.7/W2.11–13/W3.8 vào bảng wave).*

---

## 5. Bài học phương pháp rút ra từ B (đã áp dụng vào quy trình + plan của chính tôi)

Không chỉ merge finding — cuộc đối chiếu này chỉ ra 5 tập quán audit cần đổi:

1. **"Grep client-function → gọi UI" không đủ; phải lần theo từng action command.** Cách làm đó của B tìm ra **G6** (`rescheduleReminder` có trong client + EventReminderForm nhưng inbox không có lối dời-giờ). Khi kiểm chứng G6, tôi tìm ra lớp sâu hơn mà **cả hai bản đều chưa thấy**: reschedule là **manager-only** (server :1804 không có self-exemption, trái với cancel :1852 CÓ) → làm theo nguyên văn B sẽ sinh 403 hàng loạt. Bài học: gap matrix phải có cột *"capability gate của command"* — đã thành chuẩn ở W2.12.

2. **Nghi thức "đính chính" chỉ có giá trị khi trỏ đúng nguồn.** B dành hai mục (§2.3 thẻ Hoàn tất, M3 PageHeader) để sửa những claim **bản A không hề viết** → người đọc mất thời gian verify các claim ảo. Quy trình mới: mọi cross-reference phải trích nguyên văn câu + số dòng của bản được đính chính.

3. **Đề xuất fix phải kèm điều kiện test-touchpoint.** B nêu fix đúng (TaskDetailModal) nhưng không đối chiếu test đang pin hành vi cũ; vòng verify này tôi kiểm tra tiếp và phát hiện **E2E @critical** (`e2e/operations.spec.ts:643–652`) đang `getByLabel('Mục checklist mới')` trong flow template→checklist inline — fix của B **sẽ làm đỏ E2E @critical** nếu không cập nhật spec. Đã ghi thẳng vào W1.7. Tương tự: reorder M1 đụng test layout `:574`. Mọi đề xuất thay đổi thứ tự/hiển thị phải liệt kê test bị pin.

4. **Luôn kiểm tra "chiều ngược lại" của một endpoint.** Gợi ý dependency-UI của B khiến tôi rà full surface `dependencies`: server CHỈ có POST thêm cạnh (:2700), **không có endpoint xóa** — cạnh chỉ tự hết chặn khi task nguồn DONE/CANCELLED (:2752–2753). UI "thêm được, không gỡ được" là bẫy mà cả hai bản suýt đề xuất → W4.2 giờ có điều kiện tiên quyết (backend DELETE trước, hoặc UI read-only). Quy trình mới: *mọi gap "backend có endpoint, UI thiếu" phải hỏi "command này có cặp đảo ngược không?" trước khi đề xuất nút bấm.*

5. **Tái-chạy bằng chứng của đối phương là rẻ và đáng làm.** `lint:ds` (vài giây) và `vitest run` một file (19 giây) xác nhận cả hai claim "đã chạy" của B là **thật, không bịa** — ngược lại nếu phát hiện bịa sẽ hạ điểm toàn bộ phần còn lại. Từ nay: re-run tối thiểu các claim evidence của bản chéo trước khi cân nhắc nội dung.

**Tự kiểm điểm có chọn lọc:** A miss orphan-checklist **không phải vì thiếu đọc code** (`:1942` đã nằm trong đoạn tôi đọc qua) mà vì thiếu một bước checklist: *"mọi nút bấm phải truy vết đích đến render của state nó set"* (nút `Chi tiết nhiệm vụ` :990–997 → `selectTask` → `TaskChecklistSection` render ở ĐÂU so với mắt người dùng?). Bước đó nay là bắt buộc khi audit mọi page.

---

## 6. Chốt cuối

Sau vòng 2 (cross-check → verify → học phương pháp): bản A (superset, đã merge 5 hạng mục + 2 phát hiện mới từ vòng verify) vẫn là **plan thực thi duy nhất**; bản B được ghi nhận là **input có giá trị** với tỷ lệ claim-verifiable-true rất cao (~95%, trừ 2 strawman + 1 gate-bẫy G6 + 1 reorder trái product-decision). Điểm đánh giá B sau vòng đối chiếu: **nâng từ 7.5 → 7.8/10** — điểm trừ chính nằm ở phương pháp dẫn chứng, không ở nội dung.

---

*Người đối chiếu: Qwen3.8 Flash Free (Kira AI). Toàn bộ claim của B được đọc lại trực tiếp trên working tree `967f067`; hai claim đã-chạy (lint:ds, vitest 40/40) được re-run độc lập và xác nhận; 2 phát hiện mới (reschedule manager-only gate; dependency không có endpoint xóa) verify bằng code trong vòng cross-check. Không sửa file mã nguồn trong lượt này — chỉ hai tài liệu docs.*
