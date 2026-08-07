<script setup lang="ts">
// The in-cell editor: one Vuetify input per column type, sized to sit flush
// inside the cell. It owns no grid state — the draft value lives in
// <GridTable>, which also handles Enter/Tab/Escape as the keys bubble up.
import { computed, onMounted, ref, watch } from 'vue'
// Explicit imports keep the published package working in apps that tree-shake
// Vuetify — see the note in GridTable.vue.
import { VAutocomplete } from 'vuetify/components/VAutocomplete'
import { VDatePicker } from 'vuetify/components/VDatePicker'
import { VIcon } from 'vuetify/components/VIcon'
import { VMenu } from 'vuetify/components/VMenu'
import { VSelect } from 'vuetify/components/VSelect'
import { VTextField } from 'vuetify/components/VTextField'

import { formatDate, parseFlexibleDate, toDate, toIsoDate } from './format'
import type { GridCellValue, GridColumn } from './types'

const props = defineProps<{
  column: GridColumn
  /** Keystroke that opened the editor, so typing flows straight into it. */
  initialText?: string
}>()

const emit = defineEmits<{
  /** A value was chosen from a menu: commit and close, without moving. */
  pick: []
}>()

const draft = defineModel<GridCellValue>({ required: true })
/**
 * Mirrored to the parent: while a menu is open, Enter belongs to Vuetify
 * (choose the highlighted option) rather than to the grid (commit + move).
 */
const menuOpen = defineModel<boolean>('menuOpen', { default: false })

// Seeded from the opening keystroke so the first character filters the list.
const search = ref(props.initialText ?? '')

const isList = computed(
  () => props.column.type === 'select' || props.column.type === 'autocomplete',
)

const dateValue = computed(() => toDate(draft.value))

// The date cell is a free-text field: `dateText` is what the user is typing,
// `draft` only follows once that text parses. A typo therefore leaves the
// stored date alone instead of wiping it; clearing the box clears the value.
const dateText = ref(props.initialText ?? formatDate(draft.value))

function syncDraftFromText(text: string) {
  if (!text.trim()) {
    draft.value = null
    return
  }
  const parsed = parseFlexibleDate(text)
  if (parsed) draft.value = parsed
}

/**
 * `immediate` whenever a keystroke opened the editor. `dateText` is
 * *initialised* from that keystroke rather than assigned, and a ref's initial
 * value is not a change — so without this, `2` followed straight by Enter
 * committed the old date untouched, while `25` worked because the second
 * keystroke was a real assignment the watcher could see.
 *
 * An empty seed is left alone: that is the IME path (`beginEdit('')`), where
 * nothing has been typed yet and nulling the draft would turn an abandoned
 * composition into a delete.
 */
watch(dateText, syncDraftFromText, { immediate: !!props.initialText })

onMounted(() => {
  // List editors open their menu immediately, matching Excel's dropdown feel.
  // The date editor does not: typing is the primary way in, and the calendar
  // button (or Alt+Down) opens the picker.
  if (isList.value) menuOpen.value = true
  if (props.column.type !== 'autocomplete') return

  // VAutocomplete rewrites its search box with the selected item's title the
  // moment it gains focus, and ignores writes while that is in flight — so a
  // keystroke would land *after* the existing label and match nothing. Seed
  // the box on the next macrotask, once that has settled: with the opening
  // keystroke, or empty so the full list shows and typing filters from clean.
  window.setTimeout(() => {
    search.value = props.initialText ?? ''
  }, 0)
})

// Set as soon as Vuetify itself resolves a choice, so the Enter handler below
// knows not to resolve a second one for the same keystroke.
let picked = false
function onListPick() {
  picked = true
  emit('pick')
}

/**
 * Enter over an open option list applies a choice and lets the grid move on.
 *
 * Vuetify only does this when the *list* has keyboard focus (after an arrow
 * key) — with focus still in the text field it leaves the list open and does
 * nothing, which is the common path: type a few characters, press Enter. So
 * resolve the first match here, and stand aside whenever Vuetify has it.
 */
