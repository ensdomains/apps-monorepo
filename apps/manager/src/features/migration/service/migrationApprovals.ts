import type { Call } from '@ens-apps/transaction-manager'
import { readContracts, type Config as WagmiConfig } from '@wagmi/core'
import { match } from 'ts-pattern'
import {
  type Address,
  encodeFunctionData,
  erc721Abi,
  type Hex,
  isAddress,
  isAddressEqual,
  type PublicClient,
} from 'viem'
import { OPERATOR_APPROVAL_ABI } from '@/features/migration/contracts/abis'
import {
  V1_CONTRACTS,
  V2_CONTRACTS,
} from '@/features/migration/contracts/addresses'
import type { TemporaryRegistrationApproval } from './migrationBatchJournal'

export type MigrationApprovalNeeds = {
  readonly hasUnwrapped: boolean
  readonly unwrappedTokenIds: readonly bigint[]
  readonly hasWrapped: boolean
  readonly requiresManagerRestoration: boolean
  readonly requiresRegistryConfiguration?: boolean
}

type MigrationTokenApprovalStatus = {
  readonly tokenId: bigint
  readonly approved: boolean
}

export type MigrationApprovalStatus = {
  readonly baseRegistrarHcaApproved: boolean
  readonly unwrappedTokenApprovals: readonly MigrationTokenApprovalStatus[]
  readonly nameWrapperHcaApproved: boolean
  readonly ethRegistryHcaApproved: boolean
}

export type MigrationRegistrationApprovalStrategy =
  | 'per-token'
  | 'temporary-operator'

export type MigrationOperatorApprovalId =
  | 'base-registrar:hca'
  | 'name-wrapper:hca'
  | 'eth-registry:hca'

export type MigrationApprovalId =
  | MigrationOperatorApprovalId
  | 'base-registrar:hca-token'

export type MigrationOperatorApproval = {
  readonly kind: 'operator'
  readonly id: MigrationOperatorApprovalId
  readonly contractAddress: Address
  readonly operatorAddress: Address
}

type MigrationTokenApproval = {
  readonly kind: 'erc721-token'
  readonly id: 'base-registrar:hca-token'
  readonly contractAddress: Address
  readonly operatorAddress: Address
  readonly tokenId: bigint
}

/**
 * A missing permission required by an HCA-batched helper migration.
 *
 * The historical approval IDs remain stable for persisted UI step keys. NFT
 * approvals target MigrationHelper; registry configuration targets the HCA.
 */
export type MigrationApproval =
  | MigrationOperatorApproval
  | MigrationTokenApproval

export type MigrationCleanupApproval = MigrationOperatorApproval & {
  readonly id: 'eth-registry:hca'
}

export const temporaryMigrationHcaApproval = (
  hcaAddress: Address,
): MigrationCleanupApproval => ({
  kind: 'operator',
  id: 'eth-registry:hca',
  contractAddress: V2_CONTRACTS.ETHRegistry,
  operatorAddress: hcaAddress,
})

export const migrationOperatorApprovals = (
  hcaAddress: Address,
): readonly MigrationOperatorApproval[] => [
  {
    kind: 'operator',
    id: 'base-registrar:hca',
    contractAddress: V1_CONTRACTS.BaseRegistrar,
    operatorAddress: V2_CONTRACTS.MigrationHelper,
  },
  {
    kind: 'operator',
    id: 'name-wrapper:hca',
    contractAddress: V1_CONTRACTS.NameWrapper,
    operatorAddress: V2_CONTRACTS.MigrationHelper,
  },
  temporaryMigrationHcaApproval(hcaAddress),
]

export const readActiveMigrationOperatorApprovals = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly wagmiConfig: WagmiConfig
}): Promise<readonly MigrationOperatorApproval[]> => {
  const approvals = migrationOperatorApprovals(params.hcaAddress)
  const results = await readContracts(params.wagmiConfig, {
    contracts: approvals.map((approval) => ({
      address: approval.contractAddress,
      abi: OPERATOR_APPROVAL_ABI,
      functionName: 'isApprovedForAll',
      args: [params.eoa, approval.operatorAddress],
    })),
    allowFailure: false,
    batchSize: 0,
  })
  return approvals.filter((_, index) => results[index] === true)
}

