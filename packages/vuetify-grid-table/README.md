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

| `type`           | Editor                               | Stored value          |
| ---------------- | ------------------------------------ | --------------------- |
| `text` (default) | `v-text-field`                       | `string`              |
| `number`         | `v-text-field[number]`               | `number \| null`      |
| `select`         | `v-select`                           | the option's `value`  |
| `autocomplete`   | `v-autocomplete`                     | the option's `value`  |
| `date`           | `v-text-field` + `v-date-picker`     | `'YYYY-MM-DD'`        |
| `checkbox`       | `v-checkbox-btn` (rendered in place) | `boolean`             |

Per column: `width`, `minWidth`, `align`, `editable: false`, `items` (for the
two list types), `format(value, row)` to override the displayed — and copied —
text, plus `headerAlign` / `headerStyle` / `headerClass` for the header cell.

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
| `height`                      | —         | Max height of the scroll area; header stays sticky   |
| `defaultColumnWidth`          | `160`     | Width for columns that set none                      |
| `enterDirection`              | `'down'`  | Where Enter goes: `'down'` or `'right'`              |
| `headerStyle` / `headerClass` | —         | Applied to every header cell                         |
| `contextMenu`                 | `true`    | Right-click menu (insert / copy / delete row)        |
| `menuLabels`                  | English   | Wording for that menu                                |
| `showRowNumbers`              | `true`    | Left gutter with row number + drag handle            |
| `reorderable`                 | `true`    | Drag rows by the gutter                              |
| `resizable`                   | `true`    | Drag column edges                                    |
| `readonly`                    | `false`   | Block edits (selection and copy still work)          |
| `growOnPaste`                 | `true`    | Append rows when a paste runs past the last one      |
| `createRow`                   | blank row | Factory for rows added by paste                      |
| `loading`                     | `false`   | Indeterminate progress bar                           |

## Events

- `@cell-change` — `{ row, col, key, value, item, source }` where `source` is
  `'edit' | 'paste' | 'clear' | 'toggle'`.
- `@row-move` — `{ from, to }` after a drag reorder.
- `@row-insert` — `{ index }` after a menu insert.
- `@row-delete` — `{ from, to }` after a menu delete.

## Right-click menu

Insert row above / below, copy row, delete row. It acts on the selected row
span, so selecting three rows and choosing delete removes all three. Copy puts
the full width of those rows on the clipboard as TSV, whatever columns happen
to be selected. Rows created by insert (and by paste) come from the `createRow`
prop, so the caller can assign ids.

## Exposed

`focusCell(row, col)`, plus the reactive `active` cell and `selection`
rectangle (`{ r1, c1, r2, c2 }`, inclusive).

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

## License

MIT
