type JsonObject = Record<string, unknown>
const object = (value: unknown): value is JsonObject => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max = 2000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max

export function validateAnswerLineCount(value: unknown): string | null {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100)
    ? null : 'Số dòng trả lời phải là số nguyên từ 0 đến 100.'
}

/** Validate the JSON shared by bank versions, session definitions and snapshots. */
export function validateStructuredAnswer(format: 'fill_blank' | 'matching' | 'essay', data: unknown, requireAnswers = false): string | null {
  if (!object(data)) return 'Cấu trúc câu hỏi phải là một object.'
  if (format === 'essay') {
    const lineError = validateAnswerLineCount(data.answerLineCount)
    if (lineError) return lineError
    if (data.subparts === undefined) return null
    if (!Array.isArray(data.subparts) || data.subparts.length > 50) return 'Câu tự luận chỉ được có tối đa 50 ý nhỏ.'
    for (const part of data.subparts) {
      if (!object(part) || !text(part.label, 30) || !text(part.text)) return 'Mỗi ý nhỏ cần nhãn và nội dung không rỗng.'
      if (part.points !== undefined && (typeof part.points !== 'number' || !Number.isFinite(part.points) || part.points <= 0 || part.points > 100)) return 'Điểm của ý nhỏ phải nằm trong khoảng (0, 100].'
    }
    return null
  }
  if (format === 'fill_blank') {
    // Existing one-gap bank records use acceptedAnswers without a blanks array.
    if (data.blanks === undefined) {
      if (!Array.isArray(data.acceptedAnswers) || !data.acceptedAnswers.length || data.acceptedAnswers.some(answer => !text(answer, 500))) return 'Điền khuyết cần danh sách ô trống và đáp án hợp lệ.'
      return null
    }
    if (!Array.isArray(data.blanks) || data.blanks.length < 1 || data.blanks.length > 50) return 'Câu điền khuyết cần từ 1 đến 50 ô trống.'
    const ids = new Set<string>()
    for (const blank of data.blanks) {
      if (!object(blank) || !text(blank.id, 30) || ids.has(blank.id) || !Array.isArray(blank.acceptedAnswers) || blank.acceptedAnswers.length > 20 || blank.acceptedAnswers.some(answer => !text(answer, 500))) return 'Ô trống cần mã duy nhất và danh sách đáp án dạng văn bản.'
      if (requireAnswers && !blank.acceptedAnswers.length) return 'Cần bổ sung đáp án cho từng ô trống trước khi duyệt.'
      ids.add(blank.id)
    }
    if (data.wordBank !== undefined && (!Array.isArray(data.wordBank) || data.wordBank.length > 100 || data.wordBank.some(word => !text(word, 500)))) return 'Ngân hàng từ không hợp lệ.'
    return null
  }
  const columns: Set<string>[] = []
  for (const name of ['left', 'right']) {
    const column = data[name]
    if (!Array.isArray(column) || column.length < 2 || column.length > 50) return 'Mỗi cột ghép cần từ 2 đến 50 mục.'
    const ids = new Set<string>()
    for (const item of column) {
      if (!object(item) || !text(item.id, 30) || !text(item.text, 500) || ids.has(item.id)) return 'Mục ghép cột cần mã duy nhất và nội dung không rỗng.'
      ids.add(item.id)
    }
    columns.push(ids)
  }
  if (!Array.isArray(data.pairs) || data.pairs.length > 2500) return 'Danh sách đáp án ghép cột không hợp lệ.'
  const seen = new Set<string>()
  for (const pair of data.pairs) {
    if (!object(pair) || typeof pair.leftId !== 'string' || typeof pair.rightId !== 'string' || !columns[0].has(pair.leftId) || !columns[1].has(pair.rightId) || seen.has(`${pair.leftId}\u0000${pair.rightId}`)) return 'Đáp án ghép phải tham chiếu đúng mục của hai cột và không trùng cặp.'
    seen.add(`${pair.leftId}\u0000${pair.rightId}`)
  }
  if (requireAnswers && [...columns[0]].some(id => !(data.pairs as JsonObject[]).some(pair => pair.leftId === id))) return 'Cần đáp án cho mỗi mục ở cột A trước khi duyệt.'
  return null
}
