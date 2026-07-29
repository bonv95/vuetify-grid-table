<script setup lang="ts">
// Spreadsheet-style data grid built on plain <table> markup plus Vuetify
// inputs as cell editors. It deliberately does not use <v-data-table>: that
// component owns its own row rendering, which leaves no room for cell-level
// focus, in-place editors, drag reorder and clipboard ranges.
//
// Everything is index-addressed ({row, col}); `rows` is replaced immutably on
// every mutation so callers can diff, undo or persist from the v-model alone.
import {
  computed,
  type CSSProperties,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
// Imported explicitly rather than relying on global registration: once this
// package is published, `vite-plugin-vuetify`'s auto-import no longer sees the
// template, so a consumer tree-shaking Vuetify would get unresolved tags.
import { VCheckboxBtn } from 'vuetify/components/VCheckbox'
import { VDivider } from 'vuetify/components/VDivider'
import { VIcon } from 'vuetify/components/VIcon'
import { VList, VListItem } from 'vuetify/components/VList'
import { VMenu } from 'vuetify/components/VMenu'
import { VProgressLinear } from 'vuetify/components/VProgressLinear'

import GridCellEditor from './GridCellEditor.vue'
import {
  cellText,
  emptyValue,
  normalizeDraft,
  parseClipboardMatrix,
  parseText,
  toCellValue,
  toClipboardText,
} from './format.js'
import type {
  GridCellChange,
  GridCellContext,
  GridCellRef,
  GridCellSlotProps,
  GridCellValue,
  GridColumn,
  GridEditorSlotProps,
  GridInitialCell,
  GridMenuLabels,
  GridRange,
  GridReadonlyRows,
  GridRow,
  GridRowClass,
} from './types.js'

const props = withDefaults(
  defineProps<{
    columns: GridColumn[]
    /** Row property used as the render key; falls back to the index. */
    itemKey?: string
    /** Max height of the scroll area (number = px). Needed for a fixed header. */
    height?: string | number
    /**
     * Freeze the header row while the body scrolls. Needs `height` to have any
     * effect — without one the grid is as tall as its rows and never scrolls.
     */
    fixedHeader?: boolean
    /** Width for columns that do not set their own. */
    defaultColumnWidth?: number
    /** Where Enter goes: the cell below (default) or the next one across. */
    enterDirection?: 'down' | 'right'
    /** Inline style applied to every header cell. */
    headerStyle?: CSSProperties
    /** Class(es) applied to every header cell. */
    headerClass?: string
    /** Advertise each column's editor with an icon. Per column: `typeIcon`. */
    typeIcons?: boolean
    /** Right-click menu with insert / delete / copy row. */
    contextMenu?: boolean
    /** Wording for that menu, for apps that are not in English. */
    menuLabels?: Partial<GridMenuLabels>
    /** Class(es) for every row, or worked out per row. */
    rowClass?: GridRowClass
    /** Left gutter with row numbers and the drag handle. */
    showRowNumbers?: boolean
    /** Width of that gutter in px. */
    gutterWidth?: number
    /** Allow reordering rows by dragging the gutter. */
    reorderable?: boolean
    /** Allow dragging column edges. */
    resizable?: boolean
    /** Block all edits; selection and copy still work. */
    readonly?: boolean
    /** Lock individual rows: indices, or a predicate run per row. */
    readonlyRows?: GridReadonlyRows
    /** Last word on a single cell, checked after the row and column rules. */
    cellReadonly?: (context: GridCellContext) => boolean
    /** Cell to focus on mount; `col` accepts a column key or an index. */
    initialCell?: GridInitialCell | null
    /** Also take keyboard focus on mount, so typing works without a click. */
    autofocus?: boolean
    /** Append rows when a paste runs past the last one. */
    growOnPaste?: boolean
    /** Factory for rows created by paste; defaults to blank cells. */
    createRow?: () => GridRow
    loading?: boolean
  }>(),
  {
    itemKey: 'id',
    height: undefined,
    fixedHeader: true,
    defaultColumnWidth: 160,
    enterDirection: 'down',
    headerStyle: undefined,
    headerClass: undefined,
    typeIcons: true,
    contextMenu: true,
    menuLabels: undefined,
    rowClass: undefined,
    showRowNumbers: true,
    gutterWidth: 36,
    reorderable: true,
    resizable: true,
    readonly: false,
    readonlyRows: undefined,
    cellReadonly: undefined,
    initialCell: undefined,
    autofocus: false,
    growOnPaste: true,
    createRow: undefined,
    loading: false,
  },
)

const rows = defineModel<GridRow[]>({ required: true })

const emit = defineEmits<{
  'cell-change': [change: GridCellChange]
  'row-move': [payload: { from: number; to: number }]
  'row-insert': [payload: { index: number }]
  'row-delete': [payload: { from: number; to: number }]
}>()

/**
 * Render overrides. Each pair is "one column" plus "every column": a
 * `cell.total` slot wins for that column, `cell` catches the rest, and with
 * neither the grid renders as it always did.
 *
 * There is deliberately no slot for the `<tr>` or the `<td>` themselves — the
 * grid addresses cells through `[data-cell="row-col"]` and rows through
 * `tr[data-row]` for selection, scrolling and drag reorder, so handing those
 * elements to a caller would break navigation in ways nothing would report.
 * Row-level styling goes through the `rowClass` prop instead.
 */
const slots = defineSlots<{
  /** Shown in place of the row list when there are none. */
  empty?: () => unknown
  /** Cell contents, outside of editing. */
  cell?: (props: GridCellSlotProps) => unknown
  /** Cell contents for one column. */
  [key: `cell.${string}`]: ((props: GridCellSlotProps) => unknown) | undefined
  /** The editor, replacing the built-in one. */
  editor?: (props: GridEditorSlotProps) => unknown
  /** The editor for one column. */
  [key: `editor.${string}`]: ((props: GridEditorSlotProps) => unknown) | undefined
  /** Contents of the left gutter — row number and drag handle by default. */
  gutter?: (props: { row: GridRow; rowIndex: number; selected: boolean }) => unknown
}>()

// Returned as template-literal types, not plain `string`, so `<slot :name>`
// still type-checks against the slot declarations above.
/** `cell.<key>` if given, else the catch-all, else null to render normally. */
function cellSlotName(key: string): 'cell' | `cell.${string}` | null {
  if (slots[`cell.${key}`]) return `cell.${key}`
  return slots.cell ? 'cell' : null
}

function editorSlotName(key: string): 'editor' | `editor.${string}` | null {
  if (slots[`editor.${key}`]) return `editor.${key}`
  return slots.editor ? 'editor' : null
}

const DEFAULT_MENU_LABELS: GridMenuLabels = {
  insertAbove: 'Insert row above',
  insertBelow: 'Insert row below',
  deleteRow: 'Delete row',
  copyRow: 'Copy row',
}

const wrapperRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)

