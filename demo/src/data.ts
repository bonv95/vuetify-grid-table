import type { GridColumn, GridOption, GridRow } from 'vuetify-grid-table'

export const departments: GridOption[] = [
  { title: 'Sales', value: 'sales' },
  { title: 'Engineering', value: 'eng' },
  { title: 'Logistics', value: 'logistics' },
  { title: 'Finance', value: 'finance' },
  { title: 'Support', value: 'support' },
]

/** Deliberately long, so the autocomplete column has something to search. */
export const cities: GridOption[] = [
  'Tokyo',
  'Osaka',
  'Nagoya',
  'Yokohama',
  'Fukuoka',
  'Sapporo',
  'Kobe',
  'Kyoto',
  'Sendai',
  'Hiroshima',
  'Singapore',
  'Bangkok',
  'Ho Chi Minh City',
  'Jakarta',
  'Manila',
  'Kuala Lumpur',
  'Seoul',
  'Taipei',
  'Shanghai',
  'Shenzhen',
  'Hong Kong',
  'Sydney',
  'Melbourne',
  'Rotterdam',
  'Hamburg',
  'Long Beach',
].map((name) => ({ title: name, value: name.toLowerCase().replace(/\s+/g, '-') }))

export const statuses: GridOption[] = [
  { title: 'Draft', value: 'draft' },
  { title: 'Confirmed', value: 'confirmed' },
  { title: 'Shipped', value: 'shipped' },
  { title: 'Invoiced', value: 'invoiced' },
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Every column type the grid supports, in one table. */
export const columns: GridColumn[] = [
  {
    key: 'reference',
    title: 'Reference',
    type: 'text',
    width: 130,
  },
  {
    key: 'customer',
    title: 'Customer',
    type: 'text',
    width: 190,
  },
  {
    key: 'department',
    title: 'Department',
    type: 'select',
    items: departments,
    width: 150,
  },
  {
    key: 'port',
    title: 'Discharge port',
    type: 'autocomplete',
    items: cities,
    width: 180,
  },
  {
    key: 'quantity',
    title: 'Qty',
    type: 'number',
    width: 90,
    align: 'end',
  },
  {
    key: 'unitPrice',
    title: 'Unit price',
    type: 'number',
    width: 120,
    align: 'end',
    format: (value) => (typeof value === 'number' ? currency.format(value) : ''),
  },
  {
    key: 'amount',
    title: 'Amount',
    // Read-only: no `type` editor is reachable, the value is derived below.
    editable: false,
    width: 130,
    align: 'end',
    headerClass: 'text-medium-emphasis',
    format: (_value, row) => {
      const total = Number(row.quantity ?? 0) * Number(row.unitPrice ?? 0)
      return total ? currency.format(total) : ''
    },
  },
  {
    key: 'status',
    title: 'Status',
    type: 'select',
    items: statuses,
    width: 130,
  },
  {
    key: 'shipDate',
    title: 'Ship date',
    type: 'date',
    width: 140,
  },
  {
    key: 'urgent',
    title: 'Urgent',
    type: 'checkbox',
    width: 84,
    align: 'center',
  },
  {
    key: 'note',
    title: 'Note',
    type: 'text',
    width: 240,
  },
]

const CUSTOMERS = [
  'Aoyama Trading',
  'Beacon Foods',
  'Chuo Kaiun',
  'Delta Marine',
  'Eastport Ltd.',
  'Fuji Logistics',
  'Grandline Co.',
  'Harborview Inc.',
  'Ise Bay Shipping',
  'Jomon Materials',
  'Kanto Metals',
  'Lighthouse GmbH',
]

const NOTES = [
  'Partial shipment agreed',
  '',
  'Awaiting L/C amendment',
  '',
  'Customer pickup at gate 4',
  '',
  'Split across two containers',
  '',
]

/** Deterministic sample rows — no randomness, so the demo looks the same to everyone. */
export function createRows(count = 24): GridRow[] {
  return Array.from({ length: count }, (_, i) => {
    const day = ((i * 3) % 27) + 1
    const month = ((i * 5) % 12) + 1
    return {
      id: i + 1,
      reference: `SO-2026-${String(1041 + i).padStart(4, '0')}`,
      customer: CUSTOMERS[i % CUSTOMERS.length],
      department: departments[i % departments.length].value,
      port: cities[(i * 7) % cities.length].value,
      quantity: ((i * 17) % 480) + 20,
      unitPrice: ((i * 13) % 90) + 12,
      status: statuses[i % statuses.length].value,
      shipDate: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      urgent: i % 5 === 0,
      note: NOTES[i % NOTES.length],
    }
  })
}

/** Factory used for rows created by paste-overflow and the right-click menu. */
export function createBlankRow(): GridRow {
  return {
    id: `new-${Math.random().toString(36).slice(2, 9)}`,
    reference: '',
    customer: '',
    department: null,
    port: null,
    quantity: null,
    unitPrice: null,
    status: 'draft',
    shipDate: null,
    urgent: false,
    note: '',
  }
}
