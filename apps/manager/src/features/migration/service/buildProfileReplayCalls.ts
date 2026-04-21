import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { type Address, encodeFunctionData, type Hex, zeroAddress } from 'viem'
import { PERMISSIONED_RESOLVER_ABI } from '../contracts/abis'
import type { Profile } from './fetchV1Profiles'

export const MAX_RECORDS_PER_REPLAY_USEROP = 50

export const buildProfileReplayCall = (params: {
  resolver: Address
  profiles: Map<Hex, Profile>
}): ZeroDevCall | null => {
  const { resolver, profiles } = params
  if (resolver === zeroAddress) {
    throw new Error(
      'buildProfileReplayCall: resolver must not be the zero address',
    )
  }
  const innerCalls: Hex[] = []

  for (const [nodeHex, profile] of profiles) {
    for (const t of profile.texts) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setText',
          args: [nodeHex, t.key, t.value],
        }),
      )
    }
    for (const a of profile.addresses) {
      innerCalls.push(
        encodeFunctionData({
          abi: PERMISSIONED_RESOLVER_ABI,
          functionName: 'setAddr',
          args: [nodeHex, a.coinType, a.value],
        }),
      )
    }
  }

  if (innerCalls.length === 0) return null

  return {
    to: resolver,
    data: encodeFunctionData({
      abi: PERMISSIONED_RESOLVER_ABI,
      functionName: 'multicall',
      args: [innerCalls],
    }),
    value: 0n,
  }
}

type FlatRecord =
  | { node: Hex; kind: 'text'; key: string; value: string }
  | { node: Hex; kind: 'addr'; coinType: bigint; value: Hex }

const flattenProfiles = (profiles: Map<Hex, Profile>): FlatRecord[] => {
  const out: FlatRecord[] = []
  for (const [node, profile] of profiles) {
    for (const t of profile.texts) {
      out.push({ node, kind: 'text', key: t.key, value: t.value })
    }
    for (const a of profile.addresses) {
      out.push({ node, kind: 'addr', coinType: a.coinType, value: a.value })
    }
  }
  return out
}

const encodeInnerCall = (record: FlatRecord): Hex =>
  record.kind === 'text'
    ? encodeFunctionData({
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'setText',
        args: [record.node, record.key, record.value],
      })
    : encodeFunctionData({
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'setAddr',
        args: [record.node, record.coinType, record.value],
      })

export const buildChunkedProfileReplayCalls = (params: {
  resolver: Address
  profiles: Map<Hex, Profile>
  maxRecordsPerOp?: number
}): ZeroDevCall[] => {
  const {
    resolver,
    profiles,
    maxRecordsPerOp = MAX_RECORDS_PER_REPLAY_USEROP,
  } = params
  if (resolver === zeroAddress) {
    throw new Error(
      'buildChunkedProfileReplayCalls: resolver must not be the zero address',
    )
  }

  const records = flattenProfiles(profiles)
  if (records.length === 0) return []

  const calls: ZeroDevCall[] = []
  for (let i = 0; i < records.length; i += maxRecordsPerOp) {
    const innerCalls = records
      .slice(i, i + maxRecordsPerOp)
      .map(encodeInnerCall)
    calls.push({
      to: resolver,
      data: encodeFunctionData({
        abi: PERMISSIONED_RESOLVER_ABI,
        functionName: 'multicall',
        args: [innerCalls],
      }),
      value: 0n,
    })
  }
  return calls
}

export const buildPerNameReplayCalls = (params: {
  resolver: Address
  profiles: Map<Hex, Profile>
}): ZeroDevCall[] => {
  const { resolver, profiles } = params
  if (resolver === zeroAddress) {
    throw new Error(
      'buildPerNameReplayCalls: resolver must not be the zero address',
    )
  }

  const calls: ZeroDevCall[] = []
  for (const [node, profile] of profiles) {
    const singleMap = new Map<Hex, Profile>([[node, profile]])
    const call = buildProfileReplayCall({ resolver, profiles: singleMap })
    if (call) calls.push(call)
  }
  return calls
}
