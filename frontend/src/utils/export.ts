/**
 * exportToCSV — converts an array of objects to a CSV file and triggers download.
 * @param rows    Array of objects (keys become column headers)
 * @param filename File name without extension
 */
export function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return

  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    // Wrap in quotes if value contains comma, newline, or quote
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