function onListEnter(event: KeyboardEvent) {
  if (picked) return
  if (document.activeElement?.closest('.v-overlay-container')) return
  if (!menuOpen.value) return

  event.preventDefault()
  const term = (search.value ?? '').trim().toLowerCase()
  if (term) {
    const match = props.column.items?.find((item) => item.title.toLowerCase().includes(term))
    if (match) draft.value = match.value
  }
  menuOpen.value = false
  emit('pick')
}

function onPickDate(value: unknown) {
  const iso = toIsoDate(value)
  draft.value = iso
  dateText.value = formatDate(iso)
  menuOpen.value = false
  emit('pick')
}

/** Normalise `7/1` to `2026/07/01` once the user leaves the field. */
function onDateBlur() {
  const formatted = formatDate(draft.value)
  if (formatted !== dateText.value) dateText.value = formatted
}
</script>

<template>
  <!-- Free text / numbers -->
  <v-text-field
    v-if="column.type === 'number'"
    v-model="draft"
    class="grid-editor"
    type="number"
    variant="plain"
    density="compact"
    hide-details
    autofocus
  />

  <!-- Fixed option list -->
  <v-select
    v-else-if="column.type === 'select'"
    v-model="draft"
    v-model:menu="menuOpen"
    class="grid-editor"
    :items="column.items"
    item-title="title"
    item-value="value"
    variant="plain"
    density="compact"
    hide-details
    autofocus
    @update:model-value="onListPick"
    @keydown.enter="onListEnter"
  />

  <!-- Searchable option list -->
  <v-autocomplete
    v-else-if="column.type === 'autocomplete'"
    v-model="draft"
    v-model:menu="menuOpen"
    v-model:search="search"
    class="grid-editor"
    :items="column.items"
    item-title="title"
    item-value="value"
    variant="plain"
    density="compact"
    hide-details
    autofocus
    auto-select-first
    @update:model-value="onListPick"
    @keydown.enter="onListEnter"
  />

  <!-- Date: type it freely, or pick it from the calendar button -->
  <div
    v-else-if="column.type === 'date'"
    class="grid-editor-date"
  >
    <v-text-field
      v-model="dateText"
      class="grid-editor"
      variant="plain"
      density="compact"
      hide-details
      autofocus
      placeholder="YYYY/MM/DD"
      @blur="onDateBlur"
      @keydown.alt.down.prevent="menuOpen = true"
    >
      <template #append-inner>
        <v-menu
          v-model="menuOpen"
          :close-on-content-click="false"
          location="bottom end"
          origin="top end"
        >
          <template #activator="{ props: activator }">
            <v-icon
              v-bind="activator"
              class="grid-editor-calendar"
              icon="mdi-calendar"
              size="18"
              @mousedown.prevent
            />
          </template>
          <v-date-picker
            :model-value="dateValue"
            hide-header
            show-adjacent-months
            @update:model-value="onPickDate"
          />
        </v-menu>
      </template>
    </v-text-field>
  </div>

  <v-text-field
    v-else
    v-model="draft"
    class="grid-editor"
    variant="plain"
    density="compact"
    hide-details
    autofocus
  />
</template>

<style scoped>
/* Fill the cell exactly: no field padding, no baseline shift. */
.grid-editor {
  width: 100%;
}

.grid-editor-date {
  width: 100%;
}

.grid-editor-calendar {
  cursor: pointer;
  opacity: 0.7;
}

.grid-editor-calendar:hover {
  opacity: 1;
}

.grid-editor :deep(.v-field) {
  border-radius: 0;
  font-size: 0.875rem;
  padding-inline: 0;
}

.grid-editor :deep(.v-field__input) {
  min-height: var(--grid-row-height, 34px);
  padding: 0 8px;
  font-size: 0.875rem;
}

.grid-editor :deep(.v-field__append-inner) {
  padding-top: 0;
  align-items: center;
}

.grid-editor :deep(.v-field__overlay),
.grid-editor :deep(.v-field__outline) {
  display: none;
}

/* Hide the number spinners so the cell keeps a flat, table-like look. */
.grid-editor :deep(input[type='number']::-webkit-outer-spin-button),
.grid-editor :deep(input[type='number']::-webkit-inner-spin-button) {
  appearance: none;
  margin: 0;
}
</style>