// --- Selection -------------------------------------------------------------
// `active` is the focused cell (the Excel "current cell"); `anchor` is the
// other corner of the selection rectangle, equal to `active` for a single cell.
const active = ref<GridCellRef | null>(null)
const anchor = ref<GridCellRef | null>(null)
const hasFocus = ref(false)

const selection = computed<GridRange | null>(() => {
  if (!active.value || !anchor.value) return null
  return {
    r1: Math.min(anchor.value.row, active.value.row),
    r2: Math.max(anchor.value.row, active.value.row),
    c1: Math.min(anchor.value.col, active.value.col),
    c2: Math.max(anchor.value.col, active.value.col),
  }
})

// --- Editing ---------------------------------------------------------------
const editing = ref(false)
const draft = ref<string | number | boolean | null>(null)
const initialText = ref<string | undefined>(undefined)
const editorMenuOpen = ref(false)
/** Set when Enter reaches an open option list, so the pick also navigates. */
let pickShouldMove = false
/** The Enter already consumed in the capture phase; skip it while bubbling. */
let enterHandledInCapture: KeyboardEvent | null = null

// --- Column widths ---------------------------------------------------------
const widths = reactive<Record<string, number>>({})
watch(
  () => props.columns,
  (columns) => {
    for (const column of columns) {
      if (widths[column.key] === undefined) widths[column.key] = column.width ?? props.defaultColumnWidth
    }
  },
  { immediate: true },
)

const totalWidth = computed(
  () =>
    props.columns.reduce((sum, c) => sum + (widths[c.key] ?? props.defaultColumnWidth), 0) +
    (props.showRowNumbers ? props.gutterWidth : 0),
)

