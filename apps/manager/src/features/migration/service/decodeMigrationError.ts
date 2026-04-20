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

export const decodeMigrationError = (err: unknown): MigrationError => {
  if (err instanceof OwnedResolverDeployError) {
    return {
      type: 'resolver-deploy-failed',
      message: extractErrorMessage(err),
    }
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
