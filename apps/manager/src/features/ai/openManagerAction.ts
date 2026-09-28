import type { useNavigate } from '@tanstack/react-router'
import { getAddress, isAddress } from 'viem'
import type { PreparedManagerAction } from './managerActions'

export type ManagerActionContext = {
  readonly isCurrent: () => boolean
  readonly navigate: ReturnType<typeof useNavigate>
  readonly connectedAddress?: string
  readonly openManagerReview: (action: PreparedManagerAction) => void
}

export const openManagerAction = async (
  action: PreparedManagerAction,
  context: ManagerActionContext,
): Promise<string | null> => {
  if (!context.isCurrent()) return null
  switch (action.kind) {
    case 'show_dashboard':
    case 'show_favorites':
      await context.navigate({
        to: '/dashboard',
        search: {
          tab: action.kind === 'show_favorites' ? 'favorites' : 'owned',
        },
      })
      return null
    case 'view_address': {
      const address =
        action.address ??
        (action.ownWallet ? context.connectedAddress : undefined)
      if (!address || !isAddress(address))
        return 'Connect a wallet or provide a valid Ethereum address.'
      await context.navigate({
        to: '/$address',
        params: { address: getAddress(address) },
      })
      return null
    }
    case 'show_notifications':
      await context.navigate({
        to: '/notifications',
        search: { unread: action.unreadOnly, tag: action.notificationTag },
      })
      return null
    case 'open_notification_settings':
      await context.navigate({ to: '/notifications/settings', search: {} })
      return null
    case 'migration_permissions':
      await context.navigate({ to: '/migration-permissions' })
      return null
    default:
      context.openManagerReview(action)
      return null
  }
}
