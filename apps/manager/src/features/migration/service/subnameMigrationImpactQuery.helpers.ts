import { RpcSubnameInventoryError } from './readRpcSubnameInventory'
import { shouldRetryResolverHistoryRead } from './v1ResolverHistory'

const MAX_RETRIES = 2

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
