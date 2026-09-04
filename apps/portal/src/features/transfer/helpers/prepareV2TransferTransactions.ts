/**
 * Intent builders for the V2 writes a transfer can make. Each returns the
 * prepared call, so the modal's gas estimate and the submitted transaction are
 * built from the same bytes.
 *
 * The detaches are registry writes, gated on the owner holding
 * `ROLE_SET_RESOLVER` / `ROLE_SET_SUBREGISTRY`. A normally-registered owner
 * auto-holds them, but a migrated/locked name can own the token yet lack them
 * (a migrated locked 2LD never receives `ROLE_SET_SUBREGISTRY`). Callers confirm
 * the role first (see `useTransferDetachTargets`) — these run before the
 * irreversible move, so a revert here leaves the name degraded. Neither touches
 * the resolver/subregistry contract itself, which may be shared by the sender's
 * other names; they only clear the registry's pointer.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  setResolverWriteParameters,
  setSubregistryWriteParameters,
} from '@ensdomains/ensjs/wallet/v2'
import { type Address, encodeFunctionData, erc1155Abi, zeroAddress } from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import type { IntentContext } from '@/features/transaction-manager/types'

type V2Write = IntentContext & {
  readonly label: string
  /** The registry the name's token lives in (its parent's subregistry). */
  readonly registryAddress: Address
}

/** `registry.setResolver(label, 0x0)`. */
export const prepareDetachNameResolverTransaction = ({
  label,
  registryAddress,
  walletClient,
  chainId,
}: V2Write): CustomTransactionIntent => {
  const params = setResolverWriteParameters(walletClient, {
    label,
    registryAddress,
    resolverAddress: zeroAddress,
  })
  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: params.address,
    data: encodeFunctionData(params),
    chainId,
  })
}

/** `parent.setSubregistry(label, 0x0)`. */
export const prepareDetachNameRegistryTransaction = ({
  label,
  registryAddress,
  walletClient,
  chainId,
}: V2Write): CustomTransactionIntent => {
  const params = setSubregistryWriteParameters(walletClient, {
    registryAddress,
    label,
    subregistryAddress: zeroAddress,
  })
  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: params.address,
    data: encodeFunctionData(params),
    chainId,
  })
}

/**
 * Move the name: a V2 name is an ERC-1155 token in its parent registry, so
 * ownership moves with the standard `safeTransferFrom` — there is no dedicated
 * transfer entrypoint. `tokenId` is the *versioned* id from `getTokenId(label)`.
 */
export const prepareTransferTokenTransaction = ({
  registryAddress,
  tokenId,
  recipient,
  walletClient,
  chainId,
}: IntentContext & {
  readonly registryAddress: Address
  readonly tokenId: bigint
  readonly recipient: Address
}): CustomTransactionIntent =>
  toEoaCustomIntent({
    from: walletClient.account.address,
    to: registryAddress,
    data: encodeFunctionData({
      abi: erc1155Abi,
      functionName: 'safeTransferFrom',
      args: [walletClient.account.address, recipient, tokenId, 1n, '0x'],
    }),
    chainId,
  })
