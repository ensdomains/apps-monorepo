import type { registrationMachine } from '@ens-apps/transaction-manager'
import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import type { ActorRefFrom } from 'xstate'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'

function addressToToken(address: Address): 'USDC' | 'DAI' {
  return address.toLowerCase() === SUPPORTED_TOKENS.DAI.toLowerCase()
    ? 'DAI'
    : 'USDC'
}

type UseStartRegistrationParams = {
  readonly name: string
  readonly duration: number
  readonly actor: ActorRefFrom<typeof registrationMachine>
}

type StartRegistrationVariables = {
  readonly selectedToken: Address
  readonly tokenPrice: bigint
}

export function useStartRegistration({
  name,
  duration,
  actor,
}: UseStartRegistrationParams) {
  const chainId = sepolia.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const mutation = useMutation({
    mutationFn: async ({
      selectedToken,
      tokenPrice,
    }: StartRegistrationVariables) => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (!walletClient.account) {
        throw new Error('No account connected')
      }

      const signer = createEOASigner(walletClient)

      actor.send({
        type: 'START_REGISTRATION',
        name,
        duration: BigInt(duration),
        token: addressToToken(selectedToken),
        price: tokenPrice,
        signer,
        accountAddress: walletClient.account.address,
        publicClient,
        useFastRegistrar: true,
        sponsored: false,
      })

      return { sent: true }
    },
  })

  const startRegistration = useCallback(
    (selectedToken: Address, tokenPrice: bigint) => {
      mutation.mutate({ selectedToken, tokenPrice })
    },
    [mutation],
  )

  return {
    startRegistration,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
    hasWallet: !!walletClient,
  }
}
