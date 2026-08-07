# GridTable

Spreadsheet-style editable grid built on plain `<table>` markup with Vuetify
inputs as cell editors.

It is intentionally **not** built on `<v-data-table>`: that component owns row
rendering, which leaves no place to hang cell-level focus, in-place editors,
drag reordering and clipboard ranges.

```vue
<script setup lang="ts">
import { ref } from 'vue'

import { GridTable, type GridColumn, type GridRow } from '@/components/grid-table'

const rows = ref<GridRow[]>([{ id: 1, name: '佐藤 花子', active: true }])
const columns: GridColumn[] = [
  { key: 'name', title: '氏名', type: 'text', width: 160 },
  { key: 'dept', title: '部署', type: 'select', items: [{ title: '営業部', value: 'sales' }] },
  { key: 'active', title: '在籍', type: 'checkbox', width: 80, align: 'center' },
]
</script>

<template>
  <GridTable v-model="rows" :columns="columns" height="480" />
</template>
```

## Column types

| `type`         | Editor            | Hint | Stored value            |
| -------------- | ----------------- | ---- | ----------------------- |
| `text` (default) | `v-text-field`   | — | `string`                |
| `number`       | `v-text-field[number]` | — | `number \| null`   |
| `select`       | `v-select`        | `mdi-menu-down` | the option's `value`    |
| `autocomplete` | `v-autocomplete`  | `mdi-magnify` | the option's `value`    |
| `date`         | `v-text-field` + `v-date-picker` | `mdi-calendar-blank-outline` | `'YYYY-MM-DD'` |
| `checkbox`     | `v-checkbox-btn` (rendered in place) | — (draws itself) | `boolean` |

Per column: `width`, `minWidth`, `align`, `editable: false`, `typeIcon`, `items`
(for the two list types), `format(value, row)` to override the displayed — and
copied — text, plus `headerAlign` / `headerStyle` / `headerClass` for the header
cell.

### Telling the types apart

Cells render as plain text until edited, so nothing would otherwise say that a
column drops down a list or opens a calendar. The **Hint** icon is drawn on the
focused cell only, in the primary colour — the way Excel marks a cell with data
validation. Headers stay text-only: the hint belongs at the cell about to be
typed into, and a header copy cost every column the width it had to reserve for
it. Off table-wide with `:type-icons="false"`, per column with
`typeIcon: false`; any mdi name overrides it (`typeIcon: 'mdi-email-outline'`).

It is absolutely positioned over the text's tail rather than laid out, so the
focus box moving from cell to cell reflows nothing.

### Date shorthand

A date cell is a plain text field: type into it, or open the calendar with its
button (or `Alt+↓`). Missing parts are completed from today, so on 2026-07-27:

| Typed | Stored |
| ----- | ------ |
| `1`, `01` | `2026-07-01` |
| `701`, `0701` | `2026-07-01` |
| `7/1`, `7-1` | `2026-07-01` |
| `260701` | `2026-07-01` |
| `20260701`, `2026-07-01` | `2026-07-01` |

Text that is not a date (including impossible ones like `20250230`) leaves the
cell's value untouched rather than wiping it; clearing the box clears the
value. Pasted dates go through the same parser.

### Fixed header

On by default, and it needs `height`: without one the grid is as tall as its
rows, the body never scrolls, and there is nothing for the header to stay put
against. Turn it off with `:fixed-header="false"` and the header scrolls up with
the rows.

The gutter is unaffected either way — it stays frozen to the left edge on the
horizontal axis, header cell included.

```vue
<GridTable v-model="rows" :columns="columns" height="480" :fixed-header="false" />
```

### Header styling

`headerStyle` / `headerClass` on the table apply to every header cell; the same
fields on a column override them for that column.

```vue
<GridTable
  :columns="columns"
  :header-style="{ backgroundColor: '#1867c0', color: '#fff' }"
/>
```

## Props

