import type { Address, EIP1193Provider } from 'viem'

/**
 * The shape consumers read via `usePrivySession()`. Populated by the lazily
 * loaded `PrivyRuntime` (the only module that imports `@privy-io/react-auth`);
 * everything else reads it from here, so the heavy Privy SDK never lands in the
 * initial/SSR bundle. See docs/PRIVY.md → "Lazy loading".
 */
export type PrivySessionValue = {
  isConnected: boolean
  ready: boolean
  address: Address | null
  hasEmbeddedWallet: boolean
  busy: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signInWithX: () => Promise<void>
  // Email OTP (two-step, inline — no redirect). `awaitingEmailCode` is the
  // address a code was sent to (null = step 1: ask for the email), so the
  // dialog knows to switch to the code input.
  awaitingEmailCode: string | null
  signInWithEmail: (email: string) => Promise<void>
  completeEmail: (code: string) => Promise<void>
  createDefaultWallet: () => Promise<void>
  exportWallet: () => Promise<void>
  logout: () => Promise<void>
  getProvider: () => Promise<{ provider: EIP1193Provider; address: Address }>
}

// ── Load flag ────────────────────────────────────────────────────────────────
// Whether the Privy SDK chunk should be loaded + mounted. Starts false so a
// visitor who never authenticates (e.g. the landing page) never downloads the
// ~1.2 MB SDK. Flipped true by requestPrivyLoad() — on mount if a stored Privy
// session exists, or when the user opens the login dialog.
let loadRequested = false
const loadListeners = new Set<() => void>()

export const requestPrivyLoad = () => {
  if (loadRequested) return
  loadRequested = true
  for (const l of loadListeners) l()
}

export const privyLoadStore = {
  subscribe(l: () => void) {
    loadListeners.add(l)
    return () => loadListeners.delete(l)
  },
  getSnapshot: () => loadRequested,
  // SSR: never load on the server (auth is client-side; the SDK stays out of
  // the worker bundle).
  getServerSnapshot: () => false as boolean,
}

// ── Session snapshot ──────────────────────────────────────────────────────────
const DEFAULT: PrivySessionValue = {
  isConnected: false,
  ready: false,
  address: null,
  hasEmbeddedWallet: false,
  busy: false,
  error: null,
  // Before the runtime is loaded these are safe stand-ins. The login dialog
  // disables the social buttons until `ready`, so the real (runtime) callbacks
  // are in place by the time they can be invoked; calling one early just kicks
  // off the load.
  signInWithGoogle: async () => requestPrivyLoad(),
  signInWithX: async () => requestPrivyLoad(),
  awaitingEmailCode: null,
  signInWithEmail: async () => requestPrivyLoad(),
  completeEmail: async () => {},
  createDefaultWallet: async () => {},
  exportWallet: async () => requestPrivyLoad(),
  logout: async () => {},
  getProvider: async () => {
    throw new Error('Privy runtime not loaded')
  },
}

let snapshot: PrivySessionValue = DEFAULT
const listeners = new Set<() => void>()

/** Called by PrivyRuntime to publish the live session; resets to DEFAULT on unmount. */
export const publishPrivySession = (value: PrivySessionValue) => {
  snapshot = value
  for (const l of listeners) l()
}
export const resetPrivySession = () => {
  if (snapshot === DEFAULT) return
  snapshot = DEFAULT
  for (const l of listeners) l()
}

export const privySessionStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => DEFAULT,
}
