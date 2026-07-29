# Changelog

Notable changes to **vuetify-grid-table**. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[semver](https://semver.org/).

## 0.1.4 — 2026-07-29

Additive: nothing in 0.1.3 changes meaning, and no prop or event was removed or
renamed. The one visible difference is noted under *Changed*.

### Added

- **Slots.** `cell` / `cell.<key>` replace what a cell renders outside of
  editing, `editor` / `editor.<key>` replace its editor, `gutter` replaces the
  row number and drag handle. Each pair is *one column* plus *every column*:
  `cell.status` wins for that column, `cell` catches the rest. A slot fills in a
  cell's contents only, so selection, focus, the clipboard and the keyboard keep
  working. Typed as `GridCellSlotProps` and `GridEditorSlotProps`.

  There is deliberately no slot for the `<tr>` or the `<td>`: the grid addresses
  cells through `[data-cell]` and rows through `tr[data-row]` for selection,
  scrolling and drag reorder, so handing those elements to a caller would break
  navigation with nothing to report it. `rowClass` covers row appearance.

- **`readonlyRows`** — lock rows by index (`number[]`) or by predicate
  (`(row, index) => boolean`). Read-only is now resolved in four layers, checked
  coarsest first: the table (`readonly`), the row (`readonlyRows`), the column
  (`editable: false`) and the cell (`cellReadonly`). Any one of them locking is
  enough. A locked cell still selects and copies; only writes are refused, and
  rows matched by `readonlyRows` are also safe from the context menu's delete.

- **`cellReadonly`** — the last word on a single cell, handed
  `{ row, rowIndex, column, colIndex }` (`GridCellContext`).

- **`initialCell`** — place the focus box as the grid mounts, waiting for rows
  that arrive from a request. `col` accepts a column `key` as well as an index.

- **`autofocus`** — also take keyboard focus on mount, so arrows, `Enter` and
  type-to-edit work from the first keystroke with no click anywhere.

- **Type hints.** Each column advertises its editor with an icon — muted in the
  header for scanning the table, and in the theme's primary colour in the
  focused cell, the way Excel marks a cell with data validation. Off table-wide
  with `typeIcons`, per column with `typeIcon` (which also takes any mdi name as
  an override).

- **`fixedHeader`** — freeze the header row while the body scrolls, on by
  default. Needs `height`. Only the vertical axis is conditional: the gutter
  stays frozen to the left edge either way.

- **`rowClass`** — class(es) per row, as a string, an array, or
  `(row, index) => …`.

- **`gutterWidth`** — width of the row-number gutter, now 36px by default,
  down from a hard-coded 52.

- **Exported types**, documented for the first time: `GridCellSlotProps`,
  `GridEditorSlotProps`, `GridCellContext`, `GridReadonlyRows`, `GridRowClass`,
  `GridInitialCell`.

### Fixed

- **The frozen gutter went see-through**, letting the columns scrolling
  underneath show straight through it, whenever anything overrode a `td`
  background — a `rowClass` tint from the host app, or the grid's own
  blurred-selection rule. Its backdrop moved to a pseudo-element that nothing
  written on `td` can reach.

- **Cell navigation could scroll the whole page.** It used
  `element.scrollIntoView()`, which walks *every* scrollable ancestor, and which
  stops at the scroll container's edge — underneath the sticky header and the
  frozen gutter, leaving the cell it had just "revealed" covered. Replaced with
  arithmetic on the grid's own container, clearing both.

- **Tab into the grid did nothing.** The keydown handler bailed whenever no cell
  was active, so a grid focused by keyboard ignored every keystroke. Focusing it
  with nothing selected now lands on the first cell.

- **The focus box was erased while the grid was blurred**, which left
  `initialCell` with nothing to show for itself. It greys out instead.

- **The active cell's outline could paint over the frozen gutter** during
  horizontal scrolling. The stacking order is explicit now: cells, then the
  focused cell, then the gutter, then the header, then their intersection.

### Changed

- A `td` background applied through `rowClass` **stops at the gutter**, which
  keeps its own backdrop. Frozen chrome that other columns scroll underneath has
  to stay opaque — the same choice Excel makes for its row headers. Row tints
  that used to bleed into the gutter no longer do.

---

Releases before 0.1.4 predate this file.
