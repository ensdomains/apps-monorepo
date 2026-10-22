/**
 * Delete V1 Subname Helpers
 *
 * Pure rules and intents for deleting a V1 subname the way the legacy app does:
 * its owner is set to zero, by its parent's holder from the parent's side, or by
 * its own holder on its own node, in the registry or through the NameWrapper.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  registrySetRecordSnippet,
  registrySetSubnodeRecordSnippet,
} from '@ensdomains/ensjs-abi/registry'
import {
  nameWrapperSetRecordSnippet,
  nameWrapperSetSubnodeOwnerSnippet,
  nameWrapperSetSubnodeRecordSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { match, P } from 'ts-pattern'
import {
  type Address,
  concatHex,
  encodeFunctionData,
  type Hex,
  labelhash as hashLabel,
  isAddressEqual,
  keccak256,
  namehash,
  type WalletClient,
  zeroAddress,
} from 'viem'
import type { V1SubnameWrapping } from '@/features/profile/hooks/useSubnames'
import { toEoaIntent } from '@/features/transaction-manager/helpers/intents'
import type { V1ParentState } from '@/features/transfer/types'
import { canParentReissueV1Subname } from '@/features/transfer/v1/rules'
import { ensChain } from '@/lib/wagmi'

const LEGACY_REGISTRY = getChainContractAddress({
  chain: ensChain,
  contract: 'ensLegacyRegistry',
})
const NAME_WRAPPER = getChainContractAddress({
  chain: ensChain,
  contract: 'ensNameWrapper',
})

export type V1SubnameDeleteChild = {
  /** The label, when known: the NameWrapper takes the label, not its hash. */
  readonly labelName: string | null
  readonly wrapping: V1SubnameWrapping | null
  /** Nullish when the indexer did not count them. */
  readonly subnameCount: number | null | undefined
  /** Who holds the subname itself: its registry owner, or its NameWrapper owner. */
  readonly holder: Address | null
}

/**
 * The writes a delete takes. From the parent's side an unwrapped subname under
 * a wrapped parent is wrapped to the caller first: the NameWrapper can only
 * zero a name it holds. Its own holder zeroes it on its own node instead.
 */
export type V1SubnameDeleteTarget =
  | 'registry'
  | 'wrapper'
  | 'wrap-then-delete'
  | 'registry-as-holder'
  | 'wrapper-as-holder'

export type V1SubnameDeleteGate =
  | { readonly reason: 'ok'; readonly target: V1SubnameDeleteTarget }
  /** Its own subnames would keep resolving with no parent, so like the legacy app it is refused. */
  | { readonly reason: 'has-subnames' }
  | { readonly reason: 'unknown' }
  /** PARENT_CANNOT_CONTROL burned: only its owner can delete it. */
  | { readonly reason: 'emancipated' }
  /** A wrapped subname under an unwrapped parent; zeroing it in the registry would strand its wrapper token. */
  | { readonly reason: 'wrapper-mismatch' }
  | { readonly reason: 'unknown-label' }
  /** The wrap step re-issues the label, which CANNOT_CREATE_SUBDOMAIN forbids. */
  | { readonly reason: 'burned-fuse' }
  /** CANNOT_UNWRAP burned: the NameWrapper won't let its holder zero it. */
  | { readonly reason: 'locked' }

/** Whether the holder of `parent` can delete `child`, and with which writes. */
export const getV1SubnameDeleteGate = (
  parent: V1ParentState,
  { labelName, wrapping, subnameCount }: V1SubnameDeleteChild,
): V1SubnameDeleteGate =>
  match({ parent, wrapping, subnameCount, labelName })
    .with(
      { subnameCount: P.nullish },
      { wrapping: P.nullish },
      () => ({ reason: 'unknown' }) as const,
    )
    .with(
      { subnameCount: P.number.gt(0) },
      () => ({ reason: 'has-subnames' }) as const,
    )
    .with(
      { wrapping: { isWrapped: true, parentCannotControl: true } },
      () => ({ reason: 'emancipated' }) as const,
    )
    .with(
      { parent: { isWrapped: false }, wrapping: { isWrapped: true } },
      () => ({ reason: 'wrapper-mismatch' }) as const,
    )
    .with(
      { parent: { isWrapped: false } },
      () => ({ reason: 'ok', target: 'registry' }) as const,
    )
    .with({ labelName: null }, () => ({ reason: 'unknown-label' }) as const)
    .with(
      { wrapping: { isWrapped: true } },
      () => ({ reason: 'ok', target: 'wrapper' }) as const,
    )
    // Wrapping re-issues the label, which `_checkCanCallSetSubnodeOwner` refuses
    // once the parent burned CANNOT_CREATE_SUBDOMAIN.
    .when(
      () => !canParentReissueV1Subname(parent),
      () => ({ reason: 'burned-fuse' }) as const,
    )
    .otherwise(() => ({ reason: 'ok', target: 'wrap-then-delete' }) as const)