const scrollStyle = computed(() => ({
  maxHeight: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

// --- Header styling --------------------------------------------------------
/** Column styling wins over the table-wide default. */
function headerStyleFor(column: GridColumn): CSSProperties {
  return { ...props.headerStyle, ...column.headerStyle }
}

function headerClassFor(column: GridColumn) {
  return [
    `text-${column.headerAlign ?? column.align ?? 'start'}`,
    props.headerClass,
    column.headerClass,
  ]
}

// --- Editor hints ----------------------------------------------------------
// Cells render as plain text until they are edited, so nothing tells you a
// column drops down a list or opens a calendar. These icons say so up front:
// once in the header, for scanning the table, and again in the focused cell,
// the way Excel marks a cell with data validation.
//
// `text` and `number` get none — a text box is the assumption, and `number`
// already reads as one from its alignment. A checkbox draws itself.
const TYPE_ICONS: Partial<Record<NonNullable<GridColumn['type']>, string>> = {
  select: 'mdi-menu-down',
  autocomplete: 'mdi-magnify',
  date: 'mdi-calendar-blank-outline',
}

/** Icon per column key, resolved once instead of per rendered cell. */
const typeIconByKey = computed(() => {
  const icons: Record<string, string> = {}
  if (!props.typeIcons) return icons
  for (const column of props.columns) {
    if (column.typeIcon === false) continue
    const icon = column.typeIcon ?? TYPE_ICONS[column.type ?? 'text']
    if (icon) icons[column.key] = icon
  }
  return icons
})

// --- Read-only rules -------------------------------------------------------
// Four layers, coarsest first: the whole table, the row, the column, then the
// single cell. Any one of them locking wins — a cell is editable only when all
// of them allow it.

/** Indices listed in `readonlyRows`, when it was given as an array. */
const readonlyRowSet = computed(() =>
  Array.isArray(props.readonlyRows) ? new Set(props.readonlyRows) : null,
)

function isRowReadonly(rowIndex: number): boolean {
  const rule = props.readonlyRows
  if (!rule) return false
  if (readonlyRowSet.value) return readonlyRowSet.value.has(rowIndex)
  const row = rows.value[rowIndex]
  return row ? (rule as (row: GridRow, index: number) => boolean)(row, rowIndex) : false
}

/** The one question the rest of the grid asks: may this cell be written to? */
function isCellEditable(rowIndex: number, colIndex: number): boolean {
  if (props.readonly) return false
  const column = props.columns[colIndex]
  if (!column) return false
  if (column.editable === false || isRowReadonly(rowIndex)) return false
  if (props.cellReadonly) {
    const row = rows.value[rowIndex]
    if (row && props.cellReadonly({ row, rowIndex, column, colIndex })) return false
  }
  return true
}

/** Columns whose editor owns the Enter key while its option list is open. */
function isListColumn(column: GridColumn | undefined): boolean {
  return column?.type === 'select' || column?.type === 'autocomplete'
}

function isSelected(row: number, col: number): boolean {
  const range = selection.value
  return !!range && row >= range.r1 && row <= range.r2 && col >= range.c1 && col <= range.c2
}

function isActive(row: number, col: number): boolean {
  return active.value?.row === row && active.value?.col === col
}

function isEditingCell(row: number, col: number): boolean {
  return editing.value && isActive(row, col)
}

function rowKey(row: GridRow, index: number): string {
  const key = row[props.itemKey]
  return key === null || key === undefined ? `#${index}` : String(key)
}

// --- Focus & navigation ----------------------------------------------------
function focusWrapper() {
  wrapperRef.value?.focus({ preventScroll: true })
}

function setActive(cell: GridCellRef, extend = false) {
  const row = Math.min(Math.max(cell.row, 0), Math.max(rows.value.length - 1, 0))
  const col = Math.min(Math.max(cell.col, 0), Math.max(props.columns.length - 1, 0))
  active.value = { row, col }
  if (!extend || !anchor.value) anchor.value = { row, col }
  void scrollActiveIntoView()
}

/** Public: move the focus box programmatically. `col` accepts a column key. */
function focusCell(row: number, col: number | string) {
  setActive({ row, col: resolveColIndex(col) })
  focusWrapper()
}

/** Columns are addressable by `key` as well as index, for callers' comfort. */
function resolveColIndex(col: number | string | undefined): number {
  if (typeof col === 'number') return col
  if (typeof col !== 'string') return 0
  const index = props.columns.findIndex((column) => column.key === col)
  return index === -1 ? 0 : index
}

// --- Initial focus ---------------------------------------------------------
// Runs once, as soon as there is something to point at: `initialCell` may be
// set before the rows have loaded, and clamping against an empty grid would
// silently land on {0,0}.
let initialCellDone = false

function applyInitialCell() {
  if (initialCellDone) return
  if (!props.initialCell && !props.autofocus) return
  if (!rows.value.length || !props.columns.length) return

  initialCellDone = true
  const cell = props.initialCell ?? {}
  setActive({ row: cell.row ?? 0, col: resolveColIndex(cell.col) })
  if (props.autofocus) focusWrapper()
}

onMounted(applyInitialCell)
watch([rows, () => props.columns], applyInitialCell)

/**
 * Keep the active cell visible by scrolling the grid's own container, by hand.
 *
 * `element.scrollIntoView()` is wrong for this twice over: it walks *every*
 * scrollable ancestor, so moving a cell can yank the surrounding page around,
 * and it stops at the container's edge — which here is underneath the sticky
 * header and the frozen gutter, so the cell it just "revealed" stays covered.
 */
async function scrollActiveIntoView() {
  await nextTick()
  const cell = active.value
  const container = scrollRef.value
  if (!cell || !container) return
  const target = container.querySelector<HTMLElement>(`[data-cell="${cell.row}-${cell.col}"]`)
  if (!target) return

  const view = container.getBoundingClientRect()
  const box = target.getBoundingClientRect()
  // The sticky header and gutter float over the scroll area; the cell has to
  // clear them, not merely reach the container's edge. An unpinned header
  // scrolls away with the rows, so it reserves nothing.
  const headerHeight = props.fixedHeader
    ? (container.querySelector('thead')?.getBoundingClientRect().height ?? 0)
    : 0
  const gutterWidth = props.showRowNumbers ? props.gutterWidth : 0

  if (box.top < view.top + headerHeight) container.scrollTop -= view.top + headerHeight - box.top
  else if (box.bottom > view.bottom) container.scrollTop += box.bottom - view.bottom

  if (box.left < view.left + gutterWidth) container.scrollLeft -= view.left + gutterWidth - box.left
  else if (box.right > view.right) container.scrollLeft += box.right - view.right
}

function moveActive(dRow: number, dCol: number, extend = false) {
  if (!active.value) return
  setActive({ row: active.value.row + dRow, col: active.value.col + dCol }, extend)
}

/** Tab-style movement: runs off the end of a row into the next one. */
function moveLinear(step: number) {
  if (!active.value) return
  const lastCol = props.columns.length - 1
  let { row, col } = active.value
  col += step
  if (col > lastCol) {
    col = 0
    row = Math.min(row + 1, rows.value.length - 1)
  } else if (col < 0) {
    col = lastCol
    row = Math.max(row - 1, 0)
  }
  setActive({ row, col })
}

/** Where Enter goes, per the `enterDirection` prop. */
const enterMove = computed<'down' | 'right'>(() =>
  props.enterDirection === 'right' ? 'right' : 'down',
)
const enterMoveBack = computed<'up' | 'left'>(() =>
  props.enterDirection === 'right' ? 'left' : 'up',
)

function moveBy(direction: 'down' | 'up' | 'right' | 'left' | 'none') {
  if (direction === 'down') moveActive(1, 0)
  else if (direction === 'up') moveActive(-1, 0)
  else if (direction === 'right') moveLinear(1)
  else if (direction === 'left') moveLinear(-1)
}

// --- Writing values --------------------------------------------------------
/** Apply a batch of cell writes as a single immutable rows replacement. */
function applyChanges(
  updates: Array<{ row: number; col: number; value: string | number | boolean | null }>,
  source: GridCellChange['source'],
  extraRows: GridRow[] = [],
) {
  if (!updates.length && !extraRows.length) return

  const next = rows.value.slice().concat(extraRows)
  const changed: GridCellChange[] = []

  for (const update of updates) {
    const column = props.columns[update.col]
    const target = next[update.row]
    if (!column || !target || !isCellEditable(update.row, update.col)) continue
    if (Object.is(target[column.key], update.value)) continue

    next[update.row] = { ...target, [column.key]: update.value }
    changed.push({
      row: update.row,
      col: update.col,
      key: column.key,
      value: update.value,
      item: next[update.row],
      source,
    })
  }

  if (!changed.length && !extraRows.length) return
  rows.value = next
  for (const change of changed) emit('cell-change', change)
}

function setCellValue(
  row: number,
  col: number,
  value: string | number | boolean | null,
  source: GridCellChange['source'] = 'edit',
) {
  applyChanges([{ row, col, value }], source)
}

// --- Edit lifecycle --------------------------------------------------------
function beginEdit(text?: string) {
  const cell = active.value
  if (!cell || editing.value) return
  const column = props.columns[cell.col]
  if (!column || !isCellEditable(cell.row, cell.col)) return

  // A checkbox has nothing to type into — treat the gesture as a toggle.
  if (column.type === 'checkbox') {
    toggleActiveCheckbox()
    return
  }

  const current = toCellValue(rows.value[cell.row]?.[column.key])
  initialText.value = text
  // Typing replaces the value for free-text columns; for menu-backed ones the
  // keystroke only seeds the search box, so the current value survives.
  draft.value =
    text !== undefined && (column.type === 'text' || column.type === 'number' || !column.type)
      ? text
      : current
  editorMenuOpen.value = false
  editing.value = true
  watchListEditorKeys(isListColumn(column))
  void focusEditor()
}

/**
 * Hand focus to the editor's input once it exists. Vuetify's `autofocus` is
 * not enough here: the grid itself holds focus when the editor mounts, so
 * without this the second keystroke would be swallowed by the wrapper and
 * menu-backed fields would never open their list.
 */
async function focusEditor() {
  await nextTick()
  const input = wrapperRef.value?.querySelector<HTMLInputElement>('.grid-cell.is-editing input')
  if (!input) return
  input.focus({ preventScroll: true })
  // Caret to the end, so typing continues the value instead of replacing it.
  // (The autocomplete clears its own search box on open — see GridCellEditor.)
  const end = input.value.length
  try {
    input.setSelectionRange(end, end)
  } catch {
    /* selection ranges are unsupported on number/date inputs */
  }
}

function stopEdit(refocus = true) {
  editing.value = false
  initialText.value = undefined
  editorMenuOpen.value = false
  draft.value = null
  watchListEditorKeys(false)
  if (refocus) focusWrapper()
}

function commitEdit(move: 'down' | 'up' | 'right' | 'left' | 'none', refocus = true) {
  const cell = active.value
  if (!cell || !editing.value) return
  const column = props.columns[cell.col]
  if (column) setCellValue(cell.row, cell.col, normalizeDraft(column, draft.value), 'edit')
  stopEdit(refocus)
  moveBy(move)
}

/**
 * A list editor reported a chosen option. When the choice came from Enter the
 * grid moves on, like any other commit; a mouse click just applies it.
 */
function onEditorPick() {
  const move = pickShouldMove ? enterMove.value : 'none'
  pickShouldMove = false
  commitEdit(move)
}

function cancelEdit() {
  stopEdit()
}

// --- Slot payloads ---------------------------------------------------------
// Built here rather than inline in the template so the shape stays one thing,
// matching the exported `GridCellSlotProps` / `GridEditorSlotProps`.
function cellSlotProps(
  row: GridRow,
  rowIndex: number,
  column: GridColumn,
  colIndex: number,
): GridCellSlotProps {
  return {
    row,
    rowIndex,
    column,
    colIndex,
    value: row[column.key],
    text: cellText(column, row),
    active: isActive(rowIndex, colIndex),
    selected: isSelected(rowIndex, colIndex),
    editable: isCellEditable(rowIndex, colIndex),
    edit: () => {
      setActive({ row: rowIndex, col: colIndex })
      beginEdit()
    },
    setValue: (value) => setCellValue(rowIndex, colIndex, value),
  }
}

function editorSlotProps(
  row: GridRow,
  rowIndex: number,
  column: GridColumn,
  colIndex: number,
): GridEditorSlotProps {
  return {
    row,
    rowIndex,
    column,
    colIndex,
    value: draft.value,
    initialText: initialText.value,
    update: (value: GridCellValue) => {
      draft.value = value
    },
    // Enter / Tab / Escape are already handled on the wrapper while editing, so
    // a slot editor inherits them for free; this is for editors that finish on
    // their own, like clicking an option out of a menu.
    commit: (move = 'none') => commitEdit(move),
    cancel: cancelEdit,
  }
}

function toggleActiveCheckbox() {
  const cell = active.value
  if (!cell) return
  const column = props.columns[cell.col]
  if (!column || column.type !== 'checkbox' || !isCellEditable(cell.row, cell.col)) return
  setCellValue(cell.row, cell.col, !rows.value[cell.row]?.[column.key], 'toggle')
}

function clearSelection() {
  const range = selection.value
  if (!range || props.readonly) return
  const updates = []
  for (let row = range.r1; row <= range.r2; row++) {
    for (let col = range.c1; col <= range.c2; col++) {
      updates.push({ row, col, value: emptyValue(props.columns[col]) })
    }
  }
  applyChanges(updates, 'clear')
}

// --- Mouse selection -------------------------------------------------------
let dragSelecting = false

function onCellMouseDown(event: MouseEvent, row: number, col: number) {
  if (event.button !== 0) return

  // Clicks inside the open editor belong to the editor.
  if (editing.value && isActive(row, col)) return
  if (editing.value) commitEdit('none', false)

  // Keep focus on the grid itself rather than letting the browser move it.
  event.preventDefault()
  setActive({ row, col }, event.shiftKey)
  focusWrapper()

  dragSelecting = true
  window.addEventListener('mouseup', endDragSelect, { once: true })
}

function onCellMouseEnter(row: number, col: number) {
  if (dragSelecting && !editing.value) setActive({ row, col }, true)
}

function endDragSelect() {
  dragSelecting = false
}

function selectWholeRow(row: number, extend = false) {
  if (editing.value) commitEdit('none', false)
  anchor.value = { row: extend && anchor.value ? anchor.value.row : row, col: 0 }
  active.value = { row, col: Math.max(props.columns.length - 1, 0) }
  focusWrapper()
}

// --- Right-click menu ------------------------------------------------------
const menuOpen = ref(false)
const menuAt = ref<[number, number]>([0, 0])
const menuLabels = computed<GridMenuLabels>(() => ({
  ...DEFAULT_MENU_LABELS,
  ...props.menuLabels,
}))

function onContextMenu(event: MouseEvent, row: number, col: number | null) {
  if (!props.contextMenu) return
  event.preventDefault()
  if (editing.value) commitEdit('none', false)

  // Right-clicking outside the current selection moves it, the way a
  // spreadsheet does; inside it, the existing multi-row selection is kept.
  if (col === null) {
    if (!selection.value || row < selection.value.r1 || row > selection.value.r2) {
      selectWholeRow(row)
    }
  } else if (!isSelected(row, col)) {
    setActive({ row, col })
  }

  menuAt.value = [event.clientX, event.clientY]
  menuOpen.value = true
}

/** Rows the menu acts on: the selected span, or just the active row. */
const menuRows = computed(() => {
  const range = selection.value
  if (range) return { from: range.r1, to: range.r2 }
  const row = active.value?.row ?? 0
  return { from: row, to: row }
})

/** A locked row is not deletable either — `readonlyRows` protects the record. */
const menuHasReadonlyRow = computed(() => {
  if (!props.readonlyRows) return false
  const { from, to } = menuRows.value
  for (let row = from; row <= to; row++) if (isRowReadonly(row)) return true
  return false
})

function insertRow(at: number) {
  const index = Math.min(Math.max(at, 0), rows.value.length)
  const next = rows.value.slice()
  next.splice(index, 0, blankRow())
  rows.value = next
  emit('row-insert', { index })
  setActive({ row: index, col: active.value?.col ?? 0 })
  focusWrapper()
}

function deleteRows() {
  const { from, to } = menuRows.value
  const next = rows.value.filter((_, index) => index < from || index > to)
  rows.value = next
  emit('row-delete', { from, to })
  if (!next.length) {
    active.value = null
    anchor.value = null
  } else {
    setActive({ row: Math.min(from, next.length - 1), col: active.value?.col ?? 0 })
  }
  focusWrapper()
}

/** Copy whole rows, all columns, regardless of the selected column span. */
function copyRows() {
  const { from, to } = menuRows.value
  const matrix: string[][] = []
  for (let row = from; row <= to; row++) {
    matrix.push(props.columns.map((column) => cellText(column, rows.value[row] ?? {})))
  }
  anchor.value = { row: from, col: 0 }
  active.value = { row: to, col: Math.max(props.columns.length - 1, 0) }
  void navigator.clipboard?.writeText(toClipboardText(matrix)).catch(() => {
    /* clipboard blocked (insecure context or denied permission) */
  })
  focusWrapper()
}

// --- Keyboard --------------------------------------------------------------
/**
 * Enter on an open option list belongs to Vuetify: it picks the highlighted
 * row, which comes back to us as `pick`. We only need to know that Enter
 * caused it, and by the time the event bubbles the pick has already been
 * applied — so watch for it on the way down.
 *
 * This has to sit on the document, not the grid: arrow keys move focus into
 * the menu, which Vuetify teleports outside the grid's DOM, so the keystroke
 * would never pass through the wrapper at all. It is only attached while a
 * list editor is open.
 */
function onListEditorKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  pickShouldMove = !event.shiftKey
  enterHandledInCapture = event
  // Self-clearing: the pick lands synchronously inside this same dispatch, so
  // a flag still set on the next tick means Enter matched no option.
  window.setTimeout(() => {
    pickShouldMove = false
  }, 0)
}

function watchListEditorKeys(active: boolean) {
  if (active) document.addEventListener('keydown', onListEditorKeydown, true)
  else document.removeEventListener('keydown', onListEditorKeydown, true)
}

onBeforeUnmount(() => watchListEditorKeys(false))

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey

  // Already dealt with on the way down — do not also treat it as navigation.
  if (event === enterHandledInCapture) {
    enterHandledInCapture = null
    return
  }

  if (editing.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit(event.shiftKey ? enterMoveBack.value : enterMove.value)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      commitEdit(event.shiftKey ? 'left' : 'right')
    }
    return
  }

  if (!active.value) return

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1, 0, event.shiftKey)
      return
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1, 0, event.shiftKey)
      return
    case 'ArrowLeft':
      event.preventDefault()
      moveActive(0, -1, event.shiftKey)
      return
    case 'ArrowRight':
      event.preventDefault()
      moveActive(0, 1, event.shiftKey)
      return
    case 'Enter':
      // Enter walks to the next cell; F2 / typing / double-click start an edit.
      event.preventDefault()
      moveBy(event.shiftKey ? enterMoveBack.value : enterMove.value)
      return
    case 'Tab':
      event.preventDefault()
      moveLinear(event.shiftKey ? -1 : 1)
      return
    case 'F2':
      event.preventDefault()
      beginEdit()
      return
    case 'Escape':
      event.preventDefault()
      anchor.value = active.value
      return
    case 'Home':
      event.preventDefault()
      setActive({ row: active.value.row, col: 0 }, event.shiftKey)
      return
    case 'End':
      event.preventDefault()
      setActive({ row: active.value.row, col: props.columns.length - 1 }, event.shiftKey)
      return
    case 'PageUp':
      event.preventDefault()
      moveActive(-10, 0, event.shiftKey)
      return
    case 'PageDown':
      event.preventDefault()
      moveActive(10, 0, event.shiftKey)
      return
    case ' ':
      if (props.columns[active.value.col]?.type === 'checkbox') {
        event.preventDefault()
        toggleActiveCheckbox()
        return
      }
      break
    case 'Delete':
    case 'Backspace':
      event.preventDefault()
      clearSelection()
      return
  }

  if (mod && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    anchor.value = { row: 0, col: 0 }
    active.value = { row: rows.value.length - 1, col: props.columns.length - 1 }
    return
  }

  if (mod && event.key.toLowerCase() === 'c') {
    scheduleClipboardFallback()
    return
  }

  // An IME (Japanese, Chinese, Korean) reports its first keystroke as
  // `Process`/keyCode 229 and can only compose inside a real input. Open the
  // editor empty so composition continues there; the triggering key itself is
  // lost, which is why F2 / double-click stay the reliable way in.
  if (event.key === 'Process' || event.keyCode === 229) {
    beginEdit('')
    return
  }

  // Any printable character starts an edit seeded with that character.
  if (!mod && !event.altKey && event.key.length === 1) {
    event.preventDefault()
    beginEdit(event.key)
  }
}

