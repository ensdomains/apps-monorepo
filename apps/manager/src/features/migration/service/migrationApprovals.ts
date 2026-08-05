import type { Call } from '@ens-apps/transaction-manager'
import { readContracts, type Config as WagmiConfig } from '@wagmi/core'
import { type Address, encodeFunctionData, isAddressEqual } from 'viem'
import { OPERATOR_APPROVAL_ABI } from '@/features/migration/contracts/abis'
import {
  V1_CONTRACTS,
  V2_CONTRACTS,
} from '@/features/migration/contracts/addresses'

export type MigrationApprovalNeeds = {
  readonly hasUnwrapped: boolean
  readonly hasWrapped: boolean
  readonly requiresManagerRestoration: boolean
}

export type MigrationApprovalStatus = {
  readonly baseRegistrarHelperApproved: boolean
  readonly baseRegistrarHcaApproved: boolean
  readonly nameWrapperHelperApproved: boolean
  readonly nameWrapperHcaApproved: boolean
  readonly ethRegistryHcaApproved: boolean
}

export type MigrationApprovalId =
  | 'base-registrar:migration-helper'
  | 'base-registrar:hca'
  | 'name-wrapper:migration-helper'
  | 'name-wrapper:hca'
  | 'eth-registry:hca'

/**
 * A missing operator grant required by an HCA migration.
 *
 * The plan contains only approvals that were absent at preflight. Execution
 * records an item before wallet submission so an uncertain broadcast/receipt
 * can be recovered after reload. Cleanup re-reads live approval state before
 * revoking, and therefore never touches approvals that predated the migration.
 */
export type MigrationApproval = {
  readonly id: MigrationApprovalId
  readonly contractAddress: Address
  readonly operatorAddress: Address
}

/** Rebuild a persisted approval id from the current, trusted deployment data. */
export const migrationApprovalForId = (params: {
  readonly id: MigrationApprovalId
  readonly hcaAddress: Address
  readonly helperAddress?: Address
}): MigrationApproval => {
  const helperAddress = params.helperAddress ?? V2_CONTRACTS.MigrationHelper
  switch (params.id) {
    case 'base-registrar:migration-helper':
      return {
        id: params.id,
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: helperAddress,
      }
    case 'base-registrar:hca':
      return {
        id: params.id,
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: params.hcaAddress,
      }
    case 'name-wrapper:migration-helper':
      return {
        id: params.id,
        contractAddress: V1_CONTRACTS.NameWrapper,
        operatorAddress: helperAddress,
      }
    case 'name-wrapper:hca':
      return {
        id: params.id,
        contractAddress: V1_CONTRACTS.NameWrapper,
        operatorAddress: params.hcaAddress,
      }
    case 'eth-registry:hca':
      return {
        id: params.id,
        contractAddress: V2_CONTRACTS.ETHRegistry,
        operatorAddress: params.hcaAddress,
      }
  }
}

type ApprovalStatusKey = keyof MigrationApprovalStatus
type ApprovalRead = {
  readonly key: ApprovalStatusKey
  readonly contractAddress: Address
  readonly operatorAddress: Address
}
type ApprovalContract = Parameters<typeof readContracts>[1]['contracts'][number]

const APPROVED_WHEN_NOT_NEEDED: MigrationApprovalStatus = {
  baseRegistrarHelperApproved: true,
  baseRegistrarHcaApproved: true,
  nameWrapperHelperApproved: true,
  nameWrapperHcaApproved: true,
  ethRegistryHcaApproved: true,
}

const approvalKey = (approval: MigrationApproval): string =>
  `${approval.contractAddress.toLowerCase()}:${approval.operatorAddress.toLowerCase()}`

const appendApproval = (
  approvals: MigrationApproval[],
  approval: MigrationApproval,
): void => {
  if (
    approvals.some(
      (candidate) =>
        isAddressEqual(candidate.contractAddress, approval.contractAddress) &&
        isAddressEqual(candidate.operatorAddress, approval.operatorAddress),
    )
  ) {
    return
  }
  approvals.push(approval)
}

