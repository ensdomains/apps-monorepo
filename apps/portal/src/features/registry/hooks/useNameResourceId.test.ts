import { type Address, keccak256, labelhash, toBytes, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const multicall = vi.fn()
vi.mock('viem/actions', () => ({ multicall: (...args: unknown[]) => args }))
vi.mock('viem/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem/utils')>()
  return { ...actual, getAction: () => multicall }
})
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok({}) }
})

const { encodedLabelCandidates, getNameResourceId } = await import(
  './useNameResourceId'
)

const REGISTRY: Address = '0x666b3d735e366bb8755b65cb5bf7a14c7f41eb23'
const OWNER: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'

// `vault` written as an encoded label. Its two readings are different names.
const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`
const NAME = `${ENCODED_LABEL}.eth`
/** Registered as the 66 characters themselves. */
const LITERAL_ID = BigInt(keccak256(toBytes(ENCODED_LABEL)))
/** The digits read as a labelhash — the undecoded reading. */
const DECODED_ID = BigInt(VAULT_LABELHASH)

/** A registry entry the registry knows about. */
const known = (resource: bigint, over: Record<string, unknown> = {}) => ({
  status: 'success' as const,
  result: {
    status: 2,
    expiry: 1893456000n,
    latestOwner: OWNER,
    tokenId: resource,
    resource,
    ...over,
  },
})

/** An id the registry has never written an entry for. */
const unknownEntry = () => ({
  status: 'success' as const,
  result: {
    status: 0,
    expiry: 0n,
    latestOwner: zeroAddress,
    tokenId: 0n,
    resource: 0n,
  },
})

const askedIds = () =>
  (
    multicall.mock.calls[0]?.[0] as {
      contracts: { args: readonly bigint[] }[]
    }
  ).contracts.map((c) => c.args[0])

beforeEach(() => {
  multicall.mockReset()
})

describe('encodedLabelCandidates', () => {
  it('offers both readings of an encoded first label', () => {
    expect(encodedLabelCandidates(NAME)).toEqual([LITERAL_ID, DECODED_ID])
  })

  it('is nothing to do for an ordinary name', () => {
    expect(encodedLabelCandidates('vault.eth')).toBeNull()
    expect(encodedLabelCandidates(`sub.${ENCODED_LABEL}.eth`)).toBeNull()
  })

  // A label of 64 zeros reads as the root resource, which is a scope rather
  // than a name; it must never become a candidate.
  it('refuses a label that reads as the root resource', () => {
    expect(encodedLabelCandidates(`[${'0'.repeat(64)}].eth`)).toBeNull()
  })
})

describe('getNameResourceId', () => {
  it('asks the registry about both readings in one call', async () => {
    multicall.mockResolvedValue([known(LITERAL_ID), unknownEntry()])

    await getNameResourceId({ name: NAME, registryAddress: REGISTRY })

    expect(askedIds()).toEqual([LITERAL_ID, DECODED_ID])
  })

  // WEB-1458: the digits inside the brackets are what `labelhash` returns for
  // this string, and for a label registered as those 66 characters they name
  // the wrong name entirely.
  it('takes the literal reading when that is the one the registry holds', async () => {
    multicall.mockResolvedValue([known(LITERAL_ID), unknownEntry()])

    const result = await getNameResourceId({
      name: NAME,
      registryAddress: REGISTRY,
    })

    expect(result._unsafeUnwrap()).toBe(LITERAL_ID)
    expect(result._unsafeUnwrap()).not.toBe(DECODED_ID)
  })

  // A name whose preimage nothing decoded is rendered this way by design, and
  // then the digits really are its id. It must stay manageable.
  it('takes the decoded reading when that is the one the registry holds', async () => {
    multicall.mockResolvedValue([unknownEntry(), known(DECODED_ID)])

    const result = await getNameResourceId({
      name: NAME,
      registryAddress: REGISTRY,
    })

    expect(result._unsafeUnwrap()).toBe(DECODED_ID)
  })

  // `getStatus` reports AVAILABLE for anything past its expiry, so a status
  // test would lose exactly the names an owner is most likely to be managing.
  it('still disambiguates a name that has expired', async () => {
    multicall.mockResolvedValue([
      unknownEntry(),
      // Expired: the entry is still there, and the registry still knows the id.
      known(DECODED_ID, { status: 0, expiry: 1n }),
    ])

    const result = await getNameResourceId({
      name: NAME,
      registryAddress: REGISTRY,
    })

    expect(result._unsafeUnwrap()).toBe(DECODED_ID)
  })

  it('refuses when the registry holds both readings', async () => {
    multicall.mockResolvedValue([known(LITERAL_ID), known(DECODED_ID)])

    expect(
      (
        await getNameResourceId({ name: NAME, registryAddress: REGISTRY })
      ).isErr(),
    ).toBe(true)
  })

  it('refuses when the registry holds neither', async () => {
    multicall.mockResolvedValue([unknownEntry(), unknownEntry()])

    expect(
      (
        await getNameResourceId({ name: NAME, registryAddress: REGISTRY })
      ).isErr(),
    ).toBe(true)
  })

  it('refuses when a read reverts rather than counting it as unknown', async () => {
    multicall.mockResolvedValue([
      { status: 'failure' as const, error: new Error('reverted') },
      { status: 'failure' as const, error: new Error('reverted') },
    ])

    expect(
      (
        await getNameResourceId({ name: NAME, registryAddress: REGISTRY })
      ).isErr(),
    ).toBe(true)
  })

  it('makes no read for a name that is not written as an encoded label', async () => {
    const result = await getNameResourceId({
      name: 'vault.eth',
      registryAddress: REGISTRY,
    })

    expect(result.isErr()).toBe(true)
    expect(multicall).not.toHaveBeenCalled()
  })
})
