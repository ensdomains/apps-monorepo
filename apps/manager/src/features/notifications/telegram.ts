import type { TelegramAuthData } from 'api-worker/types'

export interface TelegramLoginOptions {
  botId?: string
  requestAccess?: 'write' | 'read'
  lang?: string
}

const TELEGRAM_ORIGIN = 'https://oauth.telegram.org'

export const TELEGRAM_BOT_ID = import.meta.env.VITE_TELEGRAM_BOT_ID as string

if (!TELEGRAM_BOT_ID) {
  throw new Error('TELEGRAM_BOT_ID is not set')
}

/**
 * Opens Telegram login in a popup window and resolves with TelegramUser
 * Adds debugging output to trace the authentication flow.
 */
export async function loginWithTelegramPopup(
  options: TelegramLoginOptions,
): Promise<TelegramAuthData> {
  const { botId = TELEGRAM_BOT_ID, requestAccess, lang } = options

  const origin = window.location.origin
  const returnTo = window.location.href
  const popupUrl =
    `${TELEGRAM_ORIGIN}/auth?bot_id=${encodeURIComponent(botId)}` +
    `&origin=${encodeURIComponent(origin)}` +
    `&return_to=${encodeURIComponent(returnTo)}` +
    (requestAccess ? `&request_access=${requestAccess}` : '') +
    (lang ? `&lang=${lang}` : '')

  const width = 550
  const height = 470
  const left = Math.max(0, (window.screen.width - width) / 2)
  const top = Math.max(0, (window.screen.height - height) / 2)

  console.debug('[TelegramLogin] Opening popup with URL:', popupUrl)

  return new Promise((resolve, reject) => {
    const popup = window.open(
      popupUrl,
      'telegram_oauth',
      `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`,
    )

    if (!popup) {
      console.error('[TelegramLogin] Popup blocked by browser')
      return reject(new Error('Popup blocked'))
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source !== popup) {
        // Debug unrelated message source
        // console.debug('[TelegramLogin] Ignoring message from unrelated source', event);
        return
      }
      try {
        const data = JSON.parse(event.data)
        console.debug('[TelegramLogin] Received message from popup:', data)
        if (data.event === 'auth_result' && data.result) {
          console.info(
            '[TelegramLogin] Authentication successful:',
            data.result,
          )
          cleanup()
          resolve(data.result as TelegramAuthData)
        }
      } catch (err) {
        // Debug parse errors or unrelated messages
        console.debug(
          '[TelegramLogin] Failed to parse message data or unrelated message:',
          event.data,
          err,
        )
      }
    }

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      if (!popup.closed) {
        try {
          popup.close()
          console.debug('[TelegramLogin] Popup closed by cleanup')
        } catch (err) {
          console.warn(
            '[TelegramLogin] Error closing popup during cleanup:',
            err,
          )
        }
      }
    }

    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval)
        cleanup()
        console.warn('[TelegramLogin] Popup closed before authentication')
        reject(new Error('Popup closed before authentication'))
      }
    }, 300)

    window.addEventListener('message', onMessage)
    console.debug('[TelegramLogin] Waiting for authentication result...')
  })
}

/**
 * If Telegram redirected back with a hash fragment (#tgAuthResult=...)
 * extract it and return the parsed TelegramUser
 */
export function decodeTelegramAuthDataFromUrlHash(
  hash: string,
): TelegramAuthData | null {
  const match = hash.match(/[#?&]tgAuthResult=([A-Za-z0-9\-_]*)$/)
  if (!match) return null
  try {
    let data = match[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const pad = data.length % 4
    if (pad > 1) data += '='.repeat(4 - pad)
    const decoded = atob(data)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}
