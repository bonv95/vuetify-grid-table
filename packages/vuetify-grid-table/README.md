# vuetify-grid-table

[![npm](https://img.shields.io/npm/v/vuetify-grid-table.svg)](https://www.npmjs.com/package/vuetify-grid-table)
[![license](https://img.shields.io/npm/l/vuetify-grid-table.svg)](./LICENSE)

Spreadsheet-style editable data grid for **Vue 3 + Vuetify**. Cell-level focus,
keyboard navigation, Excel-compatible copy/paste, drag-to-reorder rows, and a
Vuetify input behind every cell — text, number, select, autocomplete, date and
checkbox.

**▶ [Live demo](https://vuetify-grid-table.vercel.app)**

It is intentionally **not** built on `<v-data-table>`: that component owns row
rendering, which leaves no place to hang cell-level focus, in-place editors,
drag reordering and clipboard ranges.

## Install

```bash
npm install vuetify-grid-table
```

`vue` (^3.3) and `vuetify` (^3.7.4) are peer dependencies — the grid renders
Vuetify inputs and reads your Vuetify theme, so the host app supplies both.
Menu and gutter icons use the `mdi` set, Vuetify's default.

## Quick start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { GridTable, type GridColumn, type GridRow } from 'vuetify-grid-table'
import 'vuetify-grid-table/style.css'

const rows = ref<GridRow[]>([
  { id: 1, name: 'Aoyama Trading', dept: 'sales', qty: 120, due: '2026-08-01', active: true },
])

const columns: GridColumn[] = [
  { key: 'name', title: 'Customer', type: 'text', width: 200 },
  { key: 'dept', title: 'Department', type: 'select', items: [{ title: 'Sales', value: 'sales' }] },
  { key: 'qty', title: 'Qty', type: 'number', width: 90, align: 'end' },
  { key: 'due', title: 'Due', type: 'date', width: 140 },
  { key: 'active', title: 'Active', type: 'checkbox', width: 84, align: 'center' },
]
</script>

<template>
  <GridTable v-model="rows" :columns="columns" height="480" />
</template>
```

Prefer global registration? `app.use(VuetifyGridTable)` registers `<GridTable>`
and `<GridCellEditor>`.

```ts
import { VuetifyGridTable } from 'vuetify-grid-table'
import 'vuetify-grid-table/style.css'

app.use(vuetify).use(VuetifyGridTable)
```

## Column types

| `type`           | Editor                               | Hint                        | Stored value          |
| ---------------- | ------------------------------------ | --------------------------- | --------------------- |
| `text` (default) | `v-text-field`                       | —                           | `string`              |
| `number`         | `v-text-field[number]`               | —                           | `number \| null`      |
| `select`         | `v-select`                           | `mdi-menu-down`             | the option's `value`  |
| `autocomplete`   | `v-autocomplete`                     | `mdi-magnify`               | the option's `value`  |
| `date`           | `v-text-field` + `v-date-picker`     | `mdi-calendar-blank-outline`| `'YYYY-MM-DD'`        |
| `checkbox`       | `v-checkbox-btn` (rendered in place) | — (draws itself)            | `boolean`             |

Per column: `width`, `minWidth`, `align`, `editable: false`, `typeIcon`, `items`
(for the two list types), `format(value, row)` to override the displayed — and
copied — text, plus `headerAlign` / `headerStyle` / `headerClass` for the header
cell.

`checkbox` is the one type with no editor to open, because it has no draft to
commit or cancel: `Space`, `F2` and a double-click all toggle it straight away,
and the change arrives as `source: 'toggle'`.

### Telling the types apart

A cell renders as plain text until it is edited, so nothing would otherwise say
that a column drops down a list or opens a calendar. The **Hint** column above
is shown twice: muted in the header, so the whole table can be scanned at a
glance, and again in the focused cell in the theme's primary colour — the way
Excel marks a cell with data validation. `text` and `number` get none (a text
box is the assumption, and numbers read as numbers from their alignment), and a
checkbox already draws itself.

Turn the icons off table-wide with `:type-icons="false"`, or per column with
`typeIcon: false`. Any mdi name works as an override, which is useful for a text
column with its own meaning: `typeIcon: 'mdi-email-outline'`.

### Date shorthand

A date cell is a plain text field: type into it, or open the calendar with its
button (or `Alt+↓`). Missing parts are completed from today, so on 2026-07-27:

| Typed                    | Stored       |
| ------------------------ | ------------ |
| `1`, `01`                | `2026-07-01` |
| `701`, `0701`            | `2026-07-01` |
| `7/1`, `7-1`             | `2026-07-01` |
| `260701`                 | `2026-07-01` |
| `20260701`, `2026-07-01` | `2026-07-01` |

Text that is not a date (including impossible ones like `20250230`) leaves the
cell's value untouched rather than wiping it; clearing the box clears the
value. Pasted dates go through the same parser.

### Fixed header

On by default, and it needs `height` to mean anything: without one the grid is
as tall as its rows, the body never scrolls, and there is nothing for the header
to stay put against. `:fixed-header="false"` lets it scroll up with the rows.

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

| Prop                          | Default   | Purpose                                             |
| ----------------------------- | --------- | --------------------------------------------------- |
| `v-model`                     | —         | `GridRow[]`; replaced immutably on every change      |
| `columns`                     | —         | `GridColumn[]`                                       |
| `itemKey`                     | `'id'`    | Row property used as the render key                  |
| `height`                      | —         | Max height of the scroll area; needed to scroll at all |
| `fixedHeader`                 | `true`    | Freeze the header row while the body scrolls         |
| `defaultColumnWidth`          | `160`     | Width for columns that set none                      |
| `enterDirection`              | `'down'`  | Where Enter goes: `'down'` or `'right'`              |
| `headerStyle` / `headerClass` | —         | Applied to every header cell                         |
| `typeIcons`                   | `true`    | Icon per column advertising its editor               |
| `contextMenu`                 | `true`    | Right-click menu (insert / copy / delete row)        |
| `menuLabels`                  | English   | Wording for that menu                                |
| `rowClass`                    | —         | Class(es) per row: string, array, or `(row, i) => …`  |
| `showRowNumbers`              | `true`    | Left gutter with row number + drag handle            |
| `gutterWidth`                 | `36`      | Width of that gutter, in px                          |
| `reorderable`                 | `true`    | Drag rows by the gutter                              |
| `resizable`                   | `true`    | Drag column edges                                    |
| `readonly`                    | `false`   | Block edits (selection and copy still work)          |
| `readonlyRows`                | —         | Lock rows: `number[]`, or `(row, index) => boolean`  |
| `cellReadonly`                | —         | Lock single cells: `({ row, rowIndex, column, colIndex }) => boolean` |
| `initialCell`                 | —         | `{ row, col }` to focus on mount; `col` takes a key  |
| `autofocus`                   | `false`   | Also take keyboard focus on mount                    |
| `growOnPaste`                 | `true`    | Append rows when a paste runs past the last one      |
| `createRow`                   | blank row | Factory for rows added by paste                      |
| `loading`                     | `false`   | Indeterminate progress bar                           |

### Read-only, in layers

Four rules are checked, coarsest first — the table, the row, the column, then
the cell. Any one of them locking is enough, so they compose freely. A locked
cell still selects, copies and prints; only writes (typing, paste, `Delete`,
checkbox toggles) are refused, and `readonlyRows` also protects its rows from
the menu's delete.

A **column** is locked where it is defined, with `editable: false`, since that
is config the caller already owns:

```ts
const columns: GridColumn[] = [
  { key: 'reference', title: 'Reference' },
  { key: 'amount', title: 'Amount', editable: false, format: (_v, row) => money(row) },
]
```

A **row** is locked with the `readonlyRows` prop — row indices, or a predicate —
because rows are your data, not the grid's config:

```vue
<GridTable
  v-model="rows"
  :columns="columns"
  :readonly-rows="(row) => row.status === 'shipped'"
  :cell-readonly="({ row, column }) => column.key === 'discount' && !row.contract"
/>
```

### Initial focus

`initialCell` places the focus box as the grid mounts, waiting for the rows if
they arrive from a request. `col` accepts a column `key` as well as an index:

```vue
<GridTable v-model="rows" :columns="columns" :initial-cell="{ row: 0, col: 'customer' }" autofocus />
```

`initialCell` alone only *places* the box — it does not take keyboard focus, so
the arrow keys still belong to the page and the box shows greyed. Add
`autofocus` when you want the grid usable without a click: arrows, `Enter` and
type-to-edit all work from the first keystroke.

Either way no mouse is required. The grid is a tab stop, and focusing it with
nothing selected lands on the first cell, so `Tab` into it and the arrow keys
work. `initialCell` applies once, by design — use the exposed `focusCell()` to
move afterwards.

Cell navigation only ever scrolls the grid's own container: the surrounding page
is never moved, and cells are kept clear of whatever floats over the scroll area
— the frozen gutter, and the header while `fixedHeader` is on — rather than
merely brought to the container's edge.

## Events

- `@cell-change` — `{ row, col, key, value, item, source }` where `source` is
  `'edit' | 'paste' | 'clear' | 'toggle'`.
- `@row-move` — `{ from, to }` after a drag reorder.
- `@row-insert` — `{ index }` after a menu insert.
- `@row-delete` — `{ from, to }` after a menu delete.

## Slots

| Slot            | Replaces                                        |
| --------------- | ----------------------------------------------- |
| `cell.<key>`    | What one column's cells render when not editing |
| `cell`          | The same, for every column without its own slot |
| `editor.<key>`  | One column's editor                             |
| `editor`        | The editor for every column without its own     |
| `gutter`        | The row number and drag handle                  |
| `empty`         | The "No data" row                               |

Each pair is *one column* plus *every column*: `cell.total` wins for that
column, `cell` catches the rest, and with neither the grid renders as it always
did. Everything else — selection, focus, copy, paste, keyboard — carries on
working, because a slot only fills in a cell's contents.

### Custom cell display

```vue
<GridTable v-model="rows" :columns="columns">
  <template #cell.status="{ text, value }">
    <v-chip :color="value === 'shipped' ? 'success' : 'info'" size="x-small" label>{{ text }}</v-chip>
  </template>
</GridTable>
```

Handed `{ row, rowIndex, column, colIndex, value, text, active, selected,
editable, edit, setValue }` (`GridCellSlotProps`). `value` is the stored value
and `text` is what the grid would have rendered — also exactly what copy puts on
the clipboard, so reusing it keeps display and clipboard consistent. `edit()`
opens the editor and `setValue()` writes the cell through the normal pipeline,
so `cell-change` fires and read-only rules still hold.

The editor is unaffected: a chip-rendered column still opens its usual `select`
when you type into it.

### Custom editor

```vue
<template #editor.quantity="{ value, update, commit, cancel }">
  <v-slider
    :model-value="Number(value ?? 0)" :max="500" hide-details
    @update:model-value="update"
    @end="commit('down')"
  />
</template>
```

Handed `{ row, rowIndex, column, colIndex, value, initialText, update, commit,
cancel }` (`GridEditorSlotProps`). `value` is the *draft*, not the row's value —
`update()` revises it and `commit(move?)` writes it and moves on (`'down'`,
`'up'`, `'right'`, `'left'`, or the default `'none'` to stay). `initialText` is
the keystroke that opened the editor, when typing is what opened it.

`Enter`, `Tab` and `Esc` keep working without you wiring anything: they are
handled on the grid wrapper and a slot editor sits inside it. Only call `commit`
yourself for editors that finish on their own, like a slider release or a
clicked option. Don't `stopPropagation()` on keydown, or you take those keys
away from the grid.

### Rows

There is deliberately **no slot for the `<tr>` or the `<td>`**. The grid finds
cells through `[data-cell="row-col"]` and rows through `tr[data-row]` for
selection, scrolling and drag reorder, so handing those elements over would
break navigation in ways nothing would report. Row-level appearance goes through
the `rowClass` prop, and per-row contents through the `gutter` slot:

```vue
<GridTable :row-class="(row) => (row.urgent ? 'row-urgent' : undefined)">
  <template #gutter="{ row, rowIndex }">
    <v-icon v-if="row.locked" icon="mdi-lock-outline" size="12" />
    <span v-else>{{ rowIndex + 1 }}</span>
  </template>
</GridTable>
```

`rowClass` takes a string, an array, or `(row, index) => …`. From a parent with
scoped styles the class lands on a child component's `<tr>`, so target it with
`:deep(.row-urgent) td`.

A `td` background from `rowClass` stops at the gutter, which keeps its own
backdrop. That is deliberate: the gutter is frozen chrome that the other columns
scroll underneath, so it has to stay opaque no matter what a caller paints on
table cells — the same choice Excel makes for its row headers.

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

| Key                     | Action                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Arrows                  | Move the focused cell (`Shift` extends the selection)                                          |
| `Enter` / `Shift+Enter` | Move on / back, per `enterDirection`                                                           |
| `Tab` / `Shift+Tab`     | Move right / left, wrapping across rows                                                        |
| Any printable character | Start editing, seeded with that character                                                      |
| `F2` / double-click     | Start editing, keeping the current value                                                       |
| `Enter` while editing   | Commit and move on; over an open option list it applies the highlighted (or first matching) option first |
| `Alt+↓` in a date cell  | Open the calendar                                                                              |
| `Tab` while editing     | Commit and move right                                                                          |
| `Esc` while editing     | Cancel                                                                                         |
| `Space`                 | Toggle a checkbox cell                                                                         |
| `Delete` / `Backspace`  | Clear the selected cells                                                                       |
| `Ctrl/⌘+C` / `X` / `V`  | Copy / cut / paste the selection as TSV                                                        |
| `Ctrl/⌘+A`              | Select every cell                                                                              |

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

## Also exported

The value ↔ text helpers the grid uses internally, for validating an import
file or diffing a pasted block against what the grid would have stored:

```ts
import {
  cellText,        // what a cell displays (and copies)
  parseText,       // the inverse, per column type
  parseFlexibleDate, // '701' -> '2026-07-01'
  formatDate, toDate, toIsoDate,
  parseClipboardMatrix, toClipboardText, // TSV
  emptyValue, normalizeDraft, toCellValue,
} from 'vuetify-grid-table'
```

And the types, for annotating your own columns, handlers and slot wrappers:

```ts
import type {
  GridColumn, GridColumnType, GridOption, GridRow, GridCellValue,
  GridCellChange,                          // the @cell-change payload
  GridCellRef, GridRange,                  // { row, col } and { r1, c1, r2, c2 }
  GridCellSlotProps, GridEditorSlotProps,  // what the cell / editor slots hand you
  GridCellContext,                         // the cellReadonly argument
  GridReadonlyRows, GridRowClass, GridInitialCell, GridMenuLabels,
} from 'vuetify-grid-table'
```

## License

MIT