export const checkMigrationApprovals = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly helperAddress?: Address
  readonly needs: MigrationApprovalNeeds
  readonly wagmiConfig: WagmiConfig
}): Promise<MigrationApprovalStatus> => {
  const {
    eoa,
    hcaAddress,
    helperAddress = V2_CONTRACTS.MigrationHelper,
    needs,
    wagmiConfig,
  } = params
  const reads: ApprovalRead[] = []

  if (needs.hasUnwrapped) {
    reads.push(
      {
        key: 'baseRegistrarHelperApproved',
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: helperAddress,
      },
      {
        key: 'baseRegistrarHcaApproved',
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: hcaAddress,
      },
    )
  }

  if (needs.hasWrapped) {
    reads.push(
      {
        key: 'nameWrapperHelperApproved',
        contractAddress: V1_CONTRACTS.NameWrapper,
        operatorAddress: helperAddress,
      },
      {
        key: 'nameWrapperHcaApproved',
        contractAddress: V1_CONTRACTS.NameWrapper,
        operatorAddress: hcaAddress,
      },
    )
  }

  if (needs.requiresManagerRestoration) {
    reads.push({
      key: 'ethRegistryHcaApproved',
      contractAddress: V2_CONTRACTS.ETHRegistry,
      operatorAddress: hcaAddress,
    })
  }

  if (reads.length === 0) return APPROVED_WHEN_NOT_NEEDED

  const contracts: ApprovalContract[] = reads.map((read) => ({
    address: read.contractAddress,
    abi: OPERATOR_APPROVAL_ABI,
    functionName: 'isApprovedForAll',
    args: [eoa, read.operatorAddress],
  }))
  const approvals = (await readContracts(wagmiConfig, {
    contracts,
    allowFailure: false,
    batchSize: 0,
  })) as readonly boolean[]

  const status = { ...APPROVED_WHEN_NOT_NEEDED }
  for (const [index, approved] of approvals.entries()) {
    const read = reads[index]
    if (read) status[read.key] = approved
  }
  return status
}

export const planMigrationApprovals = (params: {
  readonly hcaAddress: Address
  readonly helperAddress?: Address
  readonly needs: MigrationApprovalNeeds
  readonly status: MigrationApprovalStatus
}): readonly MigrationApproval[] => {
  const {
    hcaAddress,
    helperAddress = V2_CONTRACTS.MigrationHelper,
    needs,
    status,
  } = params
  const approvals: MigrationApproval[] = []

  if (needs.hasUnwrapped && !status.baseRegistrarHelperApproved) {
    appendApproval(
      approvals,
      migrationApprovalForId({
        id: 'base-registrar:migration-helper',
        hcaAddress,
        helperAddress,
      }),
    )
  }
  if (needs.hasUnwrapped && !status.baseRegistrarHcaApproved) {
    appendApproval(
      approvals,
      migrationApprovalForId({ id: 'base-registrar:hca', hcaAddress }),
    )
  }
  if (needs.hasWrapped && !status.nameWrapperHelperApproved) {
    appendApproval(
      approvals,
      migrationApprovalForId({
        id: 'name-wrapper:migration-helper',
        hcaAddress,
        helperAddress,
      }),
    )
  }
  if (needs.hasWrapped && !status.nameWrapperHcaApproved) {
    appendApproval(
      approvals,
      migrationApprovalForId({ id: 'name-wrapper:hca', hcaAddress }),
    )
  }
  if (needs.requiresManagerRestoration && !status.ethRegistryHcaApproved) {
    appendApproval(
      approvals,
      migrationApprovalForId({ id: 'eth-registry:hca', hcaAddress }),
    )
  }

  return approvals
}

export const buildMigrationApprovalCall = (
  approval: MigrationApproval,
  approved: boolean,
): Call => ({
  to: approval.contractAddress,
  data: encodeFunctionData({
    abi: OPERATOR_APPROVAL_ABI,
    functionName: 'setApprovalForAll',
    args: [approval.operatorAddress, approved],
  }),
  value: 0n,
})

export const buildMigrationApprovalCalls = (
  approvals: readonly MigrationApproval[],
): readonly Call[] =>
  approvals.map((approval) => buildMigrationApprovalCall(approval, true))

/** Add a potentially submitted grant to the cleanup ledger, without duplicates. */
export const trackCreatedMigrationApproval = (
  created: readonly MigrationApproval[],
  confirmedApproval: MigrationApproval,
): readonly MigrationApproval[] => {
  const key = approvalKey(confirmedApproval)
  return created.some((approval) => approvalKey(approval) === key)
    ? created
    : [...created, confirmedApproval]
}

/**
 * Revoke tracked grants in reverse creation order. Passing the original plan
 * is intentionally not supported: callers must maintain the durable ledger.
 */
export const buildMigrationCleanupCalls = (
  createdApprovals: readonly MigrationApproval[],
): readonly Call[] =>
  [...createdApprovals]
    .reverse()
    .map((approval) => buildMigrationApprovalCall(approval, false))