// --- Clipboard -------------------------------------------------------------
function selectionMatrix(): string[][] {
  const range = selection.value
  if (!range) return []
  const matrix: string[][] = []
  for (let row = range.r1; row <= range.r2; row++) {
    const line: string[] = []
    for (let col = range.c1; col <= range.c2; col++) {
      const column = props.columns[col]
      line.push(column ? cellText(column, rows.value[row] ?? {}) : '')
    }
    matrix.push(line)
  }
  return matrix
}

/**
 * Some browsers only fire `copy` when a DOM text selection exists, and the
 * grid has none. If the event has not arrived by the next tick, write through
 * the async clipboard API instead. Whichever lands first, the text is equal.
 */
let copyEventFired = false
function scheduleClipboardFallback() {
  copyEventFired = false
  window.setTimeout(() => {
    if (copyEventFired || !selection.value) return
    void navigator.clipboard?.writeText(toClipboardText(selectionMatrix())).catch(() => {
      /* clipboard blocked (insecure context or denied permission) */
    })
  }, 0)
}

function onCopy(event: ClipboardEvent) {
  if (editing.value || !selection.value) return
  copyEventFired = true
  event.clipboardData?.setData('text/plain', toClipboardText(selectionMatrix()))
  event.preventDefault()
}

function onCut(event: ClipboardEvent) {
  if (editing.value || !selection.value) return
  onCopy(event)
  clearSelection()
}