export const hasTemporaryMigrationHcaApproval = async (params: {
  readonly publicClient: PublicClient
  readonly eoa: Address
  readonly hcaAddress: Address
}): Promise<boolean> =>
  (await params.publicClient.readContract({
    address: V2_CONTRACTS.ETHRegistry,
    abi: OPERATOR_APPROVAL_ABI,
    functionName: 'isApprovedForAll',
    args: [params.eoa, params.hcaAddress],
  })) === true

export const requiresMigrationApprovalCleanup = (
  approval: MigrationApproval,
): approval is MigrationCleanupApproval =>
  approval.kind === 'operator' && approval.id === 'eth-registry:hca'

/** Build a required migration permission from the trusted deployment data. */
export const migrationApprovalForId = (params: {
  readonly id: MigrationApprovalId
  readonly hcaAddress: Address
  readonly tokenId?: bigint
}): MigrationApproval => {
  switch (params.id) {
    case 'base-registrar:hca':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: V2_CONTRACTS.MigrationHelper,
      }
    case 'base-registrar:hca-token': {
      if (params.tokenId === undefined) {
        throw new Error('An ERC-721 migration approval requires a token id')
      }
      return {
        kind: 'erc721-token',
        id: params.id,
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: V2_CONTRACTS.MigrationHelper,
        tokenId: params.tokenId,
      }
    }
    case 'name-wrapper:hca':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V1_CONTRACTS.NameWrapper,
        operatorAddress: V2_CONTRACTS.MigrationHelper,
      }
    case 'eth-registry:hca':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V2_CONTRACTS.ETHRegistry,
        operatorAddress: params.hcaAddress,
      }
  }
}

type OperatorStatusKey = Exclude<
  keyof MigrationApprovalStatus,
  'unwrappedTokenApprovals'
>
type ApprovalRead =
  | {
      readonly kind: 'operator'
      readonly key: OperatorStatusKey
      readonly contractAddress: Address
      readonly operatorAddress: Address
    }
  | {
      readonly kind: 'erc721-token'
      readonly tokenId: bigint
    }
type ApprovalContract = Parameters<typeof readContracts>[1]['contracts'][number]

export const migrationApprovalKey = (approval: MigrationApproval): string =>
  approval.kind === 'erc721-token'
    ? `${approval.id}:${approval.tokenId}`
    : `${approval.contractAddress.toLowerCase()}:${approval.operatorAddress.toLowerCase()}`

const uniqueTokenIds = (tokenIds: readonly bigint[]): readonly bigint[] => [
  ...new Set(tokenIds),
]

