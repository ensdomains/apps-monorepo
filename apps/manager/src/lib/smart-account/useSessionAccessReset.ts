import type { RhinestoneStoredSession } from '@ens-apps/smart-account'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import type { Address, PublicClient } from 'viem'
import { isSessionAccessReset } from './sessionGate'
import { getSessionNonceQueryOptions } from './sessionNonce.query'
import {
  clearSessionReset,
  readSessionResetNonce,
  saveSessionReset,
  subscribeSessionResets,
} from './sessionResetStorage'

/**
 * Remembers, across reloads and open tabs, that this browser reset the HCA's
 * sessions, and checks it against the chain's nonce so a reset from another
 * device brings the option back.
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

  // A bigint snapshot compares by value, so unchanged storage doesn't re-render.
  const resetNonce = useSyncExternalStore(
    subscribeSessionResets,
    () =>
      accountAddress ? readSessionResetNonce(chainId, accountAddress) : null,
    () => null,
  )

  const nonceQuery = useQuery({
    ...getSessionNonceQueryOptions({ accountAddress, publicClient }),
    enabled: resetNonce !== null && !!accountAddress && !!publicClient,
  })

  const markSessionAccessReset = useCallback(
    (account: Address, sessionNonce: bigint) =>
      saveSessionReset(chainId, account, sessionNonce),
    [chainId],
  )

  const clearSessionAccessReset = useCallback(
    (account: Address) => clearSessionReset(chainId, account),
    [chainId],
  )

  return {
    isSessionAccessReset: isSessionAccessReset({
      resetMarker:
        accountAddress && resetNonce !== null
          ? { account: accountAddress, sessionNonce: resetNonce }
          : null,
      accountAddress,
      onChainNonce: nonceQuery.data,
      hasActiveSession: !!activeSession && !isActiveSessionRevoked,
    }),
    markSessionAccessReset,
    clearSessionAccessReset,
  }
}