function blankRow(): GridRow {
  if (props.createRow) return props.createRow()
  const row: GridRow = {}
  for (const column of props.columns) row[column.key] = emptyValue(column)
  return row
}

function onPaste(event: ClipboardEvent) {
  if (editing.value || props.readonly) return
  const range = selection.value
  const text = event.clipboardData?.getData('text/plain')
  if (!range || !text) return
  event.preventDefault()

  const matrix = parseClipboardMatrix(text)
  if (!matrix.length) return

  const lastCol = props.columns.length - 1
  const neededRows = range.r1 + matrix.length - rows.value.length
  const extraRows: GridRow[] = []
  if (neededRows > 0 && props.growOnPaste) {
    for (let i = 0; i < neededRows; i++) extraRows.push(blankRow())
  }
  const rowLimit = rows.value.length + extraRows.length

  const updates = []
  for (let r = 0; r < matrix.length; r++) {
    const targetRow = range.r1 + r
    if (targetRow >= rowLimit) break
    for (let c = 0; c < matrix[r].length; c++) {
      const targetCol = range.c1 + c
      if (targetCol > lastCol) break
      const column = props.columns[targetCol]
      updates.push({ row: targetRow, col: targetCol, value: parseText(column, matrix[r][c]) })
    }
  }

  applyChanges(updates, 'paste', extraRows)

  // Leave the pasted block selected, the way a spreadsheet does.
  const lastRow = Math.min(range.r1 + matrix.length - 1, rowLimit - 1)
  const lastPastedCol = Math.min(
    range.c1 + Math.max(...matrix.map((line) => line.length)) - 1,
    lastCol,
  )
  anchor.value = { row: range.r1, col: range.c1 }
  active.value = { row: Math.max(lastRow, range.r1), col: Math.max(lastPastedCol, range.c1) }
}

