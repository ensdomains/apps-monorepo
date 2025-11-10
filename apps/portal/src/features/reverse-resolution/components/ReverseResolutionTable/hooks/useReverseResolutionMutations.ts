import type { CoinType } from '@ens-apps/l2-primary/chains'
import type {
  SetForwardResolutionRequest,
  SetReverseNameRequest,
} from '@ens-apps/l2-primary/hooks'
import {
  useSetForwardResolution,
  useSetReverseName,
} from '@ens-apps/l2-primary/hooks'
import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import {
  type SetPrimaryNameWriteParametersReturnType,
  setPrimaryNameWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'

export type UseReverseResolutionMutationsParams = {
  coinType: CoinType
  isTestnet: boolean
  displayName: string | null
}

export type ReverseResolutionWriteRequest =
  | {
      kind: 'l1'
      request: SetPrimaryNameWriteParametersReturnType
    }
  | {
      kind: 'l2'
      request: SetReverseNameRequest
    }

export function useReverseResolutionMutations({
  coinType,
  isTestnet: _isTestnet, // not needed for now until we enable mainnet
  displayName,
}: UseReverseResolutionMutationsParams) {
  const queryClient = useQueryClient()

  // L1 means Ethereum (coinType 60). We only use Sepolia for L1 here.
  const isL1 = useMemo(() => Number(coinType) === 60, [coinType])

  const { data: l1WalletClient } = useWalletClient({ chainId: sepolia.id })

  const ensChain = wagmiConfig.chains.find((c) => c.id === sepolia.id)
  const ensEnabledChain = ensChain as ChainWithEns<typeof sepolia>

  /*
    // If we enable mainnet we reintroduce this code
    const l1ChainBase = isTestnet ? sepolia : mainnet
    const { data: l1WalletClient } = useWalletClient({ chainId: l1ChainBase.id })
    const ensEnabledChain = ensChain as ChainWithEns<typeof l1ChainBase>
  */

  // L2 Reverse Name (address -> name)
  const { getSetReverseNameRequest } = useSetReverseName({
    coinType,
    isTestnet: true, // if you’re sep only, it’s testnet by definition
  })

  // Forward Resolution (name -> address) on L1 only
  const { getSetAddressRequest, resolverAddress } = useSetForwardResolution({
    name: displayName || '',
    coinType,
  })

  const invalidateReverseResolutionQuery = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['getReverseResolution'] })
  }, [queryClient])

  const getReverseResolutionRequest = useCallback(
    (name: string): ReverseResolutionWriteRequest => {
      if (isL1) {
        if (!l1WalletClient)
          throw new Error('Sepolia wallet client not available')
        if (!l1WalletClient.account) throw new Error('No connected account')
        if (!ensEnabledChain) throw new Error('Sepolia chain missing in config')

        const client = {
          ...l1WalletClient,
          chain: ensEnabledChain,
        }

        return {
          kind: 'l1',
          request: setPrimaryNameWriteParameters(client, { name }),
        }
      }

      return {
        kind: 'l2',
        request: getSetReverseNameRequest(name),
      }
    },
    [ensEnabledChain, getSetReverseNameRequest, isL1, l1WalletClient],
  )

  const getForwardResolutionRequest = useCallback(
    (address: Address): SetForwardResolutionRequest => {
      if (!isL1)
        throw new Error('Forward resolution is only for Ethereum (coinType 60)')
      if (!resolverAddress) throw new Error('Resolver not found for this name')

      return getSetAddressRequest(address)
    },
    [getSetAddressRequest, isL1, resolverAddress],
  )

  return {
    isL1,
    resolverAddress,
    getReverseResolutionRequest,
    getForwardResolutionRequest,
    invalidateReverseResolutionQuery,
  }
}
