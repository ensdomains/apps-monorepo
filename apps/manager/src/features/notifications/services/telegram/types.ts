import type { TelegramAuthData } from 'api-worker/types/telegram'

export interface TelegramLoginOptions {
  botId?: string
  requestAccess?: 'write' | 'read'
  lang?: string
}

export { TelegramAuthData }