// --- Column resizing -------------------------------------------------------
const resizingKey = ref<string | null>(null)

function onResizeStart(event: PointerEvent, column: GridColumn) {
  event.preventDefault()
  event.stopPropagation()
  const startX = event.clientX
  const startWidth = widths[column.key] ?? props.defaultColumnWidth
  const min = column.minWidth ?? 60
  resizingKey.value = column.key

  const onMove = (moveEvent: PointerEvent) => {
    widths[column.key] = Math.max(min, startWidth + moveEvent.clientX - startX)
  }
  const onUp = () => {
    resizingKey.value = null
    window.removeEventListener('pointermove', onMove)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

// --- Row reordering --------------------------------------------------------
// Pointer-driven rather than HTML5 drag & drop: table rows make poor drag
// sources (ghost images clip to the cell) and this gives an insertion line.
const draggingRow = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onRowDragStart(event: PointerEvent, index: number) {
  if (!props.reorderable || event.button !== 0) return
  event.preventDefault()
  if (editing.value) commitEdit('none', false)

  const rowEls = Array.from(
    wrapperRef.value?.querySelectorAll<HTMLElement>('tbody tr[data-row]') ?? [],
  )
  draggingRow.value = index
  dropIndex.value = index

  const onMove = (moveEvent: PointerEvent) => {
    let target = rowEls.length
    for (let i = 0; i < rowEls.length; i++) {
      const rect = rowEls[i].getBoundingClientRect()
      if (moveEvent.clientY < rect.top + rect.height / 2) {
        target = i
        break
      }
    }
    dropIndex.value = target
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    finishRowDrag()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp, { once: true })
}

function finishRowDrag() {
  const from = draggingRow.value
  const insertAt = dropIndex.value
  draggingRow.value = null
  dropIndex.value = null
  if (from === null || insertAt === null) return

  // Removing the row first shifts every later insertion point down by one.
  const to = insertAt > from ? insertAt - 1 : insertAt
  if (to === from) return

  const next = rows.value.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  rows.value = next
  emit('row-move', { from, to })

  // Follow the row that moved.
  anchor.value = { row: to, col: 0 }
  active.value = { row: to, col: active.value?.col ?? 0 }
}

function rowClasses(row: GridRow, index: number) {
  const custom = typeof props.rowClass === 'function' ? props.rowClass(row, index) : props.rowClass
  return [
    custom,
    {
      'is-dragging': draggingRow.value === index,
      'is-drop-before': draggingRow.value !== null && dropIndex.value === index,
      'is-drop-after':
        draggingRow.value !== null && dropIndex.value === rows.value.length && index === rows.value.length - 1,
    },
  ]
}

// --- Focus tracking --------------------------------------------------------
function onFocusIn() {
  hasFocus.value = true
  // Reached by Tab with nothing selected yet: land on the first cell, so the
  // arrow keys do something. Without this the grid can hold keyboard focus and
  // still ignore every keystroke, and a click would be the only way in.
  if (!active.value && rows.value.length && props.columns.length) setActive({ row: 0, col: 0 })
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as HTMLElement | null
  // Vuetify menus are teleported outside the grid; that is still "inside".
  if (next && (wrapperRef.value?.contains(next) || next.closest('.v-overlay-container'))) return
  hasFocus.value = false
  // Leaving the grid mid-edit keeps the value, like clicking away in Excel.
  if (editing.value) commitEdit('none', false)
}

defineExpose({ active, selection, focusCell, isCellEditable })
</script>

<template>
  <div
    ref="wrapperRef"
    class="grid-table"
    :class="{
      'is-resizing': resizingKey !== null,
      'is-blurred': !hasFocus,
      'has-fixed-header': fixedHeader,
    }"
    tabindex="0"
    @keydown="onKeydown"
    @copy="onCopy"
    @cut="onCut"
    @paste="onPaste"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <v-progress-linear
      v-if="loading"
      indeterminate
      color="primary"
      height="2"
    />

    <div
      ref="scrollRef"
      class="grid-scroll"
      :style="scrollStyle"
    >
      <table
        role="grid"
        :style="{ width: `${totalWidth}px` }"
      >
        <colgroup>
          <col
            v-if="showRowNumbers"
            :style="{ width: `${gutterWidth}px` }"
          >
          <col
            v-for="column in columns"
            :key="column.key"
            :style="{ width: `${widths[column.key]}px` }"
          >
        </colgroup>

        <thead>
          <tr>
            <th
              v-if="showRowNumbers"
              class="grid-gutter grid-gutter-head"
              :style="headerStyle"
            />
            <th
              v-for="column in columns"
              :key="column.key"
              :class="[headerClassFor(column), { 'is-resizing': resizingKey === column.key }]"
              :style="headerStyleFor(column)"
            >
              <span
                class="grid-head-text"
                :class="{ 'has-type-icon': typeIconByKey[column.key] }"
              >{{ column.title }}</span>
              <v-icon
                v-if="typeIconByKey[column.key]"
                class="grid-type-icon"
                size="13"
                :icon="typeIconByKey[column.key]"
              />
              <span
                v-if="resizable"
                class="grid-resizer"
                @pointerdown="onResizeStart($event, column)"
                @dblclick.stop
              />
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="(row, rowIndex) in rows"
            :key="rowKey(row, rowIndex)"
            :data-row="rowIndex"
            :class="rowClasses(row, rowIndex)"
          >
            <td
              v-if="showRowNumbers"
              class="grid-gutter"
              :class="{ 'is-row-selected': selection && rowIndex >= selection.r1 && rowIndex <= selection.r2 }"
              @pointerdown="onRowDragStart($event, rowIndex)"
              @click="selectWholeRow(rowIndex, $event.shiftKey)"
              @contextmenu="onContextMenu($event, rowIndex, null)"
            >
              <slot
                name="gutter"
                :row="row"
                :row-index="rowIndex"
                :selected="!!selection && rowIndex >= selection.r1 && rowIndex <= selection.r2"
              >
                <v-icon
                  v-if="reorderable"
                  class="grid-drag-handle"
                  size="12"
                  icon="mdi-drag"
                />
                <span class="grid-row-number">{{ rowIndex + 1 }}</span>
              </slot>
            </td>

            <td
              v-for="(column, colIndex) in columns"
              :key="column.key"
              :data-cell="`${rowIndex}-${colIndex}`"
              class="grid-cell"
              :class="[
                `text-${column.align ?? 'start'}`,
                {
                  'is-active': isActive(rowIndex, colIndex),
                  'is-selected': isSelected(rowIndex, colIndex),
                  'is-editing': isEditingCell(rowIndex, colIndex),
                  'is-readonly': !isCellEditable(rowIndex, colIndex),
                },
              ]"
              :aria-selected="isSelected(rowIndex, colIndex)"
              @mousedown="onCellMouseDown($event, rowIndex, colIndex)"
              @mouseenter="onCellMouseEnter(rowIndex, colIndex)"
              @dblclick="beginEdit()"
              @contextmenu="onContextMenu($event, rowIndex, colIndex)"
            >
              <template v-if="isEditingCell(rowIndex, colIndex)">
                <slot
                  v-if="editorSlotName(column.key)"
                  :name="editorSlotName(column.key)!"
                  v-bind="editorSlotProps(row, rowIndex, column, colIndex)"
                />
                <GridCellEditor
                  v-else
                  v-model="draft"
                  v-model:menu-open="editorMenuOpen"
                  :column="column"
                  :initial-text="initialText"
                  @pick="onEditorPick"
                />
              </template>

              <template v-else>
                <slot
                  v-if="cellSlotName(column.key)"
                  :name="cellSlotName(column.key)!"
                  v-bind="cellSlotProps(row, rowIndex, column, colIndex)"
                />
                <v-checkbox-btn
                  v-else-if="column.type === 'checkbox'"
                  class="grid-checkbox"
                  :model-value="Boolean(row[column.key])"
                  :disabled="!isCellEditable(rowIndex, colIndex)"
                  density="compact"
                  @update:model-value="setCellValue(rowIndex, colIndex, Boolean($event), 'toggle')"
                />
                <span
                  v-else
                  class="grid-cell-text"
                >{{ cellText(column, row) }}</span>
              </template>

              <!-- Excel's data-validation arrow: only on the cell you are on,
                   and only where there is actually something to open. -->
              <v-icon
                v-if="
                  typeIconByKey[column.key] &&
                    isActive(rowIndex, colIndex) &&
                    !isEditingCell(rowIndex, colIndex) &&
                    isCellEditable(rowIndex, colIndex)
                "
                class="grid-cell-hint"
                size="14"
                :icon="typeIconByKey[column.key]"
              />
            </td>
          </tr>

          <tr v-if="!rows.length">
            <td
              class="grid-empty"
              :colspan="columns.length + (showRowNumbers ? 1 : 0)"
            >
              <slot name="empty">
                No data
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Right-click menu, anchored to the pointer -->
    <v-menu
      v-model="menuOpen"
      :target="menuAt"
      location="bottom end"
      origin="top start"
    >
      <v-list
        density="compact"
        min-width="200"
      >
        <v-list-item
          prepend-icon="mdi-table-row-plus-before"
          :title="menuLabels.insertAbove"
          :disabled="readonly"
          @click="insertRow(menuRows.from)"
        />
        <v-list-item
          prepend-icon="mdi-table-row-plus-after"
          :title="menuLabels.insertBelow"
          :disabled="readonly"
          @click="insertRow(menuRows.to + 1)"
        />
        <v-divider class="my-1" />
        <v-list-item
          prepend-icon="mdi-content-copy"
          :title="menuLabels.copyRow"
          @click="copyRows"
        />
        <v-list-item
          prepend-icon="mdi-table-row-remove"
          :title="menuLabels.deleteRow"
          :disabled="readonly || menuHasReadonlyRow || !rows.length"
          base-color="error"
          @click="deleteRows"
        />
      </v-list>
    </v-menu>
  </div>
