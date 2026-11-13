import { useBlocker } from '@tanstack/react-router'
import { shouldConfirmRecordNavigation } from '../helpers/recordLeavePolicy'

export const useEditRecordsLeaveProtection = (changesCount: number) => {
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (
        !shouldConfirmRecordNavigation({
          changesCount,
          currentPathname: current.pathname,
          nextPathname: next.pathname,
        })
      )
        return false
      return !confirm(
        'You have unsaved record changes. Leave this page and discard them?',
      )
    },
    enableBeforeUnload: changesCount > 0,
  })
}
