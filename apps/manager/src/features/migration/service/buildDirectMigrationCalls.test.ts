import {
  decodeAbiParameters,
  decodeFunctionData,
  labelhash,
  zeroAddress,
} from 'viem'
import { describe, expect, it } from 'vitest'

import {
  BASE_REGISTRAR_DIRECT_MIGRATION_ABI,
  MIGRATION_DATA_ABI_PARAMETERS,
  MIGRATION_DATA_ARRAY_ABI_PARAMETERS,
  NAME_WRAPPER_DIRECT_MIGRATION_ABI,
} from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  buildDirectMigrationCalls,
  type DirectMigrationCallExecution,
} from './buildDirectMigrationCalls'

const WALLET = '0x1111111111111111111111111111111111111111' as const
const RECEIVER_A = '0x2222222222222222222222222222222222222222' as const
const RECEIVER_B = '0x3333333333333333333333333333333333333333' as const
const SUBREGISTRY = '0x4444444444444444444444444444444444444444' as const
const RESOLVER = '0x5555555555555555555555555555555555555555' as const

const executionAt = (
  executions: readonly DirectMigrationCallExecution[],
  index: number,
): DirectMigrationCallExecution => {
  const execution = executions[index]
  if (!execution) throw new Error(`Missing migration execution at ${index}`)
  return execution
}

describe('buildDirectMigrationCalls', () => {
  it('encodes unwrapped BaseRegistrar transfers to UnlockedMigrationController', () => {
    const execution = executionAt(
      buildDirectMigrationCalls({
        wallet: WALLET,
        unwrapped: [
          {
            name: 'alice.eth',
            label: 'alice',
            subregistry: SUBREGISTRY,
            resolver: RESOLVER,
          },
        ],
        wrapped: [],
      }),
      0,
    )
    const { call } = execution

    expect(execution.names).toEqual(['alice.eth'])
    expect(call.to).toBe(V1_CONTRACTS.BaseRegistrar)
    expect(call.value).toBe(0n)
    const decoded = decodeFunctionData({
      abi: BASE_REGISTRAR_DIRECT_MIGRATION_ABI,
      data: call.data,
    })
    expect(decoded.functionName).toBe('safeTransferFrom')
    expect(decoded.args.slice(0, 3)).toEqual([
      WALLET,
      V2_CONTRACTS.UnlockedMigrationController,
      BigInt(labelhash('alice')),
    ])
    expect(
      decodeAbiParameters(MIGRATION_DATA_ABI_PARAMETERS, decoded.args[3])[0],
    ).toEqual({
      label: 'alice',
      owner: WALLET,
      subregistry: SUBREGISTRY,
      resolver: RESOLVER,
    })
  })

  it('encodes one wrapped name as a single ERC1155 transfer', () => {
    const execution = executionAt(
      buildDirectMigrationCalls({
        wallet: WALLET,
        unwrapped: [],
        wrapped: [
          {
            name: 'wrapped.eth',
            tokenId: 1n,
            receiver: RECEIVER_A,
            label: 'wrapped',
            subregistry: zeroAddress,
            resolver: RESOLVER,
          },
        ],
      }),
      0,
    )
    const { call } = execution

    expect(execution.names).toEqual(['wrapped.eth'])
    expect(call.to).toBe(V1_CONTRACTS.NameWrapper)
    expect(call.value).toBe(0n)
    const decoded = decodeFunctionData({
      abi: NAME_WRAPPER_DIRECT_MIGRATION_ABI,
      data: call.data,
    })
    expect(decoded.functionName).toBe('safeTransferFrom')
    expect(decoded.args.slice(0, 4)).toEqual([WALLET, RECEIVER_A, 1n, 1n])
    expect(
      decodeAbiParameters(MIGRATION_DATA_ABI_PARAMETERS, decoded.args[4])[0],
    ).toEqual({
      label: 'wrapped',
      owner: WALLET,
      subregistry: zeroAddress,
      resolver: RESOLVER,
    })
  })

  it('coalesces wrapped names by receiver and preserves group order', () => {
    const calls = buildDirectMigrationCalls({
      wallet: WALLET,
      unwrapped: [],
      wrapped: [
        {
          name: 'first.parent.eth',
          tokenId: 1n,
          receiver: RECEIVER_A,
          label: 'first',
          subregistry: zeroAddress,
          resolver: RESOLVER,
        },
        {
          name: 'other.eth',
          tokenId: 2n,
          receiver: RECEIVER_B,
          label: 'other-receiver',
          subregistry: SUBREGISTRY,
          resolver: RESOLVER,
        },
        {
          name: 'second.parent.eth',
          tokenId: 3n,
          receiver: RECEIVER_A,
          label: 'second',
          subregistry: SUBREGISTRY,
          resolver: RESOLVER,
        },
      ],
    })

    expect(calls).toHaveLength(2)
    expect(calls.map(({ names }) => names)).toEqual([
      ['first.parent.eth', 'second.parent.eth'],
      ['other.eth'],
    ])
    const batchExecution = executionAt(calls, 0)
    const batch = decodeFunctionData({
      abi: NAME_WRAPPER_DIRECT_MIGRATION_ABI,
      data: batchExecution.call.data,
    })
    expect(batch.functionName).toBe('safeBatchTransferFrom')
    if (batch.functionName !== 'safeBatchTransferFrom') {
      throw new Error('Expected a wrapped batch transfer')
    }
    expect(batch.args.slice(0, 4)).toEqual([
      WALLET,
      RECEIVER_A,
      [1n, 3n],
      [1n, 1n],
    ])
    expect(
      decodeAbiParameters(
        MIGRATION_DATA_ARRAY_ABI_PARAMETERS,
        batch.args[4],
      )[0],
    ).toEqual([
      {
        label: 'first',
        owner: WALLET,
        subregistry: zeroAddress,
        resolver: RESOLVER,
      },
      {
        label: 'second',
        owner: WALLET,
        subregistry: SUBREGISTRY,
        resolver: RESOLVER,
      },
    ])

    const singleExecution = executionAt(calls, 1)
    const single = decodeFunctionData({
      abi: NAME_WRAPPER_DIRECT_MIGRATION_ABI,
      data: singleExecution.call.data,
    })
    expect(single.functionName).toBe('safeTransferFrom')
    expect(single.args[1]).toBe(RECEIVER_B)
  })

  it('returns no calls for an empty migration', () => {
    expect(
      buildDirectMigrationCalls({ wallet: WALLET, unwrapped: [], wrapped: [] }),
    ).toEqual([])
  })
})