</template>

<style scoped>
.grid-table {
  --grid-row-height: 36px;
  position: relative;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  outline: none;
}

.grid-table.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.grid-scroll {
  overflow: auto;
}

table {
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 0.875rem;
}

th,
td {
  height: var(--grid-row-height);
  padding: 0 8px;
  border-right: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  position: relative;
  user-select: none;
}

/* Stacking order, bottom to top: plain cells (auto) → the focused cell (1) →
   the frozen gutter (2) → the sticky header (3) → their intersection (4).
   The gutter has to outrank the focus box, or an active cell scrolled under it
   would paint its outline straight over the frozen column. */
thead th {
  z-index: 3;
  font-weight: 600;
  background-color: rgb(var(--v-theme-surface));
  /* Tint that works on both light and dark themes. */
  background-image: linear-gradient(
    rgba(var(--v-theme-on-surface), 0.06),
    rgba(var(--v-theme-on-surface), 0.06)
  );
}

/* `fixedHeader`. Only the vertical axis is optional: the gutter's header cell
   keeps `position: sticky; left: 0` from `.grid-gutter` either way, so turning
   this off frees the header to scroll up while the frozen column still works. */
.has-fixed-header thead th {
  position: sticky;
  top: 0;
}

.grid-head-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Reserve room so a long title ellipsises before it reaches the icon. */
.grid-head-text.has-type-icon {
  padding-right: 15px;
}

