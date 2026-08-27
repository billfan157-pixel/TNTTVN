const FORMULA_PREFIX = /^[\s]*[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/

export function escapeSpreadsheetCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  // Human-view CSV: force untrusted formula-looking values to text in Excel.
  if (FORMULA_PREFIX.test(text)) text = `\t${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function rowsToSafeCsv(rows: Array<Record<string, unknown>>): string {
  const headers = Object.keys(rows[0] || {})
  if (headers.length === 0) return ''
  return [
    headers.map(escapeSpreadsheetCell).join(','),
    ...rows.map((row) => headers.map((header) => escapeSpreadsheetCell(row[header])).join(',')),
  ].join('\r\n')
}
