import { getGlobalStartContext } from '@tanstack/react-start'

/**
 * Per-request CSP nonce set by security-headers middleware in `src/start.ts`.
 *
 * `getGlobalStartContext()` is typed against `@tanstack/router-core`'s empty
 * `Register`, which this app can't augment (not a direct dependency — see
 * TS2664). Until Start imports `Register` from `@tanstack/react-start` (TanStack
 * router#7357), cast the runtime context that middleware actually provides.
 */
export function getCspNonce(): string | undefined {
  const context = getGlobalStartContext() as { cspNonce?: string } | undefined
  return context?.cspNonce
}
