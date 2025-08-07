import useLocalStorageState from 'use-local-storage-state'

export type TableViewSettings = {
  compact: boolean
  strippedRows: boolean
  wrapText: boolean
}

export const useTableViewSettings = (
  defaultValue: TableViewSettings = {
    compact: false,
    strippedRows: false,
    wrapText: false,
  },
) => {
  return useLocalStorageState<TableViewSettings>(
    'records-table-view-settings',
    { defaultValue },
  )
}
