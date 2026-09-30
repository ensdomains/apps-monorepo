import type { Address, Hash, Hex, PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateCommitmentActor } from './registration.actors'

const readContract = vi.fn()
const getBlock = vi.fn()

vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
  getBlock: (...args: unknown[]) => getBlock(...args),
}))

const NOW = 1_800_000_000_000
const COMMITTED_AT = 1_000n
const MIN_AGE = 60n

const commitment = {
  commitment: `0x${'ab'.repeat(32)}` as Hash,
  secret: `0x${'cd'.repeat(32)}` as Hex,
}

/** The chain `elapsed` seconds after the commitment landed. */
const chainAt = (elapsed: bigint, committedAt = COMMITTED_AT) => {
  readContract.mockImplementation(
    async (_client: unknown, { functionName }: { functionName: string }) =>
      functionName === 'commitmentAt' ? committedAt : MIN_AGE,
  )
  getBlock.mockResolvedValue({ timestamp: committedAt + elapsed })
}

const validate = () =>
  validateCommitmentActor({
    commitment,
    publicClient: {} as PublicClient,
    // Passed explicitly: the default resolves off the client's chain config,
    // which this bare mock deliberately does not carry.
    registrarAddress: '0xeeee000000000000000000000000000000000004' as Address,
  })

describe('validateCommitmentActor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('returns when the commitment becomes old enough instead of waiting', async () => {
    // Waiting here kept a resumed run on "validating commitment" for the
    // whole cooldown, with no countdown on screen.
    chainAt(18n)

    const result = await validate()

    expect(result._unsafeUnwrap()).toEqual({
      registerReadyTimestamp: NOW + 42_000,
    })
  })

  it('is ready now once the commitment is past its minimum age', async () => {
    chainAt(600n)

    expect((await validate())._unsafeUnwrap()).toEqual({
      registerReadyTimestamp: NOW,
    })
  })
})
