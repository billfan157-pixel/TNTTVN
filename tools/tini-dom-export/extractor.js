/* Executed only by the popup's explicit click, in Chrome's isolated world.
 * Read-only DOM traversal. No fetch, XHR, storage, navigation, scroll or click.
 */
globalThis.extractTiniDom = function extractTiniDom(root = document, pageLocation = location) {
  const fail = (message) => ({ error: message })
  if (pageLocation.hostname !== 'ccams.thongtinxuanloc.com' || pageLocation.pathname !== '/glv') {
    return fail('Đây không phải trang tra cứu điểm danh TINI.')
  }

  const labelledControl = (selector, label) => [...root.querySelectorAll(selector)]
    .find(element => root.querySelector(`label[for="${element.id}"]`)?.textContent?.trim() === label)
  const from = labelledControl('main input[placeholder="dd/mm/yyyy"]', 'Từ ngày')?.value
  const to = labelledControl('main input[placeholder="dd/mm/yyyy"]', 'Đến ngày')?.value
  const isoDate = (text) => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text || '')
    if (!match) return null
    const date = `${match[3]}-${match[2]}-${match[1]}`
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString().slice(0, 10) === date ? date : null
  }
  if (!from || from !== to || !isoDate(from)) return fail('Chỉ hỗ trợ một ngày điểm danh hợp lệ mỗi lần xuất.')

  const typeControl = labelledControl('main select', 'Tùy chọn loại')
  const yearControl = labelledControl('main select', 'Niên học')
  const classControl = labelledControl('main select', 'Khối / Lớp')
  if (!typeControl || !yearControl || !classControl) return fail('Không tìm thấy bộ lọc điểm danh TINI.')
  const selectedFilter = typeControl.selectedOptions[0]?.textContent?.trim() || ''
  if (!/^(Hiện diện|Vắng)/.test(selectedFilter)) return fail('Bộ lọc hiện tại không phải danh sách điểm danh.')

  const table = root.querySelector('main table')
  if (!table) return fail('Không tìm thấy bảng điểm danh đang tải trên trang.')
  const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent?.trim() || '')
  const at = (name) => headers.indexOf(name)
  if (['Học viên', 'Lớp', 'Điểm danh', 'Ghi chú'].some(name => at(name) < 0)) {
    return fail('Cấu trúc cột điểm danh TINI đã thay đổi.')
  }

  const classOptions = [...classControl.options]
    .filter(option => /^l_[A-Za-z0-9_-]+$/.test(option.value))
    .map(option => ({ id: option.value, name: option.textContent?.trim() || '' }))
  const observations = []
  const rowErrors = []
  const rows = [...table.querySelectorAll('tbody tr')]
  for (const [rowIndex, row] of rows.entries()) {
    const cells = [...row.children]
    const identityCell = cells[at('Học viên')]
    const link = identityCell?.querySelector('a[href]')
    const identityDetails = identityCell?.querySelector('p')?.textContent?.trim() || ''
    const identityParts = identityDetails.split('·').map(part => part.trim())
    const code = identityParts[0] || ''
    const dateOfBirth = identityParts.map(isoDate).find(Boolean) || null
    let externalStudentId = ''
    try {
      const url = new URL(link?.getAttribute('href') || '', pageLocation.origin)
      const segments = url.pathname.split('/').filter(Boolean)
      if (url.origin === pageLocation.origin && segments[0] === 'hv' && segments.length === 3) {
        externalStudentId = segments[2]
      }
    } catch { /* classified below */ }
    if (!externalStudentId || code !== externalStudentId || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
      rowErrors.push({ rowIndex, reason: 'student_id_unavailable_or_mismatch' })
      continue
    }
    const studentName = link?.textContent?.trim() || ''
    const className = cells[at('Lớp')]?.textContent?.trim() || ''
    const classMatches = classOptions.filter(option => option.name === className)
    const classId = classMatches.length === 1 ? classMatches[0].id : null
    const noteText = cells[at('Ghi chú')]?.textContent?.trim() || ''
    const late = /trễ|muộn/i.test(noteText)
    const badges = [...(cells[at('Điểm danh')]?.querySelectorAll('[title]') || [])]
    if (badges.length === 0) rowErrors.push({ rowIndex, reason: 'attendance_badge_unavailable' })
    for (const badge of badges) {
      const sourceTitle = badge.getAttribute('title')?.trim() || ''
      observations.push({
        externalStudentId,
        studentName: studentName.slice(0, 120),
        dateOfBirth,
        externalClassId: classId,
        className: className.slice(0, 80),
        date: isoDate(from),
        sourceTitle: sourceTitle.slice(0, 100),
        late,
      })
    }
  }

  return {
    format: 'catevia-tini-dom-attendance',
    schemaVersion: 3,
    provider: 'tini',
    extractedAt: new Date().toISOString(),
    sourcePageKind: 'glv-attendance',
    sourcePath: '/glv',
    academicYear: {
      externalId: yearControl.value,
      label: yearControl.selectedOptions[0]?.textContent?.trim() || '',
    },
    scope: {
      date: isoDate(from),
      filter: selectedFilter,
      externalClassId: classControl.value.startsWith('l_') ? classControl.value : null,
      className: classControl.selectedOptions[0]?.textContent?.trim() || '',
    },
    partial: [...root.querySelectorAll('main button')].some(button => button.textContent?.trim() === 'Xem thêm'),
    renderedStudentRows: rows.length,
    rowErrors,
    observations,
  }
}
