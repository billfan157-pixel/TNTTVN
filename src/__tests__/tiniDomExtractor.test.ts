import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type ExtractResult = {
  error?: string
  schemaVersion?: number
  partial?: boolean
  renderedStudentRows?: number
  rowErrors?: { rowIndex: number; reason: string }[]
  observations?: {
    externalStudentId: string
    studentName: string
    dateOfBirth: string | null
    externalClassId: string | null
    className: string
    date: string
    sourceTitle: string
    late: boolean
  }[]
}

let extract: (root: Document, pageLocation: Pick<Location, 'hostname' | 'pathname' | 'origin'>) => ExtractResult
const tiniLocation = { hostname: 'ccams.thongtinxuanloc.com', pathname: '/glv', origin: 'https://ccams.thongtinxuanloc.com' }

beforeAll(async () => {
  // The extension script defines a single serializable function for Chrome's
  // isolated executeScript world; importing it here does not open a browser.
  // @ts-expect-error Plain extension JavaScript intentionally has no TS declarations.
  await import('../../tools/tini-dom-export/extractor.js')
  extract = (globalThis as any).extractTiniDom
})

function page(options: { reorder?: boolean; extraRow?: boolean; sourceTitle?: string; classOption?: boolean; dateTo?: string } = {}) {
  const doc = document.implementation.createHTMLDocument('Synthetic TINI attendance')
  const headings = options.reorder
    ? ['Điểm danh', 'Ghi chú', 'Lớp', 'Học viên']
    : ['Học viên', 'Lớp', 'Điểm danh', 'Ghi chú']
  const cells: Record<string, string> = {
    'Học viên': '<div><a href="/hv/demo/1000001?phone=private-access-value">Phaolô Nguyễn Mẫu</a><p>1000001 · 01/01/2015</p></div>',
    'Lớp': 'ẤU NHI 1A',
    'Điểm danh': `<span title="${options.sourceTitle ?? 'Có mặt Thánh lễ'}">Thánh lễ</span><span title="Vắng có phép Giáo lý">Giáo lý</span>`,
    'Ghi chú': '<p>Đi trễ</p>',
  }
  doc.body.innerHTML = `<main>
    <label for="from">Từ ngày</label><input id="from" placeholder="dd/mm/yyyy" value="20/09/2026">
    <label for="to">Đến ngày</label><input id="to" placeholder="dd/mm/yyyy" value="${options.dateTo ?? '20/09/2026'}">
    <label for="kind">Tùy chọn loại</label><select id="kind"><option value="all" selected>Hiện diện - Tất cả</option></select>
    <label for="year">Niên học</label><select id="year"><option value="2" selected>2026-2027</option></select>
    <label for="class">Khối / Lớp</label><select id="class"><option value="all" selected>Tất cả khối / lớp</option>${options.classOption === false ? '' : '<option value="l_22">ẤU NHI 1A</option>'}</select>
    <table><thead><tr>${headings.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    <tr>${headings.map(h => `<td>${cells[h]}</td>`).join('')}</tr>
    ${options.extraRow ? `<tr>${headings.map(h => `<td>${cells[h]}</td>`).join('')}</tr>` : ''}
    </tbody></table><button type="button">Xem thêm</button>
    <p>Phụ huynh: private-parent-value</p>
  </main>`
  return doc
}

describe('TINI rendered-page extractor', () => {
  it('reads the loaded table using headers even when reordered, without network or DOM writes', () => {
    const doc = page({ reorder: true })
    const before = doc.documentElement.outerHTML
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = extract(doc, tiniLocation)
    expect(result.observations).toHaveLength(2)
    expect(result.schemaVersion).toBe(3)
    expect(result.observations?.map(o => o.sourceTitle)).toEqual(['Có mặt Thánh lễ', 'Vắng có phép Giáo lý'])
    expect(result.observations?.[0]).toMatchObject({ externalStudentId: '1000001', dateOfBirth: '2015-01-01',
      externalClassId: 'l_22', date: '2026-09-20', late: true })
    expect(result.partial).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/private-access-value|private-parent-value/)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(doc.documentElement.outerHTML).toBe(before)
    fetchSpy.mockRestore()
  })

  it('preserves unsupported badge labels and duplicate rows for server review', () => {
    const result = extract(page({ sourceTitle: 'Chầu Thánh Thể', extraRow: true }), tiniLocation)
    expect(result.renderedStudentRows).toBe(2)
    expect(result.observations).toHaveLength(4)
    expect(result.observations?.[0].sourceTitle).toBe('Chầu Thánh Thể')
  })

  it('marks class ID unavailable when no unique rendered class option exists', () => {
    const result = extract(page({ classOption: false }), tiniLocation)
    expect(result.observations?.[0].externalClassId).toBeNull()
  })

  it('refuses a date range and a different page kind', () => {
    expect(extract(page({ dateTo: '21/09/2026' }), tiniLocation).error).toMatch(/một ngày/)
    expect(extract(page(), { ...tiniLocation, pathname: '/hv' }).error).toMatch(/không phải/)
  })

  it('fails closed when a required table header drifts', () => {
    const doc = page()
    const classHeader = Array.from(doc.querySelectorAll('th')).find(node => node.textContent === 'Lớp')
    classHeader!.textContent = 'Lớp học'
    expect(extract(doc, tiniLocation).error).toMatch(/Cấu trúc cột/)
  })

  it('keeps the extension read-only and least-privileged', () => {
    const base = join(process.cwd(), 'tools', 'tini-dom-export')
    const manifest = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'))
    const popup = readFileSync(join(base, 'popup.js'), 'utf8')
    const extractor = readFileSync(join(base, 'extractor.js'), 'utf8')
    expect(manifest.permissions).toEqual(['activeTab', 'scripting'])
    expect(manifest.host_permissions).toBeUndefined()
    expect(`${popup}\n${extractor}`).not.toMatch(/(?:\bfetch\s*\(|\bnew\s+XMLHttpRequest|tabs\.create\s*\(|cookies\.|localStorage\.|sessionStorage\.)/)
  })
})
