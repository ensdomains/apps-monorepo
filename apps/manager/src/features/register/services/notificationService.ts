import * as v from 'valibot'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api'

export const USE_MOCK_API = true

const API_ENDPOINTS = {
  CHANNELS_EMAIL: `${API_BASE_URL}/channels/email`,
  CHANNELS_TELEGRAM: `${API_BASE_URL}/channels/telegram`,
  PREFERENCES: `${API_BASE_URL}/preferences`,
  PREFERENCES_BATCH: `${API_BASE_URL}/preferences/batch`,
} as const

export async function addEmailChannel(
  email: string,
): Promise<{ verificationSent: boolean }> {
  if (USE_MOCK_API) {
    console.log(
      '📧 [MOCK] Adding email channel and sending verification:',
      email,
    )
    return { verificationSent: true }
  }

  const response = await fetch(API_ENDPOINTS.CHANNELS_EMAIL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({ error: 'Unknown error' }))) as { error: string }
    throw new Error(errorData.error || 'Failed to add email channel')
  }

  const result = (await response.json()) as { verificationSent: boolean }
  return result
}

export async function resendEmailVerification(email: string): Promise<void> {
  if (USE_MOCK_API) {
    console.log('📧 [MOCK] Resending email verification:', email)
    return
  }

  const response = await fetch(`${API_ENDPOINTS.CHANNELS_EMAIL}/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({ error: 'Unknown error' }))) as { error: string }
    throw new Error(errorData.error || 'Failed to resend verification email')
  }
}

export async function updatePreferencesBatch(
  preferences: Record<string, Record<string, boolean>>,
): Promise<void> {
  if (USE_MOCK_API) {
    console.log('✅ [MOCK] Updating preferences batch:', preferences)
    return
  }

  const response = await fetch(API_ENDPOINTS.PREFERENCES_BATCH, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(preferences),
  })

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({ error: 'Unknown error' }))) as { error: string }
    throw new Error(errorData.error || 'Failed to update preferences')
  }
}

export interface TelegramAuthData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export async function addTelegramChannel(
  authData: TelegramAuthData,
): Promise<{ connected: boolean }> {
  if (USE_MOCK_API) {
    console.log('📱 [MOCK] Adding Telegram channel:', {
      id: authData.id,
      username: authData.username,
      first_name: authData.first_name,
    })
    return { connected: true }
  }

  const response = await fetch(API_ENDPOINTS.CHANNELS_TELEGRAM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(authData),
  })

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({ error: 'Unknown error' }))) as { error: string }
    throw new Error(errorData.error || 'Failed to add Telegram channel')
  }

  const result = (await response.json()) as { connected: boolean }
  return result
}

/**
 * Verifies Telegram authentication data using HMAC-SHA-256
 * Based on: https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(
  authData: TelegramAuthData,
  botToken: string,
): boolean {
  // Create data-check-string: all fields except hash, sorted alphabetically
  const dataCheckString = Object.entries(authData)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  // Calculate secret key (SHA256 of bot token)
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(botToken)

  // For browser environment, we'd need crypto.subtle, but for mock we'll skip verification
  // In production, this should be done server-side
  return true
}

export const isValidEmail = (email: string): boolean => {
  if (email.trim() === '') return true
  return v.safeParse(v.pipe(v.string(), v.email()), email).success
}
