import { createClientOnlyFn } from '@tanstack/react-start'
import { createStore } from '@xstate/store'
import type { AppRouter } from 'api-worker/hc'
import { hc } from 'hono/client'

type BackendAuthContext = {
  authKey: string | undefined
  address: string | undefined
}

type BackendAuthEvents = {
  signIn: { authKey: string; address?: string }
  signOut: null
}

const baseUrl = import.meta.env.VITE_API_URL ?? '/api'

export const backendAuthStore = createStore<
  BackendAuthContext,
  BackendAuthEvents,
  never
>({
  context: {
    authKey: undefined,
    address: undefined,
  },
  on: {
    signIn: (context, event) => ({
      ...context,
      authKey: event.authKey,
      address: event.address ?? context.address,
    }),
    signOut: (context) => ({
      ...context,
      authKey: undefined,
      address: undefined,
    }),
  },
})

export const isBackendAuthed = backendAuthStore.select(
  (state) => state.authKey !== undefined,
)

const decodeJwtAddress = (token: string | undefined) => {
  if (!token) return undefined
  const [_, payloadPart] = token.split('.')
  if (!payloadPart) return undefined
  try {
    if (typeof atob === 'undefined') return undefined
    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
    )
    return payload.address as string | undefined
  } catch {
    return undefined
  }
}

const getCsrfCookie = () => {
  if (typeof document === 'undefined') return undefined
  const cookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith('__Host-csrf='))

  return cookie?.split('=')[1]
}

const shouldSkipRetry = (input: RequestInfo | URL) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

  return url.includes('/auth/refresh') || url.includes('/auth/logout')
}

let refreshPromise: Promise<boolean> | null = null

export const setBackendAuth = (token: string, address?: string) => {
  backendAuthStore.trigger.signIn({
    authKey: token,
    address: address ?? decodeJwtAddress(token),
  })
}

export const refreshAccessToken = createClientOnlyFn(async () => {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const csrf = getCsrfCookie()
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF': csrf } : undefined,
      })

      if (!response.ok) {
        backendAuthStore.trigger.signOut()
        return false
      }

      const { token } = (await response.json()) as { token: string }

      setBackendAuth(token)

      return true
    } catch (error) {
      console.error('Failed to refresh backend auth', error)
      backendAuthStore.trigger.signOut()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
})

const authFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
  })

  if (response.status !== 401 || shouldSkipRetry(input)) {
    return response
  }

  const refreshed = await refreshAccessToken()

  if (!refreshed) {
    return response
  }

  const headers = new Headers(init?.headers ?? {})
  const auth = backendAuthStore.get().context.authKey

  if (auth) {
    headers.set('Authorization', `Bearer ${auth}`)
  } else {
    headers.delete('Authorization')
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  })
}

export const backendClient = hc<AppRouter>(baseUrl, {
  fetch: authFetch,
  headers: () => {
    const auth = backendAuthStore.get().context.authKey

    if (!auth) {
      return {} as Record<string, string>
    }

    return {
      Authorization: `Bearer ${auth}`,
    }
  },
})

export const logoutBackend = async () => {
  await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined)

  backendAuthStore.trigger.signOut()
}

if (typeof window !== 'undefined') {
  void refreshAccessToken()
}
