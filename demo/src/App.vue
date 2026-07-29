<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTheme } from 'vuetify'
import { GridTable, type GridCellChange, type GridColumn, type GridRow } from 'vuetify-grid-table'

import { columns, createBlankRow, createRows } from './data'

const PKG = 'vuetify-grid-table'
const REPO = 'https://github.com/bonv95/vuetify-grid-table'

const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)

function toggleTheme() {
  theme.change(isDark.value ? 'light' : 'dark')
}

/* ----------------------------------------------------------------- the grid */

const rows = ref<GridRow[]>(createRows())

const readonly = ref(false)
const showRowNumbers = ref(true)
const typeIcons = ref(true)
const fixedHeader = ref(true)
const reorderable = ref(true)
const enterDirection = ref<'down' | 'right'>('right')

/* --- Partial read-only: whole rows, or a single column ----------------------
 * A row that has already shipped is locked through `readonlyRows`; a column is
 * locked with its own `editable` flag. Both still select and copy — only
 * writes are refused. */
const lockShippedRows = ref(true)
const lockReferenceColumn = ref(true)

function isShipped(row: GridRow) {
  return row.status === 'shipped' || row.status === 'invoiced'
}

const gridColumns = computed<GridColumn[]>(() =>
  columns.map((column) =>
    column.key === 'reference' ? { ...column, editable: !lockReferenceColumn.value } : column,
  ),
)

const lockedRowCount = computed(() => (lockShippedRows.value ? rows.value.filter(isShipped).length : 0))

/* --- Initial focus ---------------------------------------------------------
 * The grid below starts on its very first cell — the common case, and what the
 * defaults here spell out. `initialCell` only applies as the grid mounts, so
 * the demo bumps a `key` to mount a fresh one instead of pretending the prop is
 * reactive. */
const initialRow = ref(1)
const initialColumn = ref(columns[0].key)
const gridKey = ref(0)

const columnKeys = computed(() => columns.map((column) => ({ title: column.title, value: column.key })))

function remountGrid() {
  gridKey.value++
  push('mdi-target', 'primary', `mounted with focus on row ${initialRow.value} · ${initialColumn.value}`)
}

/* ------------------------------------------------------------------- events */

interface LogEntry {
  id: number
  icon: string
  color: string
  text: string
}

const log = ref<LogEntry[]>([])
let logId = 0

function push(icon: string, color: string, text: string) {
  log.value.unshift({ id: ++logId, icon, color, text })
  if (log.value.length > 40) log.value.pop()
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '∅'
  return typeof value === 'string' ? `"${value}"` : String(value)
}

function onCellChange(change: GridCellChange) {
  push(
    'mdi-pencil',
    'primary',
    `row ${change.row + 1} · ${change.key} → ${show(change.value)}  (${change.source})`,
  )
}

const totalAmount = computed(() =>
  rows.value.reduce((sum, row) => sum + Number(row.quantity ?? 0) * Number(row.unitPrice ?? 0), 0),
)

const urgentCount = computed(() => rows.value.filter((row) => row.urgent).length)

function reset() {
  rows.value = createRows()
  log.value = []
  push('mdi-refresh', 'medium-emphasis', 'sample data restored')
}

/* -------------------------------------------------------------- static copy */

const installSnippet = `npm install ${PKG} vuetify`

const usageSnippet = `<script setup lang="ts">
import { ref } from 'vue'
import { GridTable, type GridColumn, type GridRow } from '${PKG}'
import '${PKG}/style.css'

const rows = ref<GridRow[]>([
  { id: 1, customer: 'Aoyama Trading', dept: 'sales', qty: 120, due: '2026-08-01', urgent: true },
])

const columns: GridColumn[] = [
  { key: 'customer', title: 'Customer', type: 'text', width: 200 },
  { key: 'dept', title: 'Department', type: 'select', items: [{ title: 'Sales', value: 'sales' }] },
  { key: 'qty', title: 'Qty', type: 'number', align: 'end', width: 90 },
  { key: 'due', title: 'Due', type: 'date', width: 140 },
  { key: 'urgent', title: 'Urgent', type: 'checkbox', width: 84, align: 'center' },
]
<\/script>

<template>
  <GridTable v-model="rows" :columns="columns" height="480" @cell-change="onChange" />
<\/template>`

