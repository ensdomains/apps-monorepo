import { RpcSubnameInventoryError } from './readRpcSubnameInventory'
import { shouldRetryResolverHistoryRead } from './v1ResolverHistory'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1_000

export const getSubnameMigrationImpactRetryDelay = (failureCount: number) =>
  RETRY_DELAY_MS * 2 ** failureCount

export const shouldRetrySubnameMigrationImpact = ({
  failureCount,
  cause,
}: {
  readonly failureCount: number
  readonly cause: unknown
}): boolean => {
  if (failureCount >= MAX_RETRIES) return false
  if (cause instanceof RpcSubnameInventoryError)
    return (
      cause.reason === 'read-failed' &&
      shouldRetryResolverHistoryRead(cause.cause)
    )
  return shouldRetryResolverHistoryRead(cause)
}