/** Whether the subname's own holder can zero it on its own node. */
const getV1SubnameHolderDeleteGate = ({
  wrapping,
  subnameCount,
}: V1SubnameDeleteChild): V1SubnameDeleteGate =>
  match({ wrapping, subnameCount })
    .with(
      { subnameCount: P.nullish },
      { wrapping: P.nullish },
      () => ({ reason: 'unknown' }) as const,
    )
    .with(
      { subnameCount: P.number.gt(0) },
      () => ({ reason: 'has-subnames' }) as const,
    )
    .with(
      { wrapping: { isWrapped: false } },
      () => ({ reason: 'ok', target: 'registry-as-holder' }) as const,
    )
    .with(
      { wrapping: { isLocked: true } },
      () => ({ reason: 'locked' }) as const,
    )
    .otherwise(() => ({ reason: 'ok', target: 'wrapper-as-holder' }) as const)

/**
 * How `account` can delete `child`: as the holder of its parent (`parent`,
 * null when `account` doesn't hold it), else as the subname's own holder.
 * Null when `account` is neither.
 */
export const getV1SubnameDeleteAccess = (
  parent: V1ParentState | null,
  child: V1SubnameDeleteChild,
  account: Address,
): V1SubnameDeleteGate | null => {
  const asParent = parent ? getV1SubnameDeleteGate(parent, child) : null
  if (asParent?.reason === 'ok') return asParent
  const isHolder =
    child.holder !== null && isAddressEqual(child.holder, account)
  return isHolder ? getV1SubnameHolderDeleteGate(child) : asParent
}

export interface V1SubnameDelete {
  /** The full subname, as the indexer served it. */
  readonly subname: string
  readonly labelhash: Hex
  readonly labelName: string | null
  readonly target: V1SubnameDeleteTarget
}

export interface PrepareDeleteV1SubnameParams {
  readonly target: V1SubnameDeleteTarget
  /** The parent name, as the route validated it. */
  readonly parentName: string
  /** The row's labelhash as the indexer holds it, never a re-hashed display label. */
  readonly labelhash: Hex
  readonly labelName: string | null
  readonly walletClient: WalletClient
  readonly chainId: number
}

/**
 * The delete intents, in order: one write, or the wrap then the delete. Throws
 * for a wrapper target whose label does not hash to the row's labelhash.
 */
export const prepareDeleteV1SubnameTransactions = ({
  target,
  parentName,
  labelhash,
  labelName,
  walletClient,
  chainId,
}: PrepareDeleteV1SubnameParams): readonly CustomTransactionIntent[] => {
  const parentNode = namehash(parentName)
  // The row's own node, from its labelhash: never a re-hashed display label (WEB-1458).
  const node = keccak256(concatHex([parentNode, labelhash]))
  const wrapperLabel = () => {
    if (labelName === null || hashLabel(labelName) !== labelhash) {
      throw new Error('The NameWrapper needs the subname’s own label')
    }
    return labelName
  }
  const zeroThroughWrapper = () =>
    toEoaIntent(walletClient, {
      to: NAME_WRAPPER,
      data: encodeFunctionData({
        abi: nameWrapperSetSubnodeRecordSnippet,
        functionName: 'setSubnodeRecord',
        args: [parentNode, wrapperLabel(), zeroAddress, zeroAddress, 0n, 0, 0n],
      }),
      chainId,
    })

  return match(target)
    .with('registry', () => [
      toEoaIntent(walletClient, {
        to: LEGACY_REGISTRY,
        data: encodeFunctionData({
          abi: registrySetSubnodeRecordSnippet,
          functionName: 'setSubnodeRecord',
          args: [parentNode, labelhash, zeroAddress, zeroAddress, 0n],
        }),
        chainId,
      }),
    ])
    .with('wrapper', () => [zeroThroughWrapper()])
    .with('wrap-then-delete', () => {
      const account = walletClient.account?.address
      if (!account) throw new Error('No account connected')
      return [
        toEoaIntent(walletClient, {
          to: NAME_WRAPPER,
          data: encodeFunctionData({
            abi: nameWrapperSetSubnodeOwnerSnippet,
            functionName: 'setSubnodeOwner',
            args: [parentNode, wrapperLabel(), account, 0, 0n],
          }),
          chainId,
        }),
        zeroThroughWrapper(),
      ]
    })
    .with('registry-as-holder', () => [
      toEoaIntent(walletClient, {
        to: LEGACY_REGISTRY,
        data: encodeFunctionData({
          abi: registrySetRecordSnippet,
          functionName: 'setRecord',
          args: [node, zeroAddress, zeroAddress, 0n],
        }),
        chainId,
      }),
    ])
    .with('wrapper-as-holder', () => [
      toEoaIntent(walletClient, {
        to: NAME_WRAPPER,
        data: encodeFunctionData({
          abi: nameWrapperSetRecordSnippet,
          functionName: 'setRecord',
          args: [node, zeroAddress, zeroAddress, 0n],
        }),
        chainId,
      }),
    ])
    .exhaustive()
}
