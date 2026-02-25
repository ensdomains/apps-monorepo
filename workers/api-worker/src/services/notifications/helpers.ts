import type {
  ChannelData,
  ChannelType as UserChannel,
} from '@ens-apps/shared-schema/notifications'
import { logger } from '#utils/logger.js'

export const sanitizeChannel = <T extends UserChannel>(
  channel: T,
  target: string | null,
  data: ChannelData[T],
) => {
  switch (channel) {
    case 'email': {
      if (!target) {
        logger.warn('Email target is undefined', {
          hasData: Boolean(data),
        })
        return 'Unknown Email'
      }
      return target
    }
    case 'telegram':
      return `@${(data as ChannelData['telegram']).username}`
    case 'push':
      return 'Push Notification'
    default:
      return String(target ?? 'Unknown')
  }
}
