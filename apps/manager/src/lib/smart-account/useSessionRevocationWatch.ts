import {
  getValidSessionForAccount,
  type RhinestoneStoredSession,
  removeSession,
} from '@ens-apps/smart-account'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Address, PublicClient } from 'viem'
import {
  isSessionRevokedOnChain,
  resolveSessionAfterRevocation,
} from './sessionGate'
import { getSessionNonceQueryOptions } from './sessionNonce.query'

/**
 * A stored session may have been revoked from another browser or device: the
 * chain's nonce is the only record. Reads it while a session is held, and once
 * the held session's nonce falls behind hands back what to hold instead: a
 * newer session another tab has stored since, or nothing.
 */
export const useSessionRevocationWatch = (params: {
  readonly activeSession: RhinestoneStoredSession | null
  readonly accountAddress: Address | null
  readonly ownerAddress: Address | null
  readonly chainId: number
  readonly publicClient: PublicClient | undefined
  readonly onRevoked: (next: RhinestoneStoredSession | null) => void
}): boolean => {
  const {
    activeSession,
    accountAddress,
    ownerAddress,
    chainId,
    publicClient,
    onRevoked,
  } = params

  const nonceQuery = useQuery({
    ...getSessionNonceQueryOptions({ accountAddress, publicClient }),
    enabled: !!activeSession && !!accountAddress && !!publicClient,
  })
  const onChainNonce = nonceQuery.data

  const isRevoked = isSessionRevokedOnChain(activeSession, onChainNonce)

  useEffect(() => {
    if (!isRevoked || !accountAddress || !ownerAddress) return
    // Storage is shared across tabs: another tab may have enabled a newer
    // session since, which must be adopted rather than deleted.
    const next = resolveSessionAfterRevocation(
      getValidSessionForAccount({ accountAddress, ownerAddress, chainId }),
      onChainNonce,
    )
    if (!next) removeSession(accountAddress)
    onRevoked(next)
  }, [
    isRevoked,
    accountAddress,
    ownerAddress,
    chainId,
    onChainNonce,
    onRevoked,
  ])

  return isRevoked
}
