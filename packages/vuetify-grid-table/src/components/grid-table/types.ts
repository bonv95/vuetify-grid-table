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
  /**
   * Overrides the icon that advertises this column's editor: any mdi name, or
   * `false` to show none. Defaults to one picked from `type`.
   */
  typeIcon?: string | false
  /** Options for `select` / `autocomplete`. */
  items?: GridOption[]
  /** Overrides the rendered (and copied) text. */
  format?: (value: unknown, row: GridRow) => string
}

/** What a `cell` / `cell.<key>` slot is handed. */
export interface GridCellSlotProps {
  row: GridRow
  rowIndex: number
  column: GridColumn
  colIndex: number
  /** The stored value, untouched by `format`. */
  value: unknown
  /** What the grid would have rendered — also what copy puts on the clipboard. */
  text: string
  active: boolean
  selected: boolean
  /** False when the table, the row, the column or the cell is read-only. */
  editable: boolean
  /** Open this cell's editor, as `F2` would. */
  edit: () => void
  /** Write the cell through the usual pipeline: `cell-change` fires, read-only wins. */
  setValue: (value: GridCellValue) => void
}

/** What an `editor` / `editor.<key>` slot is handed. */
export interface GridEditorSlotProps {
  row: GridRow
  rowIndex: number
  column: GridColumn
  colIndex: number
  /** The draft being edited — not yet written to the row. */
  value: GridCellValue
  /** The keystroke that opened the editor, when typing is what opened it. */
  initialText: string | undefined
  /** Replace the draft. */
  update: (value: GridCellValue) => void
  /** Write the draft and move on (default: stay put). */
  commit: (move?: 'down' | 'up' | 'right' | 'left' | 'none') => void
  /** Abandon the draft. */
  cancel: () => void
}

/** Class(es) for a row: fixed, or worked out per row. */
export type GridRowClass =
  | string
  | string[]
  | ((row: GridRow, index: number) => string | string[] | undefined)

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

/**
 * Cell to focus once the grid mounts. `col` accepts a column key as well as an
 * index, so callers do not have to track column order.
 */
export interface GridInitialCell {
  /** Row index; defaults to the first row. */
  row?: number
  /** Column index or `key`; defaults to the first column. */
  col?: number | string
}

/** Everything a read-only predicate is told about the cell it is asked about. */
export interface GridCellContext {
  row: GridRow
  rowIndex: number
  column: GridColumn
  colIndex: number
}

/** Rows to lock: a list of indices, or a predicate run per row. */
export type GridReadonlyRows = number[] | ((row: GridRow, index: number) => boolean)

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

/** `row-move`: a row was dragged to a new index. */
export interface GridRowMove {
  from: number
  to: number
  /** The row that moved. */
  item: GridRow
}

/** `row-insert`: a blank row was added from the right-click menu. */
export interface GridRowInsert {
  index: number
  /** The row that was inserted — from `createRow`, when one was given. */
  item: GridRow
}

/** `row-delete`: an inclusive span of rows was removed. */
export interface GridRowDelete {
  from: number
  to: number
  /**
   * The rows as they were, in order. They are already out of the model by the
   * time this arrives, so this is the only copy an undo stack can keep.
   */
  items: GridRow[]
}

/** `edit-start`: an editor opened on a cell. */
export interface GridEditStart {
  row: number
  col: number
  /** The column's `key`. */
  key: string
  /** The cell's stored value, which is what the editor opened on. */
  value: GridCellValue
  /** The keystroke that opened it, when typing is what opened it. */
  initialText: string | undefined
  /** What opened it: a printable key, `F2`, a double-click, or a slot's `edit()`. */
  source: 'type' | 'key' | 'dblclick' | 'slot'
}

/** `edit-end`: that editor closed. */
export interface GridEditEnd {
  row: number
  col: number
  /** The column's `key`. */
  key: string
  /** The draft as the editor closed — the value that was written, if any. */
  value: GridCellValue
  /** False when the edit was abandoned with `Escape`. */
  committed: boolean
  /**
   * True only when the write landed: a committed edit that matched the stored
   * value, or one refused by a read-only rule, reports false — and raises no
   * `cell-change` either.
   */
  changed: boolean
}

/** `active-change`: the focus box moved. */
export interface GridActiveChange {
  /** Where it is now; null once the grid has no rows left to point at. */
  cell: GridCellRef | null
  /** Where it was. */
  previous: GridCellRef | null
}

/**
 * Every emitted event again, as one discriminated union — for a caller that
 * wants a single handler (a log, an undo stack, a dirty flag) instead of ten.
 *
 * ```ts
 * function onEvent(event: GridEvent) {
 *   if (event.type === 'cell-change') dirty.value = true   // payload is narrowed
 * }
 * ```
 */
export type GridEvent =
  | { type: 'cell-change'; payload: GridCellChange }
  | { type: 'row-move'; payload: GridRowMove }
  | { type: 'row-insert'; payload: GridRowInsert }
  | { type: 'row-delete'; payload: GridRowDelete }
  | { type: 'edit-start'; payload: GridEditStart }
  | { type: 'edit-end'; payload: GridEditEnd }
  | { type: 'active-change'; payload: GridActiveChange }
  | { type: 'selection-change'; payload: GridRange | null }
  | { type: 'focus'; payload: null }
  | { type: 'blur'; payload: null }
