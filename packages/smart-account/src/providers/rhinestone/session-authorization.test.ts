import { getSessionDetails } from '@rhinestone/sdk/smart-sessions'
import {
  concat,
  type Hex,
  hashTypedData,
  numberToHex,
  parseSignature,
  serializeSignature,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet, sepolia } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSessionAuthorizationDigest,
  isOwnerSessionAuthorization,
} from './session-authorization'

const HCA = '0xaaaa000000000000000000000000000000000001' as const
const OWNER = privateKeyToAccount(`0x${'02'.repeat(32)}`)
const NON_OWNER = privateKeyToAccount(`0x${'03'.repeat(32)}`)
const SESSION_KEY = privateKeyToAccount(`0x${'04'.repeat(32)}`)
const HASHES_AND_CHAIN_IDS = [
  { chainId: BigInt(sepolia.id), sessionDigest: `0x${'5'.repeat(64)}` },
] as const
const DIGEST = getSessionAuthorizationDigest(HASHES_AND_CHAIN_IDS)
const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

const withV = (signature: Hex, v: number): Hex =>
  concat([signature.slice(0, 130) as Hex, numberToHex(v, { size: 1 })])

const asUserSignature = (signature: Hex): Hex =>
  concat([zeroAddress, signature])

describe('getSessionAuthorizationDigest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The SDK reads the emissary nonce over RPC; answer it with zero.
  const stubRpc = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { readonly body: string }) => {
        const { id } = JSON.parse(init.body) as { readonly id: number }
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id, result: `0x${'0'.repeat(64)}` }),
        )
      }),
    )

  it.each([
    ['one chain', [sepolia]],
    ['two chains', [mainnet, sepolia]],
  ] as const)(
    'is the digest of the typed data the wallet signs (%s)',
    async (_, chains) => {
      stubRpc()
      const details = await getSessionDetails(
        HCA,
        chains.map((chain) => ({
          chain,
          account: HCA,
          salt: `0x${'77'.repeat(32)}`,
          owners: { type: 'ecdsa', accounts: [SESSION_KEY] },
        })),
        undefined,
      )

      expect(getSessionAuthorizationDigest(details.hashesAndChainIds)).toBe(
        hashTypedData(details.data),
      )
    },
  )
})

const ownerSignature = () => OWNER.sign({ hash: DIGEST })
const ownerMessageSignature = () =>
  OWNER.signMessage({ message: { raw: DIGEST } })

const highS = async (): Promise<Hex> => {
  const { r, s, yParity } = parseSignature(await ownerSignature())
  return serializeSignature({
    r,
    s: numberToHex(SECP256K1_N - BigInt(s), { size: 32 }),
    yParity: yParity === 0 ? 1 : 0,
  })
}

describe('isOwnerSessionAuthorization', () => {
  it.each([
    [
      'the owner signed the digest',
      async () => asUserSignature(await ownerSignature()),
      true,
    ],
    [
      'the owner signed it with a 0/1 recovery id',
      async () => {
        const signature = await ownerSignature()
        return asUserSignature(
          withV(signature, parseSignature(signature).yParity ?? 0),
        )
      },
      true,
    ],
    [
      'the owner signed it as a message, marked v 31/32',
      async () => {
        const signature = await ownerMessageSignature()
        return asUserSignature(
          withV(signature, Number(parseSignature(signature).v) + 4),
        )
      },
      true,
    ],
    [
      'another key signed the digest',
      async () => asUserSignature(await NON_OWNER.sign({ hash: DIGEST })),
      false,
    ],
    [
      'the owner signed it as a message, unmarked',
      async () => asUserSignature(await ownerMessageSignature()),
      false,
    ],
    [
      'the signature has a high s',
      async () => asUserSignature(await highS()),
      false,
    ],
    ['the validator prefix is missing', ownerSignature, false],
    [
      'the validator prefix is not zero',
      async () => concat([HCA, await ownerSignature()]),
      false,
    ],
  ] as const)('%s', async (_, build, expected) => {
    expect(
      await isOwnerSessionAuthorization({
        owner: OWNER.address,
        hashesAndChainIds: HASHES_AND_CHAIN_IDS,
        userSignature: await build(),
      }),
    ).toBe(expected)
  })
})

describe('isOwnerSessionAuthorization with malformed stored digests', () => {
  it.each([
    [
      'a short session digest',
      [{ chainId: BigInt(sepolia.id), sessionDigest: '0x1234' }],
    ],
    [
      'a chain id beyond uint64',
      [
        {
          chainId: 2n ** 64n,
          sessionDigest: HASHES_AND_CHAIN_IDS[0].sessionDigest,
        },
      ],
    ],
  ] as const)(
    'is false, without throwing, for %s',
    async (_, hashesAndChainIds) => {
      expect(
        await isOwnerSessionAuthorization({
          owner: OWNER.address,
          hashesAndChainIds,
          userSignature: asUserSignature(await ownerSignature()),
        }),
      ).toBe(false)
    },
  )
})
