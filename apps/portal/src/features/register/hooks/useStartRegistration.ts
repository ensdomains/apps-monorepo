import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import { getWalletClient } from '@wagmi/core/actions'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'

type UseStartRegistrationParams = {
  readonly name: string
  readonly duration: number
  readonly actor: RegistrationMachineActor
}

export const useStartRegistration = ({
  name,
  duration,
  actor,
}: UseStartRegistrationParams) => {
  const chainId = sepolia.id
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId })

  const startRegistration = async (
    selectedToken: Address,
    tokenPrice: bigint,
  ) => {
    if (!publicClient || !connection.address) {
      throw new Error('Wallet not connected')
    }

    const walletClient = await getWalletClient(config, {
      connector: connection.connector,
      account: connection.address,
    })

    if (!walletClient) {
      throw new Error('Wallet not connected')
    }

    const signer = createEOASigner(walletClient)

    actor.send({
      type: 'START_REGISTRATION',
      name,
      duration: BigInt(duration),
      token: getTokenMetadataWithAddress(selectedToken).symbol,
      price: tokenPrice,
      signer,
      accountAddress: connection.address,
      publicClient,
      useFastRegistrar: true,
      sponsored: false,
    })
  }

  return startRegistration
}
