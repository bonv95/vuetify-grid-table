<script setup lang="ts">
// Spreadsheet-style data grid built on plain <table> markup plus Vuetify
// inputs as cell editors. It deliberately does not use <v-data-table>: that
// component owns its own row rendering, which leaves no room for cell-level
// focus, in-place editors, drag reorder and clipboard ranges.
//
// Everything is index-addressed ({row, col}); `rows` is replaced immutably on
// every mutation so callers can diff, undo or persist from the v-model alone.
import { computed, type CSSProperties, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
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
  GridCellRef,
  GridColumn,
  GridMenuLabels,
  GridRange,
  GridRow,
} from './types.js'

const props = withDefaults(
  defineProps<{
    columns: GridColumn[]
    /** Row property used as the render key; falls back to the index. */
    itemKey?: string
    /** Max height of the scroll area (number = px). Header stays sticky. */
    height?: string | number
    /** Width for columns that do not set their own. */
    defaultColumnWidth?: number
    /** Where Enter goes: the cell below (default) or the next one across. */
    enterDirection?: 'down' | 'right'
    /** Inline style applied to every header cell. */
    headerStyle?: CSSProperties
    /** Class(es) applied to every header cell. */
    headerClass?: string
    /** Right-click menu with insert / delete / copy row. */
    contextMenu?: boolean
    /** Wording for that menu, for apps that are not in English. */
    menuLabels?: Partial<GridMenuLabels>
    /** Left gutter with row numbers and the drag handle. */
    showRowNumbers?: boolean
    /** Allow reordering rows by dragging the gutter. */
    reorderable?: boolean
    /** Allow dragging column edges. */
    resizable?: boolean
    /** Block all edits; selection and copy still work. */
    readonly?: boolean
    /** Append rows when a paste runs past the last one. */
    growOnPaste?: boolean
    /** Factory for rows created by paste; defaults to blank cells. */
    createRow?: () => GridRow
    loading?: boolean
  }>(),
  {
    itemKey: 'id',
    height: undefined,
    defaultColumnWidth: 160,
    enterDirection: 'down',
    headerStyle: undefined,
    headerClass: undefined,
    contextMenu: true,
    menuLabels: undefined,
    showRowNumbers: true,
    reorderable: true,
    resizable: true,
    readonly: false,
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

const GUTTER_WIDTH = 52

const DEFAULT_MENU_LABELS: GridMenuLabels = {
  insertAbove: 'Insert row above',
  insertBelow: 'Insert row below',
  deleteRow: 'Delete row',
  copyRow: 'Copy row',
}

const wrapperRef = ref<HTMLElement | null>(null)

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
    (props.showRowNumbers ? GUTTER_WIDTH : 0),
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

function isEditable(column: GridColumn): boolean {
  return !props.readonly && column.editable !== false
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

/** Public: move the focus box programmatically. */
function focusCell(row: number, col: number) {
  setActive({ row, col })
  focusWrapper()
}

async function scrollActiveIntoView() {
  await nextTick()
  const cell = active.value
  if (!cell) return
  wrapperRef.value
    ?.querySelector<HTMLElement>(`[data-cell="${cell.row}-${cell.col}"]`)
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
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
    if (!column || !target || !isEditable(column)) continue
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
  if (!column || !isEditable(column)) return

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

function toggleActiveCheckbox() {
  const cell = active.value
  if (!cell) return
  const column = props.columns[cell.col]
  if (!column || column.type !== 'checkbox' || !isEditable(column)) return
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

function rowClasses(index: number) {
  return {
    'is-dragging': draggingRow.value === index,
    'is-drop-before': draggingRow.value !== null && dropIndex.value === index,
    'is-drop-after':
      draggingRow.value !== null && dropIndex.value === rows.value.length && index === rows.value.length - 1,
  }
}

// --- Focus tracking --------------------------------------------------------
function onFocusIn() {
  hasFocus.value = true
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as HTMLElement | null
  // Vuetify menus are teleported outside the grid; that is still "inside".
  if (next && (wrapperRef.value?.contains(next) || next.closest('.v-overlay-container'))) return
  hasFocus.value = false
  // Leaving the grid mid-edit keeps the value, like clicking away in Excel.
  if (editing.value) commitEdit('none', false)
}

defineExpose({ active, selection, focusCell })
</script>

<template>
  <div
    ref="wrapperRef"
    class="grid-table"
    :class="{ 'is-resizing': resizingKey !== null, 'is-blurred': !hasFocus }"
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
            :style="{ width: `${GUTTER_WIDTH}px` }"
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
              <span class="grid-head-text">{{ column.title }}</span>
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
            :class="rowClasses(rowIndex)"
          >
            <td
              v-if="showRowNumbers"
              class="grid-gutter"
              :class="{ 'is-row-selected': selection && rowIndex >= selection.r1 && rowIndex <= selection.r2 }"
              @pointerdown="onRowDragStart($event, rowIndex)"
              @click="selectWholeRow(rowIndex, $event.shiftKey)"
              @contextmenu="onContextMenu($event, rowIndex, null)"
            >
              <v-icon
                v-if="reorderable"
                class="grid-drag-handle"
                size="14"
                icon="mdi-drag"
              />
              <span class="grid-row-number">{{ rowIndex + 1 }}</span>
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
                  'is-readonly': !isEditable(column),
                },
              ]"
              :aria-selected="isSelected(rowIndex, colIndex)"
              @mousedown="onCellMouseDown($event, rowIndex, colIndex)"
              @mouseenter="onCellMouseEnter(rowIndex, colIndex)"
              @dblclick="beginEdit()"
              @contextmenu="onContextMenu($event, rowIndex, colIndex)"
            >
              <GridCellEditor
                v-if="isEditingCell(rowIndex, colIndex)"
                v-model="draft"
                v-model:menu-open="editorMenuOpen"
                :column="column"
                :initial-text="initialText"
                @pick="onEditorPick"
              />
              <v-checkbox-btn
                v-else-if="column.type === 'checkbox'"
                class="grid-checkbox"
                :model-value="Boolean(row[column.key])"
                :disabled="!isEditable(column)"
                density="compact"
                @update:model-value="setCellValue(rowIndex, colIndex, Boolean($event), 'toggle')"
              />
              <span
                v-else
                class="grid-cell-text"
              >{{ cellText(column, row) }}</span>
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
          :disabled="readonly || !rows.length"
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

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  font-weight: 600;
  background-color: rgb(var(--v-theme-surface));
  /* Tint that works on both light and dark themes. */
  background-image: linear-gradient(
    rgba(var(--v-theme-on-surface), 0.06),
    rgba(var(--v-theme-on-surface), 0.06)
  );
}

.grid-head-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Row-number / drag gutter, frozen to the left edge. */
.grid-gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  padding: 0 4px;
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

.grid-gutter-head {
  z-index: 3;
  cursor: default;
}

.grid-gutter.is-row-selected {
  background-image: linear-gradient(
    rgba(var(--v-theme-primary), 0.18),
    rgba(var(--v-theme-primary), 0.18)
  );
  color: rgb(var(--v-theme-on-surface));
}

.grid-drag-handle {
  opacity: 0;
  margin-right: 2px;
  transition: opacity 0.1s ease;
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

/* Focus lives elsewhere on the page: drop the cell highlight entirely so the
   grid does not look active. The position is kept and restored on refocus. */
.is-blurred .grid-cell.is-active {
  outline: none;
}

.is-blurred .grid-cell.is-selected,
.is-blurred .grid-gutter.is-row-selected {
  background-color: transparent;
  background-image: linear-gradient(
    rgba(var(--v-theme-on-surface), 0.06),
    rgba(var(--v-theme-on-surface), 0.06)
  );
}

.is-blurred .grid-cell.is-selected {
  background-image: none;
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
</style>
