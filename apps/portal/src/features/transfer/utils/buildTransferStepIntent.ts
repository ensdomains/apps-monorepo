import { createSetForwardResolutionRequest } from '@ens-apps/l2-primary/utils'
import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { match, P } from 'ts-pattern'
import { type Address, encodeFunctionData, erc1155Abi, zeroAddress } from 'viem'
import { normalize } from 'viem/ens'
import { prepareSetSubregistryTransaction } from '@/features/registry/helpers/setSubregistry'
import { prepareChangeResolverTransaction } from '@/features/resolver/helpers/changeResolver'
import { prepareSetForwardResolutionTransaction } from '@/features/reverse-resolution/helpers/setForwardResolution'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import type { IntentContext } from '@/features/transaction-manager/types'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'
import { requireResourceIdForName } from '@/lib/resource/resourceId'
import type { TransferSubject } from '../types'
import {
  prepareDetachV1ResolverTransaction,
  prepareReassignV1SubnameTransaction,
  prepareSetV1RegistryOwnerTransaction,
  prepareTransferV1NameTransaction,
} from '../v1/writes'
import type { TransferStepKind } from './buildTransferPlan'

export type TransferStepContext = IntentContext & {
  readonly name: string
  readonly subject: TransferSubject
  readonly recipient: Address
  /** V2 only — the versioned ERC-1155 id, read before the flow starts. */
  readonly tokenId: bigint | null
  /**
   * The resolver on the name's *own* registry slot, read before the flow
   * starts. Not the one it may inherit from an ancestor: writing this name's
   * record onto a parent's resolver targets a contract the sender doesn't
   * control.
   */
  readonly resolverAddress: Address | null
  /**
   * Whether `resolverAddress` is a V2 `PermissionedResolver`, whose setters take
   * the DNS-encoded name rather than the node. Null when it was never read: the
   * name has no resolver, or the plan never writes to it.
   */
  readonly isPermissionedResolver: boolean | null
}

/**
 * The one place a plan step turns into calldata. Both the modal's gas estimate
 * (`intent.prepare`) and the submit path call this, so the two can't drift.
 * Throws for a step the plan should never have produced for this subject.
 */
export const buildTransferStepIntent = (
  step: TransferStepKind,
  {
    name: rawName,
    subject,
    recipient,
    tokenId,
    resolverAddress,
    isPermissionedResolver,
    walletClient,
    chainId,
  }: TransferStepContext,
): CustomTransactionIntent => {
  // Route-supplied, so normalise once here: every hash below must see the same
  // canonical form the reads used, or the write targets a different node.
  const name = normalize(rawName)
  const ctx = { name, recipient, walletClient, chainId }
  return (
    match([step, subject] as const)
      .with(['set-eth-addr', P._], () => {
        // The form only offers this step when the name has its own resolver, so
        // a null here means the state changed underneath us.
        if (!resolverAddress)
          throw new Error(`${name} has no resolver of its own to update`)
        // Never default the kind: the wrong setter shape hits the other
        // resolver's fallback and reverts with empty data.
        if (isPermissionedResolver === null)
          throw new Error(`Could not tell what kind of resolver ${name} uses`)
        return prepareSetForwardResolutionTransaction({
          request: createSetForwardResolutionRequest({
            name,
            coinType: MAINNET_COIN_TYPE,
            resolverAddress,
            targetAddress: recipient,
            permissioned: isPermissionedResolver,
          }),
          from: walletClient.account.address,
          chainId,
        })
      })
      // Same builders the resolver and registry features submit, so the detach
      // steps carry their calldata (and, for setSubregistry, its gas cap).
      .with(['detach-resolver', { kind: 'v2' }], ([, { registryAddress }]) =>
        prepareChangeResolverTransaction({
          name,
          resourceId: requireResourceIdForName(name),
          registryAddress,
          resolverAddress: zeroAddress,
          from: walletClient.account.address,
          chainId,
        }),
      )
      .with(['detach-resolver', P._], ([, { kind }]) =>
        prepareDetachV1ResolverTransaction({
          ...ctx,
          isWrapped: kind === 'v1-wrapped',
        }),
      )
      .with(['detach-registry', { kind: 'v2' }], ([, { registryAddress }]) =>
        prepareSetSubregistryTransaction({
          resourceId: requireResourceIdForName(name),
          parentRegistry: registryAddress,
          subregistryAddress: zeroAddress,
          walletClient,
          chainId,
        }),
      )
      // A V2 name is an ERC-1155 token in its parent registry, so it moves with
      // the standard `safeTransferFrom` — there is no dedicated entrypoint.
      // `tokenId` is the *versioned* id from `getTokenId(label)`.
      .with(['transfer-token', { kind: 'v2' }], ([, { registryAddress }]) => {
        if (tokenId === null) throw new Error(`${name} has no token id`)
        const from = walletClient.account.address
        return toEoaCustomIntent({
          from,
          to: registryAddress,
          data: encodeFunctionData({
            abi: erc1155Abi,
            functionName: 'safeTransferFrom',
            args: [from, recipient, tokenId, 1n, '0x'],
          }),
          chainId,
        })
      })
      .with(['reclaim', { kind: 'v1-registrar' }], () =>
        prepareTransferV1NameTransaction({
          ...ctx,
          contract: 'registrar',
          shouldReclaim: true,
        }),
      )
      .with(['transfer-erc721', { kind: 'v1-registrar' }], () =>
        prepareTransferV1NameTransaction({ ...ctx, contract: 'registrar' }),
      )
      .with(['transfer-erc1155', { kind: 'v1-wrapped' }], () =>
        prepareTransferV1NameTransaction({ ...ctx, contract: 'nameWrapper' }),
      )
      .with(['set-registry-owner', { kind: 'v1-registry' }], () =>
        prepareSetV1RegistryOwnerTransaction(ctx),
      )
      // Which contract depends on how the *subname* is held.
      .with(
        ['set-subnode-owner', { kind: P.union('v1-wrapped', 'v1-registry') }],
        ([, { kind }]) =>
          prepareReassignV1SubnameTransaction({
            ...ctx,
            isWrapped: kind === 'v1-wrapped',
          }),
      )
      .otherwise(() => {
        throw new Error(
          `Step "${step}" does not apply to a ${subject.kind} name`,
        )
      })
  )
}
