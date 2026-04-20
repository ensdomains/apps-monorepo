import { OwnedResolverDeployError } from './ensureOwnedPermRes'
import { ProfileFetchError } from './fetchV1Profiles'

export type MigrationError =
  | { type: 'generic'; message: string }
  | { type: 'resolver-deploy-failed'; message: string }
  | {
      type: 'profile-fetch-failed'
      phase: 'subgraph' | 'onchain'
      message: string
    }
  | { type: 'user-rejected' }
  | { type: 'preflight-timeout'; message: string; timeoutMs?: number }

export const extractErrorMessage = (err: unknown): string => {
  if (!(err instanceof Error)) return String(err)

  let deepest = err
  while ('cause' in deepest && deepest.cause instanceof Error) {
    deepest = deepest.cause
  }

  const short =
    (err as unknown as Record<string, unknown>).shortMessage ??
    (deepest as unknown as Record<string, unknown>).shortMessage

  if (typeof short === 'string') return short
  if (deepest !== err && deepest.message) return deepest.message

  return err.message || 'Migration failed'
}

const walkCauseChain = (err: unknown): Error[] => {
  const chain: Error[] = []
  let cur: unknown = err
  while (cur instanceof Error) {
    chain.push(cur)
    cur = (cur as { cause?: unknown }).cause
  }
  return chain
}

const isUserRejection = (err: unknown): boolean => {
  if (err instanceof Error && err.name === 'MigrationUserRejectedError') {
    return true
  }
  return walkCauseChain(err).some(
    (e) =>
      e.name === 'UserRejectedRequestError' || /user rejected/i.test(e.message),
  )
}

const findTimeoutError = (
  err: unknown,
): (Error & { timeoutMs?: number }) | null => {
  for (const e of walkCauseChain(err)) {
    if (e.name === 'PreflightTimeoutError') {
      return e as Error & { timeoutMs?: number }
    }
  }
  return null
}

export const decodeMigrationError = (err: unknown): MigrationError => {
  if (isUserRejection(err)) return { type: 'user-rejected' }

  const timeout = findTimeoutError(err)
  if (timeout) {
    return {
      type: 'preflight-timeout',
      message: extractErrorMessage(timeout),
      timeoutMs: timeout.timeoutMs,
    }
  }

  if (err instanceof OwnedResolverDeployError) {
    return { type: 'resolver-deploy-failed', message: extractErrorMessage(err) }
  }
  if (err instanceof ProfileFetchError) {
    return {
      type: 'profile-fetch-failed',
      phase: err.phase,
      message: extractErrorMessage(err),
    }
  }
  return { type: 'generic', message: extractErrorMessage(err) }
}
