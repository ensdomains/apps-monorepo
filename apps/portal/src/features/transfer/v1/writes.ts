/**
 * Intent builders for the V1 contract writes a transfer can make. Each returns
 * the prepared call, so the modal's gas estimate and the submitted transaction
 * are built from the same bytes.
 *
 * The wrapper and registrar calls go through ensjs `transferNameWriteParameters`
 * / `setResolverWriteParameters`. The registry calls deliberately do not: on
 * Sepolia the ensjs `ensRegistry` chain contract is the *V2 root registry*, so
 * ensjs's `contract: 'registry'` variants would target the wrong contract. V1
 * registry writes encode the ABI snippet against `ensLegacyRegistry` instead.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  setResolverWriteParameters,
  transferNameWriteParameters,
} from '@ensdomains/ensjs/wallet/v1'
import {
  registrySetOwnerSnippet,
  registrySetResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import {
  type Account,
  type Address,
  encodeFunctionData,
  namehash,
  type Transport,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import type { IntentContext } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'

const LEGACY_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})

// ensjs needs a client whose chain carries the ENS contract addresses; the
// wallet's own chain object doesn't (same reason `burnFuses` re-chains).
const ensjsClient = (walletClient: WalletClient) =>
  ({ ...walletClient, chain: sepoliaWithEns }) as unknown as WalletClient<
    Transport,
    typeof sepoliaWithEns,
    Account
  >

// ensjs write-parameter builders return a union over every call they can
// produce, which `encodeFunctionData` can't take as-is.
const encode = (params: {
  readonly abi: readonly unknown[]
  readonly functionName: string
  readonly args: readonly unknown[]
}) => encodeFunctionData(params as Parameters<typeof encodeFunctionData>[0])

/**
 * Move a V1 name through ensjs: `BaseRegistrar.reclaim` (`registrar` +
 * `reclaim`), `BaseRegistrar.safeTransferFrom` (`registrar`) or
 * `NameWrapper.safeTransferFrom` (`nameWrapper`).
 */
export const prepareTransferV1NameTransaction = ({
  name,
  recipient,
  contract,
  reclaim,
  walletClient,
  chainId,
}: IntentContext & {
  readonly name: string
  readonly recipient: Address
  readonly contract: 'registrar' | 'nameWrapper'
  readonly reclaim?: boolean
}): CustomTransactionIntent => {
  const params = transferNameWriteParameters(ensjsClient(walletClient), {
    name,
    newOwnerAddress: recipient,
    contract,
    reclaim,
  })
  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: params.address,
    data: encode(params),
    chainId,
  })
}

/** `ENSRegistry.setOwner(node, recipient)` on the legacy registry. */
export const prepareSetV1RegistryOwnerTransaction = ({
  name,
  recipient,
  walletClient,
  chainId,
}: IntentContext & {
  readonly name: string
  readonly recipient: Address
}): CustomTransactionIntent =>
  toEoaCustomIntent({
    from: walletClient.account.address,
    to: LEGACY_REGISTRY,
    data: encodeFunctionData({
      abi: registrySetOwnerSnippet,
      functionName: 'setOwner',
      args: [namehash(name), recipient],
    }),
    chainId,
  })

/**
 * Clear the name's resolver. A wrapped name's registry slot is owned by the
 * wrapper, so the write goes through `NameWrapper.setResolver`; otherwise
 * straight to the legacy registry.
 */
export const prepareDetachV1ResolverTransaction = ({
  name,
  wrapped,
  walletClient,
  chainId,
}: IntentContext & {
  readonly name: string
  readonly wrapped: boolean
}): CustomTransactionIntent => {
  const from = walletClient.account.address
  if (wrapped) {
    const params = setResolverWriteParameters(ensjsClient(walletClient), {
      name,
      contract: 'nameWrapper',
      resolverAddress: zeroAddress,
    })
    return toEoaCustomIntent({
      from,
      to: params.address,
      data: encode(params),
      chainId,
    })
  }
  return toEoaCustomIntent({
    from,
    to: LEGACY_REGISTRY,
    data: encodeFunctionData({
      abi: registrySetResolverSnippet,
      functionName: 'setResolver',
      args: [namehash(name), zeroAddress],
    }),
    chainId,
  })
}