| Prop             | Default | Purpose                                        |
| ---------------- | ------- | ---------------------------------------------- |
| `v-model`        | —       | `GridRow[]`; replaced immutably on every change |
| `columns`        | —       | `GridColumn[]`                                  |
| `itemKey`        | `'id'`  | Row property used as the render key             |
| `height`         | —       | Max height of the scroll area; needed to scroll at all |
| `fixedHeader`    | `true`  | Freeze the header row while the body scrolls    |
| `defaultColumnWidth` | `160` | Width for columns that set none               |
| `enterDirection` | `'down'` | Where Enter goes: `'down'` or `'right'`        |
| `headerStyle` / `headerClass` | — | Applied to every header cell         |
| `typeIcons`      | `true`  | Hint icon on the focused cell, per column type  |
| `contextMenu`    | `true`  | Right-click menu (insert / copy / delete row)   |
| `menuLabels`     | English | Wording for that menu                           |
| `rowClass`       | —       | Class(es) per row: string, array, or `(row, i) => …` |
| `showRowNumbers` | `true`  | Left gutter with row number + drag handle       |
| `gutterWidth`    | `36`    | Width of that gutter, in px                     |
| `reorderable`    | `true`  | Drag rows by the gutter                         |
| `resizable`      | `true`  | Drag column edges                               |
| `readonly`       | `false` | Block edits (selection and copy still work)     |
| `readonlyRows`   | —       | Lock rows: `number[]`, or `(row, index) => boolean` |
| `cellReadonly`   | —       | Lock single cells: `({ row, rowIndex, column, colIndex }) => boolean` |
| `initialCell`    | —       | `{ row, col }` to focus on mount; `col` takes a key |
| `autofocus`      | `false` | Also take keyboard focus on mount               |
| `growOnPaste`    | `true`  | Append rows when a paste runs past the last one |
| `createRow`      | blank row | Factory for rows added by paste               |
| `loading`        | `false` | Indeterminate progress bar                      |

### Read-only, in layers

The table, the row, the column and the cell each get a say, checked in that
order; any one of them locking is enough. A locked cell still selects and
copies — only writes (typing, paste, `Delete`, checkbox toggles) are refused,
and rows matched by `readonlyRows` are also safe from the menu's delete.

A column is locked where it is defined (`editable: false` on the column — it is
config the caller already owns); a row is locked with `readonlyRows`, because
rows are data rather than config.

```vue
<GridTable
  v-model="rows"
  :columns="columns"
  :readonly-rows="(row) => row.status === 'shipped'"
  :cell-readonly="({ row, column }) => column.key === 'discount' && !row.contract"
/>
```

### Initial focus

`initialCell` places the focus box as the grid mounts, waiting for rows that
arrive from a request. `col` takes a column `key` or an index.

On its own it only *places* the box — the arrow keys still belong to the page,
and the box shows greyed. Add `autofocus` to take keyboard focus too, and the
grid is usable from the first keystroke with no click. `Tab` also works: the
grid is a tab stop, and focusing it with nothing selected lands on the first
cell. It applies once; use `focusCell()` to move afterwards.

Navigation scrolls the grid's own container only — never the surrounding page —
and keeps the cell clear of the sticky header and frozen gutter.

```vue
<GridTable v-model="rows" :columns="columns" :initial-cell="{ row: 0, col: 'customer' }" autofocus />
```

## Events

Rows go out through `v-model` — replaced whole on every mutation. These carry
what the array cannot say: which cell, why, and what a delete removed.

- `@cell-change` — `GridCellChange`, `{ row, col, key, value, item, source }`
  where `source` is `'edit' | 'paste' | 'clear' | 'toggle'`. One per cell, so a
  paste raises several inside a single rows replacement.
- `@edit-start` — `GridEditStart`, `{ …, value, initialText, source }` with
  `source` `'type' | 'key' | 'dblclick' | 'slot'`. Raised from `beginEdit`, which
  is also where the `checkbox` short-circuit lives: a checkbox toggles instead of
  opening an editor, so it raises `cell-change` alone.
- `@edit-end` — `GridEditEnd`, `{ …, value, committed, changed }`. `committed` is
  false only for `cancelEdit`; `changed` comes from `setCellValue`'s return, so a
  no-op write or a read-only refusal reads false.
- `@row-move` — `GridRowMove`, `{ from, to, item }`.
- `@row-insert` — `GridRowInsert`, `{ index, item }`.
- `@row-delete` — `GridRowDelete`, `{ from, to, items }`. `items` is snapshotted
  before the filter — nothing else keeps the deleted rows.
- `@active-change` / `@selection-change` — `GridActiveChange` and
  `GridRange | null`, both from watchers rather than from the `setActive` call
  sites: `active` and `anchor` are replaced wholesale on every write, so identity
  cannot say whether anything moved. The last value is kept by hand and compared
  by coordinate, which is what keeps a re-click on the current cell silent.
- `@focus` / `@blur` — the crossings only, not every `focusin` inside the grid.
  `blur` is raised after the pending edit is committed.
- `@event` — all of the above again as `{ type, payload }`, through `raise()`,
  which emits the dedicated event and then the aggregate. `GridEvent` is the
  discriminated union that keeps the two in step, and the reason `raise()` holds
  the one loose `emit` cast: Vue's generated signature is a union of overloads
  and cannot be resolved against a still-generic event name.

