import { createStore } from '@xstate/store'
import type { AppRouter } from 'api-worker/hc'
import { hc } from 'hono/client'

// export const backendAuthKey = createAtom<string | null>(null)

export const backendAuthStore = createStore({
  context: {
    authKey: undefined as string | undefined,
    address: undefined as string | undefined,
  },
  on: {
    signIn: (context, event: { authKey: string; address: string }) => {
      context.authKey = event.authKey
      context.address = event.address
    },
    signOut: (context) => {
      context.authKey = undefined
      context.address = undefined
    },
  },
})

export const isBackendAuthed = backendAuthStore.select(
  (state) => state.authKey !== undefined,
)

const baseUrl = import.meta.env.VITE_API_URL ?? '/api'

export const backendClient = hc<AppRouter>(baseUrl, {
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
