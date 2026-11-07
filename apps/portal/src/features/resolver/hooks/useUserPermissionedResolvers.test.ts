import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok } from 'neverthrow'
import {
  type Address,
  createClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hex,
  numberToHex,
  pad,
  parseAbiParameters,
  RpcRequestError,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { ensChain } from '@/lib/wagmi'

const IMPLEMENTATION = getChainContractAddress({
  chain: ensChain,
  contract: 'ensPermissionedResolverImpl',
})

const WALLET: Address = '0x173e184a4cabe64778f7662d756d042ea6767fd6'
// Deployed through the wallet's smart account, as the Manager does.
const RESOLVER: Address = '0x5892c563b693980f1f597496acd5ff5a2b1c4276'
// Emits a role event naming the wallet but is no factory proxy.
const IMPOSTOR: Address = '0x3333333333333333333333333333333333333333'
// A registry also emits root role events; its slot holds no implementation.
const REGISTRY: Address = '0x4444444444444444444444444444444444444444'
// What both the Explorer's and the Manager's deploys grant the wallet.
const ALL_ROLES = BigInt(`0x${'1'.repeat(64)}`)

const asWord = (address: Address): Hex =>
  encodeAbiParameters(parseAbiParameters('address'), [address])

const roleLog = (address: Address, index: number) => ({
  address,
  topics: encodeEventTopics({
    abi: eacRolesChangedEventSnippet,
    eventName: 'EACRolesChanged',
    args: { resource: 0n, account: WALLET },
  }),
  data: encodeAbiParameters(parseAbiParameters('uint256, uint256'), [
    0n,
    ALL_ROLES,
  ]),
  blockNumber: numberToHex(ROLES_FROM_BLOCK + BigInt(index)),
  blockHash: pad('0x01'),
  transactionHash: pad('0x02'),
  transactionIndex: '0x0',
  logIndex: numberToHex(index),
  removed: false,
})

let getLogsFilters: unknown[] = []
let logsResponse: () => unknown[] = () => []

const factoryRefusal = () => {
  throw new RpcRequestError({
    body: {},
    // VerificationFailed(address)
    error: {
      code: 3,
      message: 'execution reverted',
      data: `0x4c87e2b6${'0'.repeat(64)}`,
    },
    url: 'http://localhost',
  })
}

const node: Record<string, (params: readonly unknown[]) => unknown> = {
  eth_getLogs: ([filter]) => {
    getLogsFilters.push(filter)
    return logsResponse()
  },
  // Every candidate but the registry names the official implementation.
  eth_getStorageAt: ([address]) =>
    address === REGISTRY ? pad('0x00') : asWord(IMPLEMENTATION),
  // The factory vouches for the resolver only.
  eth_call: ([request]) =>
    (request as { data: Hex }).data.includes(RESOLVER.slice(2))
      ? asWord(IMPLEMENTATION)
      : factoryRefusal(),
}

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok(
      createClient({
        chain: ensChain,
        transport: custom({
          request: async ({ method, params }) => {
            const answer = node[method]
            if (!answer) throw new Error(`unexpected ${method}`)
            return answer(params as readonly unknown[])
          },
        }),
      }),
    ),
}))

const { getUserPermissionedResolvers } = await import(
  './useUserPermissionedResolvers'
)

describe('getUserPermissionedResolvers', () => {
  beforeEach(() => {
    getLogsFilters = []
    logsResponse = () => []
  })

  it('lists the verified resolvers granting the wallet its roles', async () => {
    logsResponse = () => [
      roleLog(RESOLVER, 0),
      roleLog(IMPOSTOR, 1),
      roleLog(REGISTRY, 2),
    ]

    const result = await getUserPermissionedResolvers({ account: WALLET })

    expect(result._unsafeUnwrap()).toEqual([getAddress(RESOLVER)])
    expect(getLogsFilters).toEqual([
      {
        topics: encodeEventTopics({
          abi: eacRolesChangedEventSnippet,
          eventName: 'EACRolesChanged',
          args: { resource: 0n, account: WALLET },
        }),
        fromBlock: numberToHex(ROLES_FROM_BLOCK),
        toBlock: undefined,
      },
    ])
  })

  // An empty list reads as "no resolvers", so a failed scan must not become one.
  it('fails rather than listing nothing when the log read fails', async () => {
    logsResponse = () => {
      throw new Error('ranges over 10000 blocks are not supported')
    }

    const result = await getUserPermissionedResolvers({ account: WALLET })

    expect(result.isErr()).toBe(true)
  })
})
