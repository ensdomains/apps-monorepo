import type { Call } from '@ens-apps/transaction-manager'
import { readContracts, type Config as WagmiConfig } from '@wagmi/core'
import {
  type Address,
  encodeFunctionData,
  erc721Abi,
  isAddress,
  isAddressEqual,
} from 'viem'
import { OPERATOR_APPROVAL_ABI } from '@/features/migration/contracts/abis'
import {
  V1_CONTRACTS,
  V2_CONTRACTS,
} from '@/features/migration/contracts/addresses'

export type MigrationApprovalNeeds = {
  readonly hasUnwrapped: boolean
  readonly unwrappedTokenIds: readonly bigint[]
  readonly hasWrapped: boolean
}

export type MigrationTokenApprovalStatus = {
  readonly tokenId: bigint
  readonly approved: boolean
}

export type MigrationApprovalStatus = {
  readonly baseRegistrarHcaApproved: boolean
  readonly unwrappedTokenApprovals: readonly MigrationTokenApprovalStatus[]
  readonly nameWrapperHcaApproved: boolean
  readonly ethRegistryHcaApproved: boolean
}

export type MigrationOperatorApprovalId =
  | 'base-registrar:hca'
  | 'name-wrapper:hca'

export type MigrationCleanupApprovalId = 'eth-registry:hca'

export type MigrationGrantApprovalId =
  | MigrationOperatorApprovalId
  | 'base-registrar:hca-token'

export type MigrationOperatorApproval = {
  readonly kind: 'operator'
  readonly id: MigrationOperatorApprovalId
  readonly contractAddress: Address
  readonly operatorAddress: Address
}

export type MigrationTokenApproval = {
  readonly kind: 'erc721-token'
  readonly id: 'base-registrar:hca-token'
  readonly contractAddress: Address
  readonly operatorAddress: Address
  readonly tokenId: bigint
}

/**
 * A missing permission required by an HCA-batched helper migration.
 *
 * NFT approvals target MigrationHelper. Direct ETHRegistry access for the HCA
 * is cleanup-only and is intentionally excluded from this grant type.
 */
export type MigrationApproval =
  | MigrationOperatorApproval
  | MigrationTokenApproval

export type MigrationCleanupApproval = {
  readonly kind: 'operator'
  readonly id: 'eth-registry:hca'
  readonly contractAddress: Address
  readonly operatorAddress: Address
}

/** Build a required migration permission from the trusted deployment data. */
export const migrationApprovalForId = (params: {
  readonly id: MigrationGrantApprovalId
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
  }
}

/** Build the historical direct-HCA permission that must only be revoked. */
export const migrationCleanupApprovalForHca = (
  hcaAddress: Address,
): MigrationCleanupApproval => ({
  kind: 'operator',
  id: 'eth-registry:hca',
  contractAddress: V2_CONTRACTS.ETHRegistry,
  operatorAddress: hcaAddress,
})

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

export const migrationApprovalKey = (
  approval: MigrationApproval | MigrationCleanupApproval,
): string =>
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

  // Manager restoration is disabled, but older interrupted migrations may
  // have left this broad HCA permission behind. Always read it as cleanup
  // debt; it must never be treated as a grant required by the current plan.
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
}): readonly MigrationApproval[] => {
  const { hcaAddress, needs, status } = params
  const approvals: MigrationApproval[] = []
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
  const needsBaseRegistrarApproval =
    tokenIds.length === 0 || missingTokenIds.length > 0

  if (
    needs.hasUnwrapped &&
    !status.baseRegistrarHcaApproved &&
    needsBaseRegistrarApproval
  ) {
    if (missingTokenIds.length === 1) {
      approvals.push(
        ...missingTokenIds.map((tokenId) =>
          migrationApprovalForId({
            id: 'base-registrar:hca-token',
            hcaAddress,
            tokenId,
          }),
        ),
      )
    } else {
      approvals.push(
        migrationApprovalForId({ id: 'base-registrar:hca', hcaAddress }),
      )
    }
  }
  if (needs.hasWrapped && !status.nameWrapperHcaApproved) {
    approvals.push(
      migrationApprovalForId({ id: 'name-wrapper:hca', hcaAddress }),
    )
  }
  return approvals
}

export const planMigrationApprovalCleanup = (params: {
  readonly hcaAddress: Address
  readonly status: MigrationApprovalStatus
}): readonly MigrationCleanupApproval[] =>
  params.status.ethRegistryHcaApproved
    ? [migrationCleanupApprovalForHca(params.hcaAddress)]
    : []

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

/** Revoke historical direct-HCA migration permission. */
export const buildMigrationOperatorApprovalRevocationCall = (
  approval: MigrationCleanupApproval,
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
