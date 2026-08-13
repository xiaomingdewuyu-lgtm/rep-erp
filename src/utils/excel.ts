import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

export function exportToExcel(rows: any[], columns: { key: string; title: string }[], filename: string) {
  const data = rows.map((r) => {
    const o: any = {}
    columns.forEach((c) => {
      o[c.title] = r[c.key] ?? ''
    })
    return o
  })
  const ws = XLSX.utils.json_to_sheet(data)
  // 自动列宽
  const colWidths = columns.map((c) => {
    const maxLen = Math.max(
      c.title.length * 2,
      ...data.map((d) => String(d[c.title] ?? '').length + 2),
    )
    return { wch: Math.min(40, Math.max(10, maxLen)) }
  })
  ;(ws as any)['!cols'] = colWidths
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`)
}

export function downloadTemplate(columns: { title: string; sample?: string }[], filename: string) {
  const sample: any = {}
  columns.forEach((c) => (sample[c.title] = c.sample ?? ''))
  const ws = XLSX.utils.json_to_sheet([sample])
  ;(ws as any)['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.title.length * 2 + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${filename}_导入模板.xlsx`)
}

export function readExcel(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(json as any[])
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function exportJSON(obj: any, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 多 sheet 全量导出
export function exportWorkbook(sheets: { name: string; rows: any[] }[], filename: string) {
  const wb = XLSX.utils.book_new()
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}])
    XLSX.utils.book_append_sheet(wb, ws, s.name)
  })
  XLSX.writeFile(wb, `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`)
}

export function parseExcelDate(v: any): number | undefined {
  if (!v && v !== 0) return undefined
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') {
    // Excel 序列号
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return new Date(d.y, d.m - 1, d.d).getTime()
  }
  const parsed = dayjs(String(v))
  return parsed.isValid() ? parsed.valueOf() : undefined
}

export function num(v: any, def = 0): number {
  const n = Number(String(v).replace(/[,，¥\s]/g, ''))
  return isNaN(n) ? def : n
}
