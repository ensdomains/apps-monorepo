import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ok } from 'neverthrow'
import {
  type Address,
  createClient,
  custom,
  encodeAbiParameters,
  type Hex,
  parseAbiParameters,
  RpcRequestError,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sepoliaWithEns } from '@/lib/wagmi'

const IMPLEMENTATION = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensPermissionedResolverImpl',
})
const FACTORY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensVerifiableFactory',
})

const PROXY = '0x907ccb4f76ea54976c8a857ee7fbab2624058f56' as Address
const OTHER_IMPLEMENTATION =
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead' as Address
const EMPTY_SLOT =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex

const asWord = (address: Address): Hex =>
  encodeAbiParameters(parseAbiParameters('address'), [address])

/** What the resolver claims in its own EIP-1967 slot. */
let slotResponse: () => Hex = () => EMPTY_SLOT
/** The factory reverts for a proxy it did not deploy. */
const factoryRefusal = () => {
  throw new RpcRequestError({
    body: {},
    // ProxyNotFromFactory(address)
    error: {
      code: 3,
      message: 'execution reverted',
      data: `0x4c87e2b6${'0'.repeat(64)}`,
    },
    url: 'http://localhost',
  })
}

/** What the factory answers for `verifyContract`, or a revert. */
let verifyResponse: () => Hex = factoryRefusal
let calls: string[] = []

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok(
      createClient({
        // The predicate reads its contracts off the client's chain now, so the
        // test has to supply one rather than leaning on a module-level pin.
        chain: sepoliaWithEns,
        transport: custom({
          request: async ({ method, params }) => {
            calls.push(method)
            if (method === 'eth_getStorageAt') return slotResponse()
            if (method === 'eth_call') {
              const [request] = params as [{ to: Address }]
              expect(request.to?.toLowerCase()).toBe(FACTORY.toLowerCase())
              return verifyResponse()
            }
            throw new Error(`unexpected ${method}`)
          },
        }),
      }),
    ),
}))

const { getIsPermissionedResolver } = await import(
  './useIsPermissionedResolver'
)

const isPermissioned = async (resolverAddress: Address) => {
  const result = await getIsPermissionedResolver({ resolverAddress })
  expect(result.isOk()).toBe(true)
  return result._unsafeUnwrap()
}

describe('getIsPermissionedResolver', () => {
  beforeEach(() => {
    slotResponse = () => EMPTY_SLOT
    verifyResponse = factoryRefusal
    calls = []
  })

  it('accepts the official implementation itself without any lookup', async () => {
    expect(await isPermissioned(IMPLEMENTATION)).toBe(true)
    expect(calls).toEqual([])
  })

  it('rejects a contract with nothing in the implementation slot', async () => {
    expect(await isPermissioned(PROXY)).toBe(false)
    expect(calls).toEqual(['eth_getStorageAt'])
  })

  it('rejects a proxy pointing at an implementation we do not know', async () => {
    slotResponse = () => asWord(OTHER_IMPLEMENTATION)

    expect(await isPermissioned(PROXY)).toBe(false)
    expect(calls).toEqual(['eth_getStorageAt'])
  })

  it('accepts a proxy the factory vouches for on the official implementation', async () => {
    slotResponse = () => asWord(IMPLEMENTATION)
    verifyResponse = () => asWord(IMPLEMENTATION)

    expect(await isPermissioned(PROXY)).toBe(true)
  })

  // #91689: the slot is storage the contract writes itself, so a non-proxy can
  // put the official implementation there. The factory is what settles it.
  it('rejects a contract that wrote the official implementation into its own slot', async () => {
    slotResponse = () => asWord(IMPLEMENTATION)

    expect(await isPermissioned(PROXY)).toBe(false)
  })

  // #92908: ROLE_UPGRADE is delegable, so a proxy the factory really deployed
  // can be pointed at attacker code afterwards.
  it('rejects a factory-deployed proxy that has since been upgraded away', async () => {
    slotResponse = () => asWord(IMPLEMENTATION)
    verifyResponse = () => asWord(OTHER_IMPLEMENTATION)

    expect(await isPermissioned(PROXY)).toBe(false)
  })

  it('surfaces a failed slot read instead of answering', async () => {
    slotResponse = () => {
      throw new Error('network down')
    }

    const result = await getIsPermissionedResolver({ resolverAddress: PROXY })
    expect(result.isErr()).toBe(true)
  })
})
