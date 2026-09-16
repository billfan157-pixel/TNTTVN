/**
 * Tập trung ánh xạ mã lỗi (error codes) của phân hệ Operations sang tiếng Việt thân thiện.
 * Hỗ trợ các mã lỗi từ Backend (domain authorization, OCC, idempotency, lifecycle, scope).
 */

const OPERATIONS_ERROR_MAP: Record<string, string> = {
  // 1. Concurrency & Idempotency
  VERSION_CONFLICT: 'Dữ liệu đã bị thay đổi bởi người khác. Hệ thống đã tải lại phiên bản mới nhất, vui lòng kiểm tra và thử lại.',
  VERSION_MISMATCH: 'Dữ liệu đã bị thay đổi bởi người khác. Hệ thống đã tải lại phiên bản mới nhất, vui lòng kiểm tra và thử lại.',
  IDEMPOTENCY_KEY_REQUIRED: 'Thiếu mã định danh thao tác (Idempotency Key).',
  IDEMPOTENCY_CONFLICT: 'Thao tác này đã được ghi nhận với nội dung khác. Vui lòng tải lại và tạo thao tác mới.',
  IDEMPOTENCY_REPLAY_EXPIRED: 'Thao tác đã được ghi nhận trước đó. Vui lòng tải lại danh sách để xem kết quả.',

  // 2. Organizer & Leadership
  ORGANIZER_REQUIRED: 'Sự kiện bắt buộc phải chỉ định Người phụ trách (Organizer) hợp lệ.',
  ORGANIZER_MUST_BE_PARISH_LEADER: 'Người phụ trách (Organizer) của sự kiện Xứ đoàn phải là Xứ đoàn trưởng đang đương nhiệm.',
  ORGANIZER_MUST_BE_UNIT_LEADER: 'Người phụ trách sự kiện chuyên môn phải là Trưởng Ban/Trưởng Ngành của đơn vị hoặc Xứ đoàn trưởng.',
  UNIT_SCOPE_MISMATCH: 'Sự kiện chuyên môn phải thuộc đúng Ban/Ngành mà người phụ trách đảm nhiệm.',
  WORKSTREAM_LEAD_OUTSIDE_UNIT: 'Trưởng Mảng/Field phải thuộc đúng đơn vị phụ trách chuyên môn.',
  USE_LEAD_REPLACEMENT: 'Sự kiện đang diễn ra (LIVE); vui lòng dùng thao tác thay thế Trưởng nhóm để tránh gián đoạn điều hành.',
  LEAD_REPLACEMENT_REQUIRES_LIVE: 'Thao tác thay thế Trưởng nhóm nguyên tử chỉ áp dụng khi sự kiện đang diễn ra (LIVE).',
  CURRENT_LEAD_REQUIRED: 'Nhóm đã có Trưởng nhóm; vui lòng chọn đúng người hiện tại để thay thế.',
  LEAD_TARGET_ALREADY_ACTIVE: 'Người được chọn đã là Trưởng nhóm của nhóm này.',
  FIELD_SCOPE_REQUIRED: 'Mảng (Field) trong sự kiện Xứ đoàn phải gắn đúng một Ban/Ngành phụ trách.',
  STANDALONE_WORKSTREAM_SCOPE_REQUIRED: 'Nhóm độc lập phải thuộc một Ban/Ngành phụ trách.',
  STANDALONE_TASK_SCOPE_REQUIRED: 'Công việc độc lập phải thuộc một Ban/Ngành phụ trách.',

  // 3. Scope & Assignment Target
  TARGET_OUTSIDE_ORGANIZATION_SCOPE: 'Chỉ được phân công thành viên thuộc phạm vi đơn vị phụ trách.',
  INVALID_OPERATIONS_TARGET: 'Tài khoản hoặc nhân sự đích không có quyền truy cập phân hệ Điều hành (Operations).',
  OPERATION_EVENT_SCOPE_TYPE_MISMATCH: 'Phạm vi sự kiện (Xứ đoàn / Chuyên môn) không khớp với cấu hình đơn vị phụ trách.',
  DISPATCH_ACKNOWLEDGEMENT_DEADLINE_PASSED: 'Hạn nhận nhiệm vụ phải sau thời điểm sự kiện chuyển sang Kế hoạch.',
  DISPATCH_PRIMARY_NOT_ACTIONABLE: 'Người thực hiện chính không còn tài khoản hoạt động trong hệ thống.',
  DISPATCH_EVENT_NOT_OPEN: 'Lời mời chỉ có hiệu lực khi sự kiện đang mở (Kế hoạch/Chuẩn bị/Sẵn sàng).',
  DISPATCH_NOT_INVITED: 'Bạn không nằm trong danh sách được mời của lượt phân công này.',
  DISPATCH_TARGETS_MUST_DIFFER: 'Người chính và người dự bị phải là hai người khác nhau.',
  DISPATCH_ALREADY_RESOLVED: 'Lượt phân công này đã được xử lý (đã có người nhận hoặc đã hủy).',
  DISPATCH_EVENT_REQUIRED: 'Phân công theo lượt mời chỉ áp dụng cho nhiệm vụ thuộc sự kiện.',
  EVENT_NOT_OPEN: 'Sự kiện hiện không cho phép phản hồi nhiệm vụ.',
  TASK_DISPATCH_ACTIVE: 'Đang có lượt mời chờ xử lý; không thể giao trực tiếp. Hãy chờ kết quả hoặc hủy lượt mời.',
  TASK_OWNER_EXISTS: 'Nhiệm vụ đã có người phụ trách chính.',
  TASK_NOT_CANCELLED: 'Chỉ nhiệm vụ đã hủy mới được khôi phục.',

  // 4. Lifecycle & Transition
  READINESS_BLOCKED: 'Còn điều kiện sẵn sàng (Readiness) chưa hoàn tất trước khi sự kiện có thể diễn ra.',
  COMPLETION_BLOCKED: 'Còn nhiệm vụ bắt buộc hoặc điều kiện chưa hoàn tất để đóng sự kiện.',
  TASK_ACCEPTANCE_PENDING: 'Còn người thực hiện chưa xác nhận nhận nhiệm vụ được giao.',
  EVENT_IMMUTABLE: 'Sự kiện đã kết thúc hoặc đang diễn ra, không thể thay đổi thông tin cơ bản.',
  TASK_IMMUTABLE: 'Nhiệm vụ đã kết thúc; không thể thay đổi cấu trúc hoặc phân công.',
  EVENT_TRANSITION_INVALID: 'Không thể chuyển/hủy sự kiện từ giai đoạn hiện tại. Chỉ được chuyển từng giai đoạn liền kề.',
  EVENT_REWIND_REASON_REQUIRED: 'Lùi giai đoạn sự kiện bắt buộc phải nhập lý do.',
  EVENT_COMPLETED_TERMINAL: 'Sự kiện đã hoàn tất; không thể chuyển giai đoạn tiếp.',
  EVENT_TASK_REQUIRED: 'Thao tác này yêu cầu nhiệm vụ thuộc sự kiện.',
  CALENDAR_LINK_SERVER_MANAGED: 'Liên kết Lịch do hệ thống tự quản lý, không thể chọn tay.',
  PUBLIC_EVENT_TITLE_TOO_LONG: 'Tên sự kiện công khai vượt quá độ dài cho phép của Lịch.',
  PUBLIC_EVENT_LOCATION_TOO_LONG: 'Địa điểm sự kiện công khai vượt quá độ dài cho phép của Lịch.',
  INVALID_TASK_SCHEDULE: 'Ca công việc phải có đủ giờ bắt đầu/kết thúc và giờ kết thúc phải muộn hơn.',
  INVALID_ACKNOWLEDGEMENT_DEADLINE: 'Hạn nhận nhiệm vụ không hợp lệ.',
  REMINDER_RECIPIENT_NOT_AUTHORIZED: 'Người nhận không còn quyền xem nội dung được nhắc.',
  RETROSPECTIVE_REQUIRES_COMPLETED: 'Chỉ ghi đúc kết sau khi sự kiện đã hoàn tất.',
  FOLLOW_UP_REQUIRES_COMPLETED: 'Chỉ tạo việc tiếp nối sau khi sự kiện đã hoàn tất.',
  TEMPLATE_SCOPE_MISMATCH: 'Mẫu và sự kiện phải cùng phạm vi Ban/Ngành.',
  TEMPLATE_ALREADY_ACTIVE: 'Mẫu đang hoạt động, không cần khôi phục.',
  TEMPLATE_ALREADY_ARCHIVED: 'Mẫu đã lưu trữ.',
  AUTOMATION_NOT_PAUSED: 'Tự động chuyển giai đoạn không ở trạng thái tạm dừng.',
  COMPLETION_RECORD_MISSING: 'Không tìm thấy hồ sơ hoàn thành do phân hệ Điều hành sở hữu.',
  TEMPLATE_SNAPSHOT_INVALID: 'Mẫu sự kiện không hợp lệ, không thể khởi tạo.',

  // 5. Generic HTTP & Auth codes
  // W1.5 (E-01): these generic codes carry NO specific domain meaning — the
  // backend assigns them as a catch-all when a throw had a status but no code.
  // The server's own Vietnamese message is therefore more accurate and wins in
  // operationsErrorText (GENERIC_OPERATIONS_CODES below). The map entries here
  // only serve as last-resort text when the server sent no message at all.
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này trong phạm vi hiện tại.',
  NOT_FOUND: 'Không tìm thấy dữ liệu yêu cầu.',
  CONFLICT: 'Thao tác xung đột với dữ liệu hiện có. Vui lòng tải lại và thử lại.',
  VALIDATION_ERROR: 'Dữ liệu biểu mẫu không hợp lệ. Vui lòng kiểm tra lại các trường nhập.',
  // W1.5 (E-02): FSM adjacency code surfaced by the event transition route —
  // previously unmapped, which left the raw message untranslated.
  EVENT_TRANSITION_NOT_ADJACENT: 'Chỉ được chuyển từng giai đoạn liền kề.',
}

/**
 * Generic status-only codes assigned by the backend catch-all handler
 * (handleError): the specific information lives in the message, not the code.
 * For these, a server-provided message always beats the generic map text.
 */
const GENERIC_OPERATIONS_CODES = new Set(['CONFLICT', 'VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND'])

export function operationsErrorText(code: string | undefined | null, defaultMessage?: string): string {
  const message = defaultMessage?.trim()
  // W1.5: preserve the server's specific Vietnamese text when the attached
  // code is only a generic status fallback (e.g. 409 without a domain code).
  if (code && GENERIC_OPERATIONS_CODES.has(code) && message) return message
  if (code && OPERATIONS_ERROR_MAP[code]) {
    return OPERATIONS_ERROR_MAP[code]
  }
  if (message) {
    if (OPERATIONS_ERROR_MAP[message]) {
      return OPERATIONS_ERROR_MAP[message]
    }
    return defaultMessage as string
  }
  return 'Thao tác không thành công. Vui lòng kiểm tra kết nối và thử lại.'
}
