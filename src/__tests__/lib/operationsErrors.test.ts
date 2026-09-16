import { describe, expect, it } from 'vitest'
import { operationsErrorText } from '../../lib/operationsErrors'

describe('operationsErrorText (W1.5: server message must survive generic codes)', () => {
  it('prefers the server Vietnamese message when the code is only a generic status fallback', () => {
    // Server assigns CONFLICT/VALIDATION_ERROR to throws that carried a status
    // but no domain code — the message is the payload, the code is noise.
    expect(operationsErrorText('CONFLICT', 'Không thể chuyển task từ DONE sang TODO.'))
      .toBe('Không thể chuyển task từ DONE sang TODO.')
    expect(operationsErrorText('VALIDATION_ERROR', 'Hủy task bắt buộc có lý do.'))
      .toBe('Hủy task bắt buộc có lý do.')
    expect(operationsErrorText('FORBIDDEN', 'Bạn không có quyền Operations trong phạm vi này.'))
      .toBe('Bạn không có quyền Operations trong phạm vi này.')
    expect(operationsErrorText('NOT_FOUND', 'Không tìm thấy task.'))
      .toBe('Không tìm thấy task.')
  })

  it('keeps the specific domain-code translation even when a message exists', () => {
    // Domain codes own precise wording; the raw server text must not leak.
    expect(operationsErrorText('VERSION_CONFLICT', 'Task đã bị thay đổi bởi người khác.'))
      .toBe(operationsErrorText('VERSION_CONFLICT'))
    expect(operationsErrorText('READINESS_BLOCKED')).toContain('điều kiện sẵn sàng')
  })

  it('maps EVENT_TRANSITION_NOT_ADJACENT (W1.5 / E-02)', () => {
    expect(operationsErrorText('EVENT_TRANSITION_NOT_ADJACENT', 'Chỉ được chuyển từng giai đoạn liền kề từ DRAFT.'))
      .toBe('Chỉ được chuyển từng giai đoạn liền kề.')
  })

  it('maps EVENT_NOT_OPEN (V5: acknowledgement on a closed event)', () => {
    expect(operationsErrorText('EVENT_NOT_OPEN', 'Sự kiện hiện không cho phép phản hồi nhiệm vụ.'))
      .toBe('Sự kiện hiện không cho phép phản hồi nhiệm vụ.')
  })

  it('falls back to the message when the code is unknown', () => {
    expect(operationsErrorText('SOMETHING_NEW', 'Máy chủ nói gì đó mới.'))
      .toBe('Máy chủ nói gì đó mới.')
  })

  it('uses generic text only when neither a message nor a mapped code exists', () => {
    expect(operationsErrorText('CONFLICT')).toBe(operationsErrorText('CONFLICT', undefined))
    expect(operationsErrorText(undefined)).toBe('Thao tác không thành công. Vui lòng kiểm tra kết nối và thử lại.')
  })
})
