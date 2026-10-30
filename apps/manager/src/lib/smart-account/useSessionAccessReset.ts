import type { RhinestoneStoredSession } from '@ens-apps/smart-account'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { isSessionAccessReset, type SessionResetMarker } from './sessionGate'
import { getSessionNonceQueryOptions } from './sessionNonce.query'
import {
  clearSessionReset,
  readSessionResetNonce,
  saveSessionReset,
} from './sessionResetStorage'

/**
 * Remembers, across reloads, that this browser reset the HCA's sessions, and
 * checks it against the chain's nonce so a reset from another device brings
 * the option back.
 */
export const useSessionAccessReset = (params: {
  readonly accountAddress: Address | null
  readonly chainId: number
  readonly publicClient: PublicClient | undefined
  readonly activeSession: RhinestoneStoredSession | null
  readonly isActiveSessionRevoked: boolean
}) => {
  const {
    accountAddress,
    chainId,
    publicClient,
    activeSession,
    isActiveSessionRevoked,
  } = params
  const [resetMarker, setResetMarker] = useState<SessionResetMarker | null>(
    null,
  )

  useEffect(() => {
    const sessionNonce = accountAddress
      ? readSessionResetNonce(chainId, accountAddress)
      : null
    setResetMarker(
      accountAddress && sessionNonce !== null
        ? { account: accountAddress, sessionNonce }
        : null,
    )
  }, [accountAddress, chainId])

  const nonceQuery = useQuery({
    ...getSessionNonceQueryOptions({ accountAddress, publicClient }),
    enabled: !!resetMarker && !!accountAddress && !!publicClient,
  })

  const markSessionAccessReset = useCallback(
    (account: Address, sessionNonce: bigint) => {
      saveSessionReset(chainId, account, sessionNonce)
      setResetMarker({ account, sessionNonce })
    },
    [chainId],
  )

  const clearSessionAccessReset = useCallback(
    (account: Address) => {
      clearSessionReset(chainId, account)
      setResetMarker(null)
    },
    [chainId],
  )

  return {
    isSessionAccessReset: isSessionAccessReset({
      resetMarker,
      accountAddress,
      onChainNonce: nonceQuery.data,
      hasActiveSession: !!activeSession && !isActiveSessionRevoked,
    }),
    markSessionAccessReset,
    clearSessionAccessReset,
  }
}
