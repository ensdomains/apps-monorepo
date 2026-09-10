/**
 * Intent builders for the V1 contract writes a transfer can make. Each returns
 * the prepared call, so the modal's gas estimate and the submitted transaction
 * are built from the same bytes.
 *
 * Calls are encoded from `ensjs-abi` snippets against the `ensjs` chain
 * addresses rather than through ensjs's `transferNameWriteParameters`: that
 * builder returns a union over every call it can produce (which
 * `encodeFunctionData` can't take without a cast), and its `contract:
 * 'registry'` variant targets the ensjs `ensRegistry` key — the *V2 root
 * registry* on Sepolia. V1 registry writes must hit `ensLegacyRegistry`.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  registrySetOwnerSnippet,
  registrySetResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import {
  baseRegistrarReclaimSnippet,
  baseRegistrarSafeTransferFromSnippet,
} from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import {
  nameWrapperSafeTransferFromSnippet,
  nameWrapperSetResolverSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { match } from 'ts-pattern'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  namehash,
  zeroAddress,
} from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import type { IntentContext } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'

const LEGACY_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})
const BASE_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensBaseRegistrarImplementation',
})
const NAME_WRAPPER = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensNameWrapper',
})

/**
 * Move a V1 name: `BaseRegistrar.reclaim` (`registrar` + `shouldReclaim`),
 * `BaseRegistrar.safeTransferFrom` (`registrar`) or
 * `NameWrapper.safeTransferFrom` (`nameWrapper`). `name` must be normalised.
 */
export const prepareTransferV1NameTransaction = ({
  name,
  recipient,
  contract,
  shouldReclaim = false,
  walletClient,
  chainId,
}: IntentContext & {
  readonly name: string
  readonly recipient: Address
  readonly contract: 'registrar' | 'nameWrapper'
  readonly shouldReclaim?: boolean
}): CustomTransactionIntent => {
  const from = walletClient.account.address
  // The registrar's token id is the 2LD's labelhash; the wrapper's is the namehash.
  const registrarTokenId = BigInt(labelhash(name.split('.')[0]))

  const { to, data } = match({ contract, shouldReclaim })
    .with({ contract: 'registrar', shouldReclaim: true }, () => ({
      to: BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: baseRegistrarReclaimSnippet,
        functionName: 'reclaim',
        args: [registrarTokenId, recipient],
      }),
    }))
    .with({ contract: 'registrar' }, () => ({
      to: BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: baseRegistrarSafeTransferFromSnippet,
        functionName: 'safeTransferFrom',
        args: [from, recipient, registrarTokenId],
      }),
    }))
    .with({ contract: 'nameWrapper' }, () => ({
      to: NAME_WRAPPER,
      data: encodeFunctionData({
        abi: nameWrapperSafeTransferFromSnippet,
        functionName: 'safeTransferFrom',
        args: [from, recipient, BigInt(namehash(name)), 1n, '0x'],
      }),
    }))
    .exhaustive()

  return toEoaCustomIntent({ from, to, data, chainId })
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
 * straight to the legacy registry. Same signature on both contracts.
 */
export const prepareDetachV1ResolverTransaction = ({
  name,
  isWrapped,
  walletClient,
  chainId,
}: IntentContext & {
  readonly name: string
  readonly isWrapped: boolean
}): CustomTransactionIntent =>
  toEoaCustomIntent({
    from: walletClient.account.address,
    to: isWrapped ? NAME_WRAPPER : LEGACY_REGISTRY,
    data: encodeFunctionData({
      abi: isWrapped
        ? nameWrapperSetResolverSnippet
        : registrySetResolverSnippet,
      functionName: 'setResolver',
      args: [namehash(name), zeroAddress],
    }),
    chainId,
  })