const cellTypes = [
  { type: 'text', icon: null, editor: 'v-text-field', stored: 'string', note: 'The default when no type is set.' },
  { type: 'number', icon: null, editor: 'v-text-field[number]', stored: 'number | null', note: 'Commas and spaces are stripped on paste.' },
  { type: 'select', icon: 'mdi-menu-down', editor: 'v-select', stored: "the option's value", note: 'Menu opens as soon as the editor does.' },
  { type: 'autocomplete', icon: 'mdi-magnify', editor: 'v-autocomplete', stored: "the option's value", note: 'Typing filters; Enter takes the first match.' },
  { type: 'date', icon: 'mdi-calendar-blank-outline', editor: 'v-text-field + v-date-picker', stored: "'YYYY-MM-DD'", note: 'Shorthand: 1, 701, 7/1, 260701 all parse.' },
  { type: 'checkbox', icon: null, editor: 'v-checkbox-btn', stored: 'boolean', note: 'Rendered in place; Space toggles it.' },
]

const shortcuts = [
  { keys: ['↑', '↓', '←', '→'], text: 'Move the focused cell (Shift extends the selection)' },
  { keys: ['Enter'], text: 'Move on — direction follows the enterDirection prop' },
  { keys: ['Tab'], text: 'Move across, wrapping into the next row' },
  { keys: ['F2'], text: 'Edit, keeping the current value (also double-click)' },
  { keys: ['A–Z', '0–9'], text: 'Start editing, seeded with that character' },
  { keys: ['Alt', '↓'], text: 'Open the calendar in a date cell' },
  { keys: ['Space'], text: 'Toggle a checkbox cell' },
  { keys: ['Esc'], text: 'Cancel the edit' },
  { keys: ['Del'], text: 'Clear every selected cell' },
  { keys: ['⌘/Ctrl', 'C'], text: 'Copy the selection as TSV — paste straight into Excel' },
  { keys: ['⌘/Ctrl', 'V'], text: 'Paste TSV back in; the grid grows if the block overflows' },
  { keys: ['⌘/Ctrl', 'A'], text: 'Select every cell' },
]
</script>