export const checkMigrationApprovals = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly needs: MigrationApprovalNeeds
  readonly wagmiConfig: WagmiConfig
}): Promise<MigrationApprovalStatus> => {
  const { eoa, hcaAddress, needs, wagmiConfig } = params
  const migrationHelper = V2_CONTRACTS.MigrationHelper
  const tokenIds = uniqueTokenIds(needs.unwrappedTokenIds)
  const reads: ApprovalRead[] = []

  if (needs.hasUnwrapped) {
    reads.push({
      kind: 'operator',
      key: 'baseRegistrarHcaApproved',
      contractAddress: V1_CONTRACTS.BaseRegistrar,
      operatorAddress: migrationHelper,
    })
    reads.push(
      ...tokenIds.map(
        (tokenId): ApprovalRead => ({ kind: 'erc721-token', tokenId }),
      ),
    )
  }

  if (needs.hasWrapped) {
    reads.push({
      kind: 'operator',
      key: 'nameWrapperHcaApproved',
      contractAddress: V1_CONTRACTS.NameWrapper,
      operatorAddress: migrationHelper,
    })
  }

  // A grant from an interrupted earlier attempt must be visible even when the
  // current selection does not need manager restoration.
  reads.push({
    kind: 'operator',
    key: 'ethRegistryHcaApproved',
    contractAddress: V2_CONTRACTS.ETHRegistry,
    operatorAddress: hcaAddress,
  })

  const initialStatus: MigrationApprovalStatus = {
    baseRegistrarHcaApproved: !needs.hasUnwrapped,
    unwrappedTokenApprovals: tokenIds.map((tokenId) => ({
      tokenId,
      approved: !needs.hasUnwrapped,
    })),
    nameWrapperHcaApproved: !needs.hasWrapped,
    ethRegistryHcaApproved: false,
  }
  if (reads.length === 0) return initialStatus

  const contracts: ApprovalContract[] = reads.map((read) =>
    read.kind === 'operator'
      ? {
          address: read.contractAddress,
          abi: OPERATOR_APPROVAL_ABI,
          functionName: 'isApprovedForAll',
          args: [eoa, read.operatorAddress],
        }
      : {
          address: V1_CONTRACTS.BaseRegistrar,
          abi: erc721Abi,
          functionName: 'getApproved',
          args: [read.tokenId],
        },
  )
  const results = (await readContracts(wagmiConfig, {
    contracts,
    allowFailure: false,
    batchSize: 0,
  })) as readonly unknown[]

  let baseRegistrarHcaApproved = initialStatus.baseRegistrarHcaApproved
  let nameWrapperHcaApproved = initialStatus.nameWrapperHcaApproved
  let ethRegistryHcaApproved = initialStatus.ethRegistryHcaApproved
  const tokenApprovals = new Map(
    initialStatus.unwrappedTokenApprovals.map(({ tokenId, approved }) => [
      tokenId,
      approved,
    ]),
  )

  for (const [index, result] of results.entries()) {
    const read = reads[index]
    if (!read) continue
    if (read.kind === 'erc721-token') {
      tokenApprovals.set(
        read.tokenId,
        typeof result === 'string' &&
          isAddress(result) &&
          isAddressEqual(result, migrationHelper),
      )
      continue
    }
    const approved = result === true
    switch (read.key) {
      case 'baseRegistrarHcaApproved':
        baseRegistrarHcaApproved = approved
        break
      case 'nameWrapperHcaApproved':
        nameWrapperHcaApproved = approved
        break
      case 'ethRegistryHcaApproved':
        ethRegistryHcaApproved = approved
        break
    }
  }

  return {
    baseRegistrarHcaApproved,
    unwrappedTokenApprovals: tokenIds.map((tokenId) => ({
      tokenId,
      approved: tokenApprovals.get(tokenId) ?? false,
    })),
    nameWrapperHcaApproved,
    ethRegistryHcaApproved,
  }
}

export const planMigrationApprovals = (params: {
  readonly hcaAddress: Address
  readonly needs: MigrationApprovalNeeds
  readonly status: MigrationApprovalStatus
  /** Preserve the permission surface already reviewed for an interrupted run. */
  readonly registrationApprovalStrategy?: MigrationRegistrationApprovalStrategy
}): readonly MigrationApproval[] => {
  const { hcaAddress, needs, status } = params
  const tokenStatus = new Map(
    status.unwrappedTokenApprovals.map(({ tokenId, approved }) => [
      tokenId,
      approved,
    ]),
  )
  const tokenIds = uniqueTokenIds(needs.unwrappedTokenIds)
  const missingTokenIds = tokenIds.filter(
    (tokenId) => !tokenStatus.get(tokenId),
  )
  const needsRegistrationApproval =
    needs.hasUnwrapped &&
    !status.baseRegistrarHcaApproved &&
    missingTokenIds.length > 0
  const usesTemporaryOperator =
    params.registrationApprovalStrategy === 'temporary-operator'
  const registrationApprovals = usesTemporaryOperator
    ? [migrationApprovalForId({ id: 'base-registrar:hca', hcaAddress })]
    : missingTokenIds.map((tokenId) =>
        migrationApprovalForId({
          id: 'base-registrar:hca-token',
          hcaAddress,
          tokenId,
        }),
      )
  return [
    ...(needsRegistrationApproval ? registrationApprovals : []),
    ...(needs.hasWrapped && !status.nameWrapperHcaApproved
      ? [migrationApprovalForId({ id: 'name-wrapper:hca', hcaAddress })]
      : []),
    ...((needs.requiresManagerRestoration ||
      needs.requiresRegistryConfiguration) &&
    !status.ethRegistryHcaApproved
      ? [migrationApprovalForId({ id: 'eth-registry:hca', hcaAddress })]
      : []),
  ]
}

