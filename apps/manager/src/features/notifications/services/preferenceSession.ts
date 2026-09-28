import { backendAuthStore } from '@/utils/backend-client'
import { NotificationSessionChangedError } from './backendSession'

type AuthContext = ReturnType<typeof backendAuthStore.get>['context']

export type PreferenceSession = {
  readonly id: string
  readonly authenticated: boolean
  readonly assertCurrent: () => void
}

const sameIdentity = (a: AuthContext, b: AuthContext) =>
  a.authKey === b.authKey &&
  a.address?.toLowerCase() === b.address?.toLowerCase() &&
  a.apiBaseUrlOverride === b.apiBaseUrlOverride

let identity = backendAuthStore.get().context
const instanceId = crypto.randomUUID()
let sequence = 0
const listeners = new Set<() => void>()
const makeSession = (): PreferenceSession => {
  const epoch = sequence
  const id = `${instanceId}:${epoch}`
  const authenticated = !!identity.authKey && !!identity.address
  return {
    id,
    authenticated,
    assertCurrent: () => {
      if (!authenticated || sequence !== epoch)
        throw new NotificationSessionChangedError({
          message: 'Your sign-in changed. Review notification settings again.',
        })
    },
  }
}
let session = makeSession()

// One module-lifetime subscription tracks even a transient sign-out/sign-in.
// Only its opaque sequence enters query keys; credentials stay in the auth store.
backendAuthStore.subscribe(({ context }) => {
  if (sameIdentity(identity, context)) return
  identity = context
  sequence += 1
  session = makeSession()
  for (const listener of listeners) listener()
})

export const getPreferenceSession = () => session
export const subscribePreferenceSession = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
