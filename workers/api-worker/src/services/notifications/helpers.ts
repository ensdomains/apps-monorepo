import type {
  AnyChannelData,
  ChannelData,
  UserChannel,
} from '#types/notifications.js'
import { logger } from '#utils/logger.js'

const channelSanitizers = {
  email: (target, data) => {
    if (!target) {
      logger.warn('Email target is undefined', { target, data })
      return 'Unknown Email'
    }
    // sanitize email by only showing the domain and the first letter of the username
    const parts = target.split('@')
    if (parts.length !== 2) {
      logger.warn('Email target is invalid', { target, data })
      return 'Unknown Email'
    }
    const username = parts[0]
    const domain = parts[1]

    return `${username.slice(0, 1)}${'*'.repeat(username.length - 1)}@${domain}`
  },
  telegram: (target, data) => {
    return `@${data.username}`
  },
  push: (target, data) => {
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

const test = sanitizeChannel('push', null, {
  token: 'test',
})

console.log(test)
