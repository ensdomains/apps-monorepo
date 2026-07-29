/**
 * Clear the sender's primary reverse records before transferring their primary
 * name. Writes `setName('')` on the ENSv1 DefaultReverseRegistrar (`default.reverse`)
 * then the ReverseRegistrar (`addr.reverse`), via the existing setReverseResolution
 * helper. Modal tracks the final tx id only.
 */

import {
  ENS_SEPOLIA_CONTRACTS,
  type Signer,
} from '@ens-apps/transaction-manager'
import { defaultReverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/defaultReverseRegistrar'
import { reverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/reverseRegistrar'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { isAddressEqual } from 'viem'
import { DEFAULT_REVERSE_REGISTRAR_ADDRESS } from '@/features/reverse-resolution/config'
import { setReverseResolution } from '@/features/reverse-resolution/helpers/setReverseResolution'

type UnsetPrimaryNameParameters = {
  readonly name: string
  readonly owner: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export const unsetPrimaryName = async ({
  name,
  owner,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: UnsetPrimaryNameParameters): Promise<{ txId: string; hash: Hex }> => {
  if (
    !walletClient.account ||
    !isAddressEqual(walletClient.account.address, owner)
  ) {
    throw new Error(
      'Connected wallet must match the owner whose primary name is being cleared',
    )
  }

  const common = { name, walletClient, publicClient, signer, chainId }

  await setReverseResolution({
    ...common,
    id: `${id}-default`,
    request: {
      address: DEFAULT_REVERSE_REGISTRAR_ADDRESS,
      abi: defaultReverseRegistrarSetNameSnippet,
      functionName: 'setName',
      args: [''],
    },
  })

  return setReverseResolution({
    ...common,
    id,
    request: {
      address: ENS_SEPOLIA_CONTRACTS.ReverseRegistrar,
      abi: reverseRegistrarSetNameSnippet,
      functionName: 'setName',
      args: [''],
    },
  })
}
