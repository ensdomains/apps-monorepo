import { createSetForwardResolutionRequest } from '@ens-apps/l2-primary/utils'
import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { normalize } from 'viem/ens'
import { prepareSetForwardResolutionTransaction } from '@/features/reverse-resolution/helpers/setForwardResolution'
import type { IntentContext } from '@/features/transaction-manager/types'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'
import { getLabel } from '@/utils/token/getLabel'
import {
  prepareDetachNameRegistryTransaction,
  prepareDetachNameResolverTransaction,
  prepareTransferTokenTransaction,
} from '../helpers/prepareV2TransferTransactions'
import type { TransferSubject } from '../types'
import {
  prepareDetachV1ResolverTransaction,
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
    walletClient,
    chainId,
  }: TransferStepContext,
): CustomTransactionIntent => {
  // Route-supplied, so normalise once here: every hash below must see the same
  // canonical form the reads used, or the write targets a different node.
  const name = normalize(rawName)
  const ctx = { name, recipient, walletClient, chainId }
  return match([step, subject] as const)
    .with(['set-eth-addr', P._], () => {
      // The form only offers this step when the name has its own resolver, so
      // a null here means the state changed underneath us.
      if (!resolverAddress)
        throw new Error(`${name} has no resolver of its own to update`)
      return prepareSetForwardResolutionTransaction({
        request: createSetForwardResolutionRequest({
          name,
          coinType: MAINNET_COIN_TYPE,
          resolverAddress,
          targetAddress: recipient,
        }),
        from: walletClient.account.address,
        chainId,
      })
    })
    .with(['detach-resolver', { kind: 'v2' }], ([, { registryAddress }]) =>
      prepareDetachNameResolverTransaction({
        ...ctx,
        label: getLabel(name),
        registryAddress,
      }),
    )
    .with(['detach-resolver', P._], ([, { kind }]) =>
      prepareDetachV1ResolverTransaction({
        ...ctx,
        isWrapped: kind === 'v1-wrapped',
      }),
    )
    .with(['detach-registry', { kind: 'v2' }], ([, { registryAddress }]) =>
      prepareDetachNameRegistryTransaction({
        ...ctx,
        label: getLabel(name),
        registryAddress,
      }),
    )
    .with(['transfer-token', { kind: 'v2' }], ([, { registryAddress }]) => {
      if (tokenId === null) throw new Error(`${name} has no token id`)
      return prepareTransferTokenTransaction({
        ...ctx,
        registryAddress,
        tokenId,
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
    .otherwise(() => {
      throw new Error(`Step "${step}" does not apply to a ${subject.kind} name`)
    })
}
