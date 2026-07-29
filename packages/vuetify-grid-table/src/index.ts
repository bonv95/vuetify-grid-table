import type { App, Plugin } from 'vue'

import GridCellEditor from './components/grid-table/GridCellEditor.vue'
import GridTable from './components/grid-table/GridTable.vue'

export { GridTable, GridCellEditor }
export default GridTable

export type {
  GridCellChange,
  GridCellContext,
  GridCellRef,
  GridCellSlotProps,
  GridCellValue,
  GridColumn,
  GridColumnType,
  GridEditorSlotProps,
  GridInitialCell,
  GridMenuLabels,
  GridOption,
  GridRange,
  GridReadonlyRows,
  GridRow,
  GridRowClass,
} from './components/grid-table/types'

/**
 * Value <-> text helpers. Exported because the same conversions are useful
 * outside the grid — validating an import file, or diffing a pasted block
 * against what the grid would have stored.
 */
export {
  cellText,
  emptyValue,
  formatDate,
  normalizeDraft,
  parseClipboardMatrix,
  parseFlexibleDate,
  parseText,
  toCellValue,
  toClipboardText,
  toDate,
  toIsoDate,
} from './components/grid-table/format'

/**
 * Registers `<GridTable>` (and `<GridCellEditor>`) globally.
 *
 * ```ts
 * import { VuetifyGridTable } from 'vuetify-grid-table'
 * import 'vuetify-grid-table/style.css'
 *
 * app.use(vuetify).use(VuetifyGridTable)
 * ```
 */
export const VuetifyGridTable: Plugin = {
  install(app: App, options?: { prefix?: string }) {
    const prefix = options?.prefix ?? ''
    app.component(`${prefix}GridTable`, GridTable)
    app.component(`${prefix}GridCellEditor`, GridCellEditor)
  },
}
