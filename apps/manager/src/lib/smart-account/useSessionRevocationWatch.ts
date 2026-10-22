import {
  type RhinestoneStoredSession,
  readHcaSessionNonce,
  removeSession,
} from '@ens-apps/smart-account'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Address, PublicClient } from 'viem'
import { isSessionRevokedOnChain } from './sessionGate'

// A revoke elsewhere shows up on the next read; the gate re-checks before any signature anyway.
const SESSION_NONCE_STALE_TIME_MS = 30_000

/**
 * A stored session may have been revoked from another browser or device: the
 * chain's nonce is the only record. Reads it while a session is held, and
 * forgets the session once its nonce falls behind so the gate re-prompts.
 */
export const useSessionRevocationWatch = (params: {
  readonly activeSession: RhinestoneStoredSession | null
  readonly accountAddress: Address | null
  readonly publicClient: PublicClient | undefined
  readonly onRevoked: () => void
}): boolean => {
  const { activeSession, accountAddress, publicClient, onRevoked } = params
  const isWatching = !!activeSession && !!accountAddress && !!publicClient

  const nonceQuery = useQuery({
    queryKey: $qk({
      $scope: 'smart-account',
      $action: 'session-nonce',
      hca: accountAddress,
    }),
    queryFn: () =>
      accountAddress && publicClient
        ? readHcaSessionNonce(publicClient, accountAddress)
        : null,
    enabled: isWatching,
    staleTime: SESSION_NONCE_STALE_TIME_MS,
  })

  const isRevoked = isSessionRevokedOnChain(activeSession, nonceQuery.data)

  useEffect(() => {
    if (!isRevoked || !accountAddress) return
    removeSession(accountAddress)
    onRevoked()
  }, [isRevoked, accountAddress, onRevoked])

  return isRevoked
}
