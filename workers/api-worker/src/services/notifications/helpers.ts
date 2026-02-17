import type { ChannelData, UserChannel } from '#types/notifications.js'
import { logger } from '#utils/logger.js'

const channelSanitizers = {
  email: (target, data) => {
    if (!target) {
      logger.warn('Email target is undefined', { target, data })
      return 'Unknown Email'
    }
    return target
  },
  telegram: (_target, data) => {
    return `@${data.username}`
  },
  push: (_target, _data) => {
    // TODO: sanitize push token
    return 'Push Notification'
  },
} satisfies {
  [K in UserChannel]: (target: string | null, data: ChannelData[K]) => any
}

export const sanitizeChannel = <T extends UserChannel>(
  channel: T,
  target: string | null,
  data: ChannelData[T],
) => {
  return channelSanitizers[channel](
    target,
    // @ts-expect-error - we know the channel is valid
    data as ChannelData[UserChannel],
  ) as ReturnType<(typeof channelSanitizers)[T]>
}
