import type { AppRouter } from 'api-worker/hc'
import { hc } from 'hono/client'
import posthog from 'posthog-js'
import { createPersistedStore } from './xstate-store'

const BACKEND_AUTH_STORAGE_KEY = '@manager-v4/backend_auth'

type BackendAuthContext = {
  authKey: string | undefined
  address: string | undefined
}

type BackendAuthEvents = {
  signIn: { authKey: string; address: string }
  signOut: Record<string, never>
}

export const backendAuthStore = createPersistedStore<
  BackendAuthContext,
  BackendAuthEvents,
  never
>(
  {
    context: {
      authKey: undefined,
      address: undefined,
    },
    on: {
      signIn: (context, event: { authKey: string; address: string }) => ({
        ...context,
        authKey: event.authKey,
        address: event.address,
      }),
      signOut: (context) => ({
        ...context,
        authKey: undefined,
        address: undefined,
      }),
    },
  },
  { key: BACKEND_AUTH_STORAGE_KEY },
)

export const isBackendAuthed = backendAuthStore.select(
  (state) => state.authKey !== undefined,
)

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

const authFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)

  if (response.status === 401) {
    backendAuthStore.trigger.signOut()
  }

  return response
}

export const backendClient = hc<AppRouter>(BASE_URL, {
  headers: () => {
    const auth = backendAuthStore.get().context.authKey
    const posthogId = posthog.get_distinct_id()

    if (!auth) {
      return {
        'X-PostHog-Distinct-ID': posthogId,
      } as Record<string, string>
    }

    return {
      Authorization: `Bearer ${auth}`,
      'X-PostHog-Distinct-ID': posthogId,
    }
  },

  fetch: authFetch,
})
