import type { Call } from '@ens-apps/transaction-manager'
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  labelhash,
} from 'viem'

import {
  BASE_REGISTRAR_DIRECT_MIGRATION_ABI,
  MIGRATION_DATA_ABI_PARAMETERS,
  MIGRATION_DATA_ARRAY_ABI_PARAMETERS,
  NAME_WRAPPER_DIRECT_MIGRATION_ABI,
} from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { createMigrationData, type MigrationData } from './encodeMigration'

export type DirectMigrationDataInput = {
  /** Full ENS name used to map grouped calls back to retryable name units. */
  readonly name: string
  readonly label: string
  readonly subregistry: Address
  readonly resolver: Address
}

export type DirectWrappedMigrationInput = DirectMigrationDataInput & {
  readonly tokenId: bigint
  /** Receiver whose implementation and parent relationship were verified by preflight. */
  readonly receiver: Address
}

export type BuildDirectMigrationCallsParams = {
  /** V1 token holder and forced destination owner in every Migration.Data payload. */
  readonly wallet: Address
  readonly unwrapped: readonly DirectMigrationDataInput[]
  /** Must already be topologically ordered parent-before-child. */
  readonly wrapped: readonly DirectWrappedMigrationInput[]
}

export type DirectMigrationCallExecution = {
  readonly names: readonly string[]
  readonly call: Call
}

type WrappedMigrationGroup = {
  readonly receiver: Address
  readonly entries: readonly [
    DirectWrappedMigrationInput,
    ...DirectWrappedMigrationInput[],
  ]
}

const toMigrationData = (
  input: DirectMigrationDataInput,
  wallet: Address,
): MigrationData =>
  createMigrationData({
    label: input.label,
    owner: wallet,
    subregistry: input.subregistry,
    resolver: input.resolver,
  })

const groupWrappedNamesByReceiver = (
  names: readonly DirectWrappedMigrationInput[],
): readonly WrappedMigrationGroup[] => {
  // Local mutation is intentionally contained here so grouping stays O(n)
  // while the caller's inputs and the returned readonly surface stay immutable.
  const groups = new Map<
    string,
    {
      readonly receiver: Address
      readonly entries: [
        DirectWrappedMigrationInput,
        ...DirectWrappedMigrationInput[],
      ]
    }
  >()
  for (const name of names) {
    const key = name.receiver.toLowerCase()
    const existing = groups.get(key)
    if (existing) {
      existing.entries.push(name)
      continue
    }
    groups.set(key, { receiver: name.receiver, entries: [name] })
  }
  return [...groups.values()]
}

const buildUnwrappedCall = (
  input: DirectMigrationDataInput,
  wallet: Address,
): Call => ({
  to: V1_CONTRACTS.BaseRegistrar,
  value: 0n,
  data: encodeFunctionData({
    abi: BASE_REGISTRAR_DIRECT_MIGRATION_ABI,
    functionName: 'safeTransferFrom',
    args: [
      wallet,
      V2_CONTRACTS.UnlockedMigrationController,
      BigInt(labelhash(input.label)),
      encodeAbiParameters(MIGRATION_DATA_ABI_PARAMETERS, [
        toMigrationData(input, wallet),
      ]),
    ],
  }),
})

const buildWrappedGroupCall = (
  group: WrappedMigrationGroup,
  wallet: Address,
): Call => {
  if (group.entries.length === 1) {
    const [name] = group.entries
    return {
      to: V1_CONTRACTS.NameWrapper,
      value: 0n,
      data: encodeFunctionData({
        abi: NAME_WRAPPER_DIRECT_MIGRATION_ABI,
        functionName: 'safeTransferFrom',
        args: [
          wallet,
          group.receiver,
          name.tokenId,
          1n,
          encodeAbiParameters(MIGRATION_DATA_ABI_PARAMETERS, [
            toMigrationData(name, wallet),
          ]),
        ],
      }),
    }
  }

  return {
    to: V1_CONTRACTS.NameWrapper,
    value: 0n,
    data: encodeFunctionData({
      abi: NAME_WRAPPER_DIRECT_MIGRATION_ABI,
      functionName: 'safeBatchTransferFrom',
      args: [
        wallet,
        group.receiver,
        group.entries.map(({ tokenId }) => tokenId),
        group.entries.map(() => 1n),
        encodeAbiParameters(MIGRATION_DATA_ARRAY_ABI_PARAMETERS, [
          group.entries.map((name) => toMigrationData(name, wallet)),
        ]),
      ],
    }),
  }
}

/**
 * Build direct BaseRegistrar/NameWrapper transfer calls for HCA execution.
 *
 * This function only encodes calls. Its caller must verify wrapped receivers
 * and preserve parent-before-child ordering before placing these calls in an
 * atomic HCA batch.
 */
export function buildDirectMigrationCalls(
  params: BuildDirectMigrationCallsParams,
): readonly DirectMigrationCallExecution[] {
  const unwrappedCalls = params.unwrapped.map((input) => ({
    names: [input.name],
    call: buildUnwrappedCall(input, params.wallet),
  }))
  const wrappedCalls = groupWrappedNamesByReceiver(params.wrapped).map(
    (group) => ({
      names: group.entries.map(({ name }) => name),
      call: buildWrappedGroupCall(group, params.wallet),
    }),
  )

  return [...unwrappedCalls, ...wrappedCalls]
}
