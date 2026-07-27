// Value <-> text conversion shared by the renderer, the editors and the
// clipboard. Copy emits exactly what a cell displays, and paste runs the
// inverse, so a round-trip through Excel is lossless for every column type.

import type { GridCellValue, GridColumn, GridRow } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Narrow an arbitrary row property to something a cell can hold. */
export function toCellValue(value: unknown): GridCellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return toIsoDate(value)
  return String(value)
}

/** Accepts `YYYY-MM-DD`, `YYYY/M/D` or a Date. Parsed as *local* time. */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value.trim())
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Storage format for `date` columns. */
export function toIsoDate(value: unknown): string | null {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : null
}

export function formatDate(value: unknown): string {
  const date = toDate(value)
  return date ? `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}` : ''
}

/** Reject 2026-02-31 and friends: JS Date silently rolls them over. */
function buildIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return `${year}-${pad(month)}-${pad(day)}`
}

const expandYear = (year: number) => (year < 100 ? 2000 + year : year)

/**
 * Parse the shorthand people actually type into a date cell, completing the
 * missing parts from `base` (today, unless a base is given):
 *
 *   `1` / `01`        -> the 1st of the current month
 *   `701` / `0701`    -> July 1st of the current year
 *   `260701`          -> 2026-07-01   `20260701` -> 2026-07-01
 *   `7/1`  `7-1`      -> July 1st of the current year
 *   `26/7/1` `2026-07-01` -> as written
 *
 * Returns `null` when the text is not a date, so callers can leave the cell
 * untouched rather than wiping it on a typo.
 */
export function parseFlexibleDate(text: string, base = new Date()): string | null {
  const trimmed = text.trim().replace(/[年月]/g, '/').replace(/日$/, '')
  if (!trimmed) return null

  const year = base.getFullYear()
  const month = base.getMonth() + 1

  const digits = trimmed.replace(/[^\d]/g, '')
  if (/^\d+$/.test(trimmed)) {
    switch (digits.length) {
      case 1:
      case 2:
        return buildIsoDate(year, month, Number(digits))
      case 3:
        return buildIsoDate(year, Number(digits.slice(0, 1)), Number(digits.slice(1)))
      case 4:
        return buildIsoDate(year, Number(digits.slice(0, 2)), Number(digits.slice(2)))
      case 6:
        return buildIsoDate(
          expandYear(Number(digits.slice(0, 2))),
          Number(digits.slice(2, 4)),
          Number(digits.slice(4)),
        )
      case 8:
        return buildIsoDate(
          Number(digits.slice(0, 4)),
          Number(digits.slice(4, 6)),
          Number(digits.slice(6)),
        )
      default:
        return null
    }
  }

  const parts = trimmed.split(/[-/.\s]+/).filter(Boolean)
  if (parts.some((part) => !/^\d{1,4}$/.test(part))) return null
  if (parts.length === 2) return buildIsoDate(year, Number(parts[0]), Number(parts[1]))
  if (parts.length === 3) {
    return buildIsoDate(expandYear(Number(parts[0])), Number(parts[1]), Number(parts[2]))
  }
  return null
}

/** The blank a column falls back to when cleared. */
export function emptyValue(column: GridColumn): GridCellValue {
  return column.type === 'checkbox' ? false : null
}

/** Text shown in a cell — and the text copied to the clipboard. */
export function cellText(column: GridColumn, row: GridRow): string {
  const value = row[column.key]
  if (column.format) return column.format(value, row)

  switch (column.type) {
    case 'checkbox':
      return value ? 'TRUE' : 'FALSE'
    case 'date':
      return formatDate(value)
    case 'select':
    case 'autocomplete': {
      const option = column.items?.find((item) => item.value === value)
      if (option) return option.title
      return value === null || value === undefined ? '' : String(value)
    }
    default:
      return value === null || value === undefined ? '' : String(value)
  }
}

const TRUE_TEXTS = new Set(['true', '1', 'yes', 'y', 'on', '✓', 'はい', '有効'])

/** Inverse of {@link cellText}: turn pasted/typed text into a stored value. */
export function parseText(column: GridColumn, text: string): GridCellValue {
  const trimmed = text.trim()

  switch (column.type) {
    case 'checkbox':
      return TRUE_TEXTS.has(trimmed.toLowerCase())
    case 'number': {
      if (!trimmed) return null
      const n = Number(trimmed.replace(/[,\s]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    case 'date':
      // Pasted dates get the same shorthand handling as typed ones.
      return trimmed ? (toIsoDate(trimmed) ?? parseFlexibleDate(trimmed)) : null
    case 'select':
    case 'autocomplete': {
      if (!trimmed) return null
      // Match the label first (that is what we copy), then the raw value.
      const byTitle = column.items?.find((item) => item.title === trimmed)
      if (byTitle) return byTitle.value
      const byValue = column.items?.find((item) => String(item.value) === trimmed)
      return byValue ? byValue.value : null
    }
    default:
      return text
  }
}

/** Coerce an in-progress editor value to the column's storage type. */
export function normalizeDraft(column: GridColumn, draft: GridCellValue): GridCellValue {
  switch (column.type) {
    case 'number': {
      if (draft === null || draft === '') return null
      const n = typeof draft === 'number' ? draft : Number(String(draft).replace(/[,\s]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    case 'checkbox':
      return Boolean(draft)
    case 'date':
      return typeof draft === 'string' && draft ? draft : null
    default:
      return draft
  }
}

/**
 * Parse clipboard TSV into a matrix, honouring Excel's quoting of fields that
 * contain tabs, newlines or quotes.
 */
export function parseClipboardMatrix(text: string): string[][] {
  const matrix: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
    } else if (char === '\t') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      matrix.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field)
  matrix.push(row)

  // A trailing newline yields one phantom empty row.
  while (matrix.length > 1) {
    const last = matrix[matrix.length - 1]
    if (last.length === 1 && last[0] === '') matrix.pop()
    else break
  }
  return matrix
}

/** Serialise a matrix back to the TSV flavour Excel and Sheets expect. */
export function toClipboardText(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((field) => (/[\t\n\r"]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
        .join('\t'),
    )
    .join('\n')
}