Adding an event means adding it to `GridEvent` too, and raising it through
`raise()` rather than `emit()`, or the aggregate silently misses it.

## Slots

| Slot                          | Replaces                                    |
| ----------------------------- | ------------------------------------------- |
| `cell.<key>` / `cell`         | Cell contents outside of editing            |
| `editor.<key>` / `editor`     | The editor                                  |
| `gutter`                      | Row number + drag handle                    |
| `empty`                       | The "No data" row                           |

`cell.total` wins for that column, `cell` catches every other, neither renders
as before. Selection, focus and the clipboard keep working — a slot only fills
in a cell's contents.

```vue
<GridTable v-model="rows" :columns="columns" :row-class="(row) => row.urgent && 'row-urgent'">
  <template #cell.status="{ text, value }">
    <v-chip :color="value === 'shipped' ? 'success' : 'info'" size="x-small" label>{{ text }}</v-chip>
  </template>

  <template #editor.quantity="{ value, update, commit }">
    <v-slider :model-value="Number(value ?? 0)" :max="500" hide-details
      @update:model-value="update" @end="commit('down')" />
  </template>
</GridTable>
```

- `GridCellSlotProps` — `{ row, rowIndex, column, colIndex, value, text, active,
  selected, editable, edit, setValue }`. `text` is what the grid would have
  drawn, and what copy puts on the clipboard; `setValue` goes through the normal
  change pipeline, so `cell-change` fires and read-only rules hold.
- `GridEditorSlotProps` — `{ row, rowIndex, column, colIndex, value, initialText,
  update, commit, cancel }`. `value` is the draft, not the row's value.
  `Enter` / `Tab` / `Esc` are already handled on the wrapper, so only call
  `commit(move?)` for editors that finish on their own; never
  `stopPropagation()` a keydown.

There is deliberately no slot for the `<tr>` or `<td>`: the grid addresses cells
via `[data-cell]` and rows via `tr[data-row]` for selection, scrolling and drag
reorder, so replacing those elements would break navigation silently. Use
`rowClass` (with `:deep()` from a scoped parent) and the `gutter` slot instead.

## Right-click menu

Insert row above / below, copy row, delete row. It acts on the selected row
span, so selecting three rows and choosing delete removes all three. Copy puts
the full width of those rows on the clipboard as TSV, whatever columns happen
to be selected. Rows created by insert (and by paste) come from the `createRow`
prop, so the caller can assign ids.

## Exposed

`focusCell(row, col)` — `col` accepts a column `key` — and
`isCellEditable(rowIndex, colIndex)`, plus the reactive `active` cell and
`selection` rectangle (`{ r1, c1, r2, c2 }`, inclusive).

## Keyboard

| Key | Action |
| --- | ------ |
| Arrows | Move the focused cell (`Shift` extends the selection) |
| `Enter` / `Shift+Enter` | Move on / back, per `enterDirection` |
| `Tab` / `Shift+Tab` | Move right / left, wrapping across rows |
| Any printable character | Start editing, seeded with that character |
| `F2` / double-click | Start editing, keeping the current value |
| `Enter` while editing | Commit and move on; over an open option list it applies the highlighted (or first matching) option first |
| `Alt+↓` in a date cell | Open the calendar |
| `Tab` while editing | Commit and move right |
| `Esc` while editing | Cancel |
| `Space` | Toggle a checkbox cell |
| `Delete` / `Backspace` | Clear the selected cells |
| `Ctrl/⌘+C` / `X` / `V` | Copy / cut / paste the selection as TSV |
| `Ctrl/⌘+A` | Select every cell |

Clicking a row number selects the whole row, so `Ctrl+C` there copies the row.

### IME input (Japanese / Chinese / Korean)

An IME can only compose inside a real `<input>`, and the grid holds focus on a
`<div>` between edits. The first IME keystroke arrives as `Process`/keyCode
229, which opens the editor empty so composition continues there — but that
first character is consumed by the browser. With an IME active, `F2`, a
double-click, or committing with Enter are the reliable ways to start an edit.
Direct type-to-edit is lossless for ASCII input.

## Clipboard notes

Copy and paste use TSV, the format Excel, Numbers and Google Sheets put on the
clipboard, and the text written per cell is exactly what the cell displays —
so a round-trip through a spreadsheet is lossless (option labels resolve back
to their values, `TRUE`/`FALSE` back to booleans, `YYYY/MM/DD` back to ISO).

Paste is handled through the native `paste` event, which needs the grid to have
focus — click a cell first. Copy prefers the native `copy` event and falls back
to `navigator.clipboard.writeText()` for browsers that skip it when no DOM text
selection exists; that fallback needs a secure context (`https` or
`localhost`).