<template>
  <v-app>
    <v-app-bar flat border="b" height="60">
      <v-app-bar-title class="font-weight-bold d-flex align-center ga-2">
        <v-icon icon="mdi-table-large" color="primary" />
        <span>{{ PKG }}</span>
      </v-app-bar-title>

      <template #append>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-npm"
          :href="`https://www.npmjs.com/package/${PKG}`"
          target="_blank"
          rel="noopener"
          class="d-none d-sm-inline-flex"
        >
          npm
        </v-btn>
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-github"
          :href="REPO"
          target="_blank"
          rel="noopener"
          class="d-none d-sm-inline-flex"
        >
          GitHub
        </v-btn>
        <v-btn
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleTheme"
        />
      </template>
    </v-app-bar>

    <v-main>
      <v-container class="py-8" style="max-width: 1240px">
        <!-- Hero -->
        <div class="mb-8">
          <h1 class="text-h4 text-md-h3 font-weight-bold mb-3">
            A spreadsheet that happens to be a Vue component
          </h1>
          <p class="text-body-1 text-medium-emphasis mb-4" style="max-width: 68ch">
            An editable data grid for Vue 3 and Vuetify: cell-level focus, keyboard navigation,
            Excel-compatible copy and paste, drag-to-reorder rows, and a Vuetify input behind every
            cell — text, number, select, autocomplete, date and checkbox.
          </p>

          <div class="d-flex flex-wrap ga-2 mb-5">
            <v-chip size="small" variant="tonal" prepend-icon="mdi-vuejs">Vue 3</v-chip>
            <v-chip size="small" variant="tonal" prepend-icon="mdi-vuetify">Vuetify ^3.7.4</v-chip>
            <v-chip size="small" variant="tonal" prepend-icon="mdi-language-typescript">Typed</v-chip>
            <v-chip size="small" variant="tonal" prepend-icon="mdi-microsoft-excel">TSV clipboard</v-chip>
          </div>

          <v-sheet border rounded class="d-inline-flex align-center pa-1 pl-4 ga-2">
            <code class="text-body-2">{{ installSnippet }}</code>
          </v-sheet>
        </div>

        <!-- Live demo -->
        <v-card border flat class="mb-8">
          <v-toolbar density="comfortable" color="transparent">
            <v-toolbar-title class="text-subtitle-1 font-weight-bold">
              Live demo — every cell type
            </v-toolbar-title>
            <v-spacer />
            <v-btn size="small" variant="text" prepend-icon="mdi-refresh" @click="reset">
              Reset
            </v-btn>
          </v-toolbar>

          <v-divider />

          <div class="d-flex flex-wrap align-center ga-4 px-4 py-3">
            <v-switch v-model="readonly" label="Read-only" density="compact" hide-details color="primary" />
            <v-switch v-model="showRowNumbers" label="Row numbers" density="compact" hide-details color="primary" />
            <v-switch v-model="typeIcons" label="Type icons" density="compact" hide-details color="primary" />
            <v-switch v-model="fixedHeader" label="Fixed header" density="compact" hide-details color="primary" />
            <v-switch v-model="reorderable" label="Drag to reorder" density="compact" hide-details color="primary" />
            <v-btn-toggle
              v-model="enterDirection"
              density="compact"
              variant="outlined"
              divided
              mandatory
            >
              <v-btn value="down" size="small" prepend-icon="mdi-arrow-down">Enter ↓</v-btn>
              <v-btn value="right" size="small" prepend-icon="mdi-arrow-right">Enter →</v-btn>
            </v-btn-toggle>
          </div>

          <v-divider />

          <div class="d-flex flex-wrap align-center ga-4 px-4 py-3">
            <v-switch
              v-model="lockShippedRows"
              label="Lock shipped rows"
              density="compact"
              hide-details
              color="primary"
            />
            <v-switch
              v-model="lockReferenceColumn"
              label="Lock reference column"
              density="compact"
              hide-details
              color="primary"
            />

            <v-divider vertical class="my-1" />

            <span class="text-body-2 text-medium-emphasis">Focus on mount</span>
            <v-text-field
              v-model.number="initialRow"
              label="Row"
              type="number"
              :min="1"
              :max="rows.length"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 110px"
            />
            <v-select
              v-model="initialColumn"
              :items="columnKeys"
              label="Column"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 180px"
            />
            <v-btn size="small" variant="tonal" prepend-icon="mdi-target" @click="remountGrid">
              Re-mount
            </v-btn>
          </div>

          <v-divider />

          <GridTable
            :key="gridKey"
            v-model="rows"
            :columns="gridColumns"
            :readonly="readonly"
            :readonly-rows="lockShippedRows ? isShipped : undefined"
            :initial-cell="{ row: initialRow - 1, col: initialColumn }"
            autofocus
            :show-row-numbers="showRowNumbers"
            :type-icons="typeIcons"
            :fixed-header="fixedHeader"
            :reorderable="reorderable"
            :enter-direction="enterDirection"
            :create-row="createBlankRow"
            height="440"
            item-key="id"
            :row-class="(row) => (row.urgent ? 'demo-row-urgent' : undefined)"
            @cell-change="onCellChange"
            @row-move="({ from, to }) => push('mdi-swap-vertical', 'info', `row ${from + 1} → ${to + 1}`)"
            @row-insert="({ index }) => push('mdi-plus', 'success', `row inserted at ${index + 1}`)"
            @row-delete="({ from, to }) => push('mdi-delete', 'error', `rows ${from + 1}–${to + 1} deleted`)"
          />

          <v-divider />

          <div class="d-flex flex-wrap align-center ga-6 px-4 py-3 text-body-2">
            <span><strong>{{ rows.length }}</strong> rows</span>
            <span>
              total
              <strong>{{ totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) }}</strong>
            </span>
            <span><strong>{{ urgentCount }}</strong> urgent</span>
            <span v-if="lockedRowCount">
              <v-icon icon="mdi-lock-outline" size="14" class="mr-1" />
              <strong>{{ lockedRowCount }}</strong> locked rows
            </span>
          </div>
        </v-card>

        <!-- Event log -->
        <v-card border flat class="mb-8">
          <v-toolbar density="comfortable" color="transparent">
            <v-toolbar-title class="text-subtitle-1 font-weight-bold">Emitted events</v-toolbar-title>
            <v-spacer />
            <v-btn
              size="small"
              variant="text"
              :disabled="!log.length"
              prepend-icon="mdi-notification-clear-all"
              @click="log = []"
            >
              Clear
            </v-btn>
          </v-toolbar>
          <v-divider />
          <v-list density="compact" max-height="260" class="overflow-y-auto py-0">
            <v-list-item v-if="!log.length" class="text-medium-emphasis">
              <template #prepend>
                <v-icon icon="mdi-gesture-tap" class="mr-2" />
              </template>
              Edit something above and the events land here.
            </v-list-item>
            <v-list-item v-for="entry in log" :key="entry.id">
              <template #prepend>
                <v-icon :icon="entry.icon" :color="entry.color" size="18" class="mr-3" />
              </template>
              <span class="text-body-2 font-monospace">{{ entry.text }}</span>
            </v-list-item>
          </v-list>
        </v-card>

        <!-- Reference -->
        <v-row class="mb-4">
          <v-col cols="12" md="7">
            <v-card border flat height="100%">
              <v-card-title class="text-subtitle-1 font-weight-bold">Column types</v-card-title>
              <v-divider />
              <v-table density="compact">
                <thead>
                  <tr>
                    <th>type</th>
                    <th>Hint</th>
                    <th>Editor</th>
                    <th>Stored value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in cellTypes" :key="item.type">
                    <td><code>{{ item.type }}</code></td>
                    <td>
                      <v-icon v-if="item.icon" :icon="item.icon" size="14" class="text-medium-emphasis" />
                      <span v-else class="text-disabled">—</span>
                    </td>
                    <td class="text-medium-emphasis">{{ item.editor }}</td>
                    <td>
                      <code>{{ item.stored }}</code>
                      <div class="text-caption text-medium-emphasis">{{ item.note }}</div>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </v-col>

          <v-col cols="12" md="5">
            <v-card border flat height="100%">
              <v-card-title class="text-subtitle-1 font-weight-bold">Keyboard</v-card-title>
              <v-divider />
              <v-list density="compact" class="py-1">
                <v-list-item v-for="item in shortcuts" :key="item.text">
                  <div class="d-flex align-start ga-3">
                    <span class="d-flex ga-1 flex-shrink-0" style="min-width: 92px">
                      <kbd v-for="key in item.keys" :key="key" class="demo-kbd">{{ key }}</kbd>
                    </span>
                    <span class="text-body-2 text-medium-emphasis">{{ item.text }}</span>
                  </div>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>
        </v-row>

        <!-- Usage -->
        <v-card border flat class="mb-8">
          <v-card-title class="text-subtitle-1 font-weight-bold">Usage</v-card-title>
          <v-divider />
          <v-card-text>
            <pre class="demo-code"><code>{{ usageSnippet }}</code></pre>
            <p class="text-body-2 text-medium-emphasis mt-4 mb-0">
              Vuetify must already be installed in the host app — the grid renders Vuetify inputs
              and reads its theme. Icons use the <code>mdi</code> set.
            </p>
          </v-card-text>
        </v-card>

        <v-divider class="mb-4" />
        <div class="d-flex flex-wrap ga-4 justify-space-between text-body-2 text-medium-emphasis pb-6">
          <span>MIT licensed</span>
          <div class="d-flex ga-4">
            <a :href="`https://www.npmjs.com/package/${PKG}`" target="_blank" rel="noopener">npm</a>
            <a :href="REPO" target="_blank" rel="noopener">Source</a>
            <a :href="`${REPO}/issues`" target="_blank" rel="noopener">Issues</a>
          </div>
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.font-monospace {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* Applied through the grid's `rowClass` prop, so it lands on a <tr> inside the
   child component — hence :deep(). Selection and focus still win over it. */
:deep(.demo-row-urgent) td {
  background-color: rgba(var(--v-theme-error), 0.05);
}
</style>
