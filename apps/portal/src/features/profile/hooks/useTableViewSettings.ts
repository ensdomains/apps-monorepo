import useLocalStorageState from 'use-local-storage-state'

export type TableViewSettings = {
  compact: boolean
  strippedRows: boolean
  wrapText: boolean
}

export const useTableViewSettings = () => {
  return useLocalStorageState<TableViewSettings>(
    'records-table-view-settings',
    {
      defaultValue: { compact: false, strippedRows: false, wrapText: false },
    },
  )
}
