import type { TelegramAuthData } from 'api-worker/types'

export interface TelegramLoginOptions {
  botId?: string
  requestAccess?: 'write' | 'read'
  lang?: string
}

export { TelegramAuthData }
