/**
 * Create Subname Helpers
 *
 * Pure functions for preparing createSubname transactions.
 */

import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { createSubnameWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import { registrySetSubnodeRecordSnippet } from '@ensdomains/ensjs-abi/registry'
import { nameWrapperSetSubnodeRecordSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { match, P } from 'ts-pattern'
import {
  type Address,
  encodeFunctionData,
  isAddressEqual,
  labelhash,
  namehash,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { toEoaIntent } from '@/features/transaction-manager/helpers/intents'
import type {
  V1ParentState,
  V1TransferSubject,
} from '@/features/transfer/types'
import type { V1NameState } from '@/features/transfer/v1/getV1NameState'
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
/**
 * The legacy app's default for a new V1 subname: the V1 PublicResolver, which
 * lets whoever holds the node set its records.
 */
const V1_SUBNAME_RESOLVER = getChainContractAddress({
  chain: ensChain,
  contract: 'ensPublicResolver',
})

/**
 * Default role bitmap granted to the subname owner on creation.
 *
 * Each role occupies one nibble in the EnhancedAccessControl bitmap, so a value
 * of all `1`s grants every role to the owner. This ensures freshly created
 * subnames have all roles enabled by default, rather than being created with no
 * roles attached (an empty `0n` bitmap).
 *
 * ensjs uses the same `0x1111…` value internally for `deploySubregistry` and
 * `deployVerifiableProxy`, but keeps it as a module-private const (it is not
 * exported from `@ensdomains/ensjs`), so we redeclare the literal here.
 */
export const DEFAULT_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

/** Where a new subname goes: the parent's V2 subregistry, or V1. */
export type CreateSubnameTarget =
  | { readonly protocol: 'ENSv2'; readonly registryAddress: Address }
  | { readonly protocol: 'ENSv1'; readonly isWrapped: boolean }

/** A target ready to write. V2 also needs the parent's resolver, read at submit. */
export type CreateSubnameWrite =
  | (Extract<CreateSubnameTarget, { protocol: 'ENSv2' }> & {
      readonly resolverAddress: Address
    })
  | Extract<CreateSubnameTarget, { protocol: 'ENSv1' }>

export interface PrepareCreateSubnameParams {
  readonly write: CreateSubnameWrite
  /** The parent name, normalised */
  readonly parentName: string
  /** The label of the subname to create */
  readonly label: string
  /** The owner address of the new subname */
  readonly owner: Address
  readonly walletClient: WalletClient
  readonly chainId: number
  /** V2 only: expiration timestamp in seconds */
  readonly expires?: bigint
}

/**
 * The createSubname intent, shared by the gas estimate and {@link createSubname}.
 *
 * V2: `createSubnameWriteParameters` defaults a missing `expires` to
 * `Date.now() + 1 year` at encode time, so a caller that wants the estimate to
 * stay byte-identical to the submitted call MUST pass a concrete, frozen
 * `expires` and reuse that same value in the actual `createSubname` call.
 *
 * V1: the `setSubnodeRecord` the legacy app sends, with no fuses and no expiry.
 */
export const prepareCreateSubnameTransaction = ({
  write,
  parentName,
  label,
  owner,
  walletClient,
  chainId,
  expires,
}: PrepareCreateSubnameParams): CustomTransactionIntent =>
  match(write)
    .with({ protocol: 'ENSv2' }, ({ registryAddress, resolverAddress }) => {
      const writeParams = createSubnameWriteParameters(
        walletClient as Parameters<typeof createSubnameWriteParameters>[0],
        {
          registryAddress,
          label,
          owner,
          subregistryAddress: zeroAddress,
          resolverAddress,
          roleBitmap: DEFAULT_ROLE_BITMAP,
          expires,
        },
      )
      return toEoaIntent(walletClient, {
        to: writeParams.address,
        data: encodeFunctionData({
          abi: writeParams.abi,
          functionName: writeParams.functionName,
          args: writeParams.args,
        } as Parameters<typeof encodeFunctionData>[0]),
        chainId,
      })
    })
    .with({ protocol: 'ENSv1', isWrapped: true }, () =>
      toEoaIntent(walletClient, {
        to: NAME_WRAPPER,
        data: encodeFunctionData({
          abi: nameWrapperSetSubnodeRecordSnippet,
          functionName: 'setSubnodeRecord',
          args: [
            namehash(parentName),
            label,
            owner,
            V1_SUBNAME_RESOLVER,
            0n,
            0,
            0n,
          ],
        }),
        chainId,
      }),
    )
    .with({ protocol: 'ENSv1', isWrapped: false }, () =>
      toEoaIntent(walletClient, {
        to: LEGACY_REGISTRY,
        data: encodeFunctionData({
          abi: registrySetSubnodeRecordSnippet,
          functionName: 'setSubnodeRecord',
          args: [
            namehash(parentName),
            labelhash(label),
            owner,
            V1_SUBNAME_RESOLVER,
            0n,
          ],
        }),
        chainId,
      }),
    )
    .exhaustive()

/** Why a subname can or can't be created under a V1 name. */
export type V1SubnameCreateGate =
  | {
      readonly reason: 'ok'
      readonly target: Extract<CreateSubnameTarget, { protocol: 'ENSv1' }>
    }
  /** `.eth` 2LD in grace: the wrapper refuses edits and the registrar has lapsed it. */
  | { readonly reason: 'grace' }
  /** Lapsed past grace, or an emancipated wrapped name the wrapper has cleared. */
  | { readonly reason: 'unowned' }
  /** A wrapped parent that burned CANNOT_CREATE_SUBDOMAIN. */
  | { readonly reason: 'burned-fuse' }
  | { readonly reason: 'not-holder' }

/** The name's own registry slot, as the parent of the subname it creates. */
const toV1ParentState = (subject: V1TransferSubject): V1ParentState =>
  match(subject)
    .with({ kind: 'v1-wrapped' }, ({ owner, fuses }) => ({
      owner,
      registrant: null,
      isWrapped: true,
      cannotCreateSubdomain: fuses.cannotCreateSubdomain,
    }))
    // `setSubnodeRecord` needs the registry owner, not the 721 registrant.
    .with({ kind: 'v1-registrar' }, ({ registrant, controller }) => ({
      owner: controller,
      registrant,
      isWrapped: false,
      cannotCreateSubdomain: false,
    }))
    .with({ kind: 'v1-registry' }, ({ owner }) => ({
      owner,
      registrant: null,
      isWrapped: false,
      cannotCreateSubdomain: false,
    }))
    .exhaustive()

/**
 * Whether `account` can create a subname under a V1 name. With no account the
 * holder check is left to the form, which asks for a wallet first.
 */
export const getV1SubnameCreateGate = (
  { subject, registration }: V1NameState,
  account: Address | undefined,
): V1SubnameCreateGate =>
  match({ subject, registration })
    .with({ registration: 'gracePeriod' }, () => ({ reason: 'grace' }) as const)
    .with(
      { registration: 'expired' },
      { subject: null },
      () => ({ reason: 'unowned' }) as const,
    )
    .with({ subject: P.nonNullable }, ({ subject }) => {
      const parent = toV1ParentState(subject)
      if (!canParentReissueV1Subname(parent)) {
        return { reason: 'burned-fuse' } as const
      }
      if (account && !(parent.owner && isAddressEqual(parent.owner, account))) {
        return { reason: 'not-holder' } as const
      }
      return {
        reason: 'ok',
        target: { protocol: 'ENSv1', isWrapped: parent.isWrapped },
      } as const
    })
    .exhaustive()
