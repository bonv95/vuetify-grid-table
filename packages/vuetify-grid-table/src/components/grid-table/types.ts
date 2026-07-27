// Public types for <GridTable>. Only type-level Vue imports, so plain modules
// (formatters, parsers, callers building column defs) can use them.

import type { CSSProperties } from 'vue'

/** Editor rendered for a column; each maps to a Vuetify input. */
export type GridColumnType = 'text' | 'number' | 'select' | 'autocomplete' | 'date' | 'checkbox'

/** Everything a cell is allowed to hold. Dates are stored as `YYYY-MM-DD`. */
export type GridCellValue = string | number | boolean | null

export interface GridRow {
  [key: string]: unknown
}

/** Option shape for `select` / `autocomplete` columns. */
export interface GridOption {
  title: string
  value: GridCellValue
}

export interface GridColumn {
  /** Property read from (and written to) each row. */
  key: string
  /** Header label. */
  title: string
  /** Defaults to `text`. */
  type?: GridColumnType
  /** Initial width in px; the user can drag it afterwards. */
  width?: number
  /** Floor for drag-resizing (default 60). */
  minWidth?: number
  align?: 'start' | 'center' | 'end'
  /** Header alignment; falls back to `align`. */
  headerAlign?: 'start' | 'center' | 'end'
  /** Inline style for this column's header cell, merged over the table's. */
  headerStyle?: CSSProperties
  /** Class(es) for this column's header cell. */
  headerClass?: string
  /** Set false for a read-only column (still selectable and copyable). */
  editable?: boolean
  /** Options for `select` / `autocomplete`. */
  items?: GridOption[]
  /** Overrides the rendered (and copied) text. */
  format?: (value: unknown, row: GridRow) => string
}

/** Overridable wording for the right-click menu. */
export interface GridMenuLabels {
  insertAbove: string
  insertBelow: string
  deleteRow: string
  copyRow: string
}

export interface GridCellRef {
  row: number
  col: number
}

/** Normalised selection rectangle, inclusive on both corners. */
export interface GridRange {
  r1: number
  c1: number
  r2: number
  c2: number
}

export interface GridCellChange {
  row: number
  col: number
  key: string
  value: GridCellValue
  /** The row *after* the change. */
  item: GridRow
  /** What produced it — useful for batching undo entries. */
  source: 'edit' | 'paste' | 'clear' | 'toggle'
}