/* Absolute rather than inline, so the header keeps its `text-align`. Sits
   inside the resize grip's 7px, which stays clickable above it. */
.grid-type-icon {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.45;
  pointer-events: none;
}

/* Row-number / drag gutter, frozen to the left edge. Kept narrow: the whole
   cell is the drag target, so the handle only has to hint at it. */
.grid-gutter {
  position: sticky;
  left: 0;
  z-index: 2;
  padding: 0 2px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
  background-color: rgb(var(--v-theme-surface));
  background-image: linear-gradient(
    rgba(var(--v-theme-on-surface), 0.06),
    rgba(var(--v-theme-on-surface), 0.06)
  );
  cursor: grab;
}

/* The body gutter's backdrop is painted by a pseudo-element instead of the
   cell's own `background`, because being on top is worthless if it is
   see-through: a `rowClass` rule tinting `td`, or any host stylesheet reaching
   a table cell, replaces `background-color` and the scrolling columns show
   straight through the frozen column. Nothing a caller writes on `td` can
   reach this layer. `z-index: -1` keeps it behind the row number while staying
   inside the gutter's own stacking context, so it still covers every cell that
   scrolls underneath. The header gutter is left alone — it takes `headerStyle`
   from the caller, whose background must stay visible. */
td.grid-gutter::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background-color: rgb(var(--v-theme-surface));
  background-image: linear-gradient(
    rgba(var(--v-theme-on-surface), 0.06),
    rgba(var(--v-theme-on-surface), 0.06)
  );
}

.grid-gutter-head {
  z-index: 4;
  cursor: default;
}

td.grid-gutter.is-row-selected::before {
  background-image: linear-gradient(
    rgba(var(--v-theme-primary), 0.18),
    rgba(var(--v-theme-primary), 0.18)
  );
}

.grid-gutter.is-row-selected {
  color: rgb(var(--v-theme-on-surface));
}

/* Overlaid rather than laid out, so it costs the gutter no width. */
.grid-drag-handle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.1s ease;
  pointer-events: none;
}

tr:hover .grid-drag-handle {
  opacity: 0.55;
}

.grid-cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grid-cell.is-selected {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

/* The Excel-style focus box. Drawn inside the cell so it never shifts layout. */
.grid-cell.is-active {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
  background-color: rgb(var(--v-theme-surface));
  z-index: 1;
}

/* Focus lives elsewhere on the page: grey the box down so the grid does not
   look active, but keep it drawn — it is where the next keystroke will land,
   and it is the only thing `initialCell` has to show for itself before the
   user clicks in. */
.is-blurred .grid-cell.is-active {
  outline-color: rgba(var(--v-theme-on-surface), 0.26);
}

.is-blurred .grid-cell.is-selected {
  background-color: transparent;
  background-image: none;
}

/* Blurred: the gutter falls back to its neutral tint. Overriding the gradient
   only — clearing `background-color` here is what used to punch a hole in the
   frozen column for every selected row. */
.is-blurred td.grid-gutter.is-row-selected::before {
  background-image: linear-gradient(
    rgba(var(--v-theme-on-surface), 0.06),
    rgba(var(--v-theme-on-surface), 0.06)
  );
}

/* The hint on the focused cell. Overlays the text's tail rather than reserving
   width, so nothing reflows as the focus box moves from cell to cell. */
.grid-cell-hint {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  color: rgb(var(--v-theme-primary));
  pointer-events: none;
}

.is-blurred .grid-cell-hint {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.grid-cell.is-editing {
  padding: 0;
  overflow: visible;
}

.grid-cell.is-readonly {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.grid-checkbox {
  justify-content: center;
}

.grid-empty {
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.6);
  height: 96px;
  cursor: default;
}

/* Column resize grip in the header's right edge. */
.grid-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 7px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}

.grid-resizer:hover,
th.is-resizing .grid-resizer {
  background-color: rgb(var(--v-theme-primary));
  opacity: 0.6;
}

/* Row drag feedback: the source fades, an insertion line marks the drop. */
tr.is-dragging td {
  opacity: 0.45;
}

tr.is-drop-before td {
  box-shadow: inset 0 2px 0 0 rgb(var(--v-theme-primary));
}

tr.is-drop-after td {
  box-shadow: inset 0 -2px 0 0 rgb(var(--v-theme-primary));
}

/* The gutter's backdrop is painted over the cell's own inset shadow, so the
   insertion line has to be drawn on that layer too or it breaks at the frozen
   column — exactly where the drag is happening. */
tr.is-drop-before td.grid-gutter::before {
  box-shadow: inset 0 2px 0 0 rgb(var(--v-theme-primary));
}

tr.is-drop-after td.grid-gutter::before {
  box-shadow: inset 0 -2px 0 0 rgb(var(--v-theme-primary));
}
</style>