export const prepareMigrationApprovals = (params: {
  readonly approvals: readonly MigrationApproval[]
  readonly hcaAddress: Address
  readonly canBatchAtomically: boolean
}): readonly MigrationApproval[] => {
  if (
    params.canBatchAtomically ||
    !params.approvals.some(({ kind }) => kind === 'erc721-token')
  )
    return params.approvals
  return [
    migrationApprovalForId({
      id: 'base-registrar:hca',
      hcaAddress: params.hcaAddress,
    }),
    ...params.approvals.filter(({ kind }) => kind !== 'erc721-token'),
  ]
}

export const buildMigrationApprovalCall = (
  approval: MigrationApproval,
): Call => {
  if (approval.kind === 'erc721-token') {
    return {
      to: approval.contractAddress,
      data: encodeFunctionData({
        abi: erc721Abi,
        functionName: 'approve',
        args: [approval.operatorAddress, approval.tokenId],
      }),
      value: 0n,
    }
  }
  return {
    to: approval.contractAddress,
    data: encodeFunctionData({
      abi: OPERATOR_APPROVAL_ABI,
      functionName: 'setApprovalForAll',
      args: [approval.operatorAddress, true],
    }),
    value: 0n,
  }
}

/** Revoke an operator permission created temporarily for migration. */
export const buildMigrationOperatorApprovalRevocationCall = (
  approval: MigrationOperatorApproval,
): Call => {
  return {
    to: approval.contractAddress,
    data: encodeFunctionData({
      abi: OPERATOR_APPROVAL_ABI,
      functionName: 'setApprovalForAll',
      args: [approval.operatorAddress, false],
    }),
    value: 0n,
  }
}

export const isRegistrationApprovalRecoveryScopeValid = (params: {
  readonly approval: Pick<
    TemporaryRegistrationApproval,
    'contractAddress' | 'operatorAddress'
  >
  readonly currentApproval: MigrationApproval
  readonly names: readonly string[]
  readonly savedNames: readonly string[]
}): boolean =>
  isAddressEqual(
    params.approval.contractAddress,
    params.currentApproval.contractAddress,
  ) &&
  isAddressEqual(
    params.approval.operatorAddress,
    params.currentApproval.operatorAddress,
  ) &&
  params.names.length === params.savedNames.length &&
  params.names.every((name) => params.savedNames.includes(name))

export const isDefinitelyUnsubmittedMigrationApprovalError = (
  error: unknown,
): boolean => {
  let current = error
  for (
    let depth = 0;
    depth < 10 && typeof current === 'object' && current !== null;
    depth += 1
  ) {
    if (
      ('_tag' in current &&
        (current._tag === 'ChainIdMismatchError' ||
          current._tag === 'SignerAddressMismatchError')) ||
      ('name' in current && current.name === 'ChainMismatchError')
    )
      return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}

export const registrationApprovalRecoveryDecision = (params: {
  readonly status: TemporaryRegistrationApproval['state']['status']
  readonly isActive: boolean
  readonly receiptStatus?: 'success' | 'reverted'
}): 'granted' | 'complete' | 'unresolved' =>
  match(params.status)
    .with('granted', () =>
      params.isActive ? ('granted' as const) : ('complete' as const),
    )
    .with('grant-pending', () => {
      if (params.receiptStatus === undefined) return 'unresolved' as const
      return params.receiptStatus === 'success' && params.isActive
        ? ('granted' as const)
        : ('complete' as const)
    })
    .with('revoke-pending', () => {
      if (!params.isActive) return 'complete' as const
      return params.receiptStatus === 'reverted'
        ? ('granted' as const)
        : ('unresolved' as const)
    })
    .exhaustive()

export const isExpectedMigrationApprovalRequest = (params: {
  readonly request: unknown
  readonly owner: Address
  readonly chainId: number
  readonly contractAddress: Address
  readonly data: Hex
}): boolean => {
  const { request } = params
  if (typeof request !== 'object' || request === null) return false
  const fields = request as Record<string, unknown>
  return (
    typeof fields.from === 'string' &&
    fields.from.toLowerCase() === params.owner.toLowerCase() &&
    typeof fields.to === 'string' &&
    fields.to.toLowerCase() === params.contractAddress.toLowerCase() &&
    fields.chainId === params.chainId &&
    typeof fields.data === 'string' &&
    fields.data.toLowerCase() === params.data.toLowerCase() &&
    fields.value === 0n
  )
}
