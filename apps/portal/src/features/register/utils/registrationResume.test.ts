import {
  buildRegistrationRecord,
  type PersistedRegistrationRecord,
  type Signer,
} from '@ens-apps/transaction-manager'
import type { Address, Client, Hash, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assessRegistrationResume,
  decideRegistrationResume,
  type RegistrationResumeVerdict,
} from './registrationResume'

const readContract = vi.fn()
const getBlock = vi.fn()

vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  readContract: (...args: unknown[]) => readContract(...args),
  getBlock: (...args: unknown[]) => getBlock(...args),
}))

const CHAIN_ID = 11155111
const OWNER = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address
const COMMITTED_AT = 1_000n
const MAX_AGE = 86_400n
const client = {} as Client

type RecordContext = Parameters<typeof buildRegistrationRecord>[1]

const recordAt = (
  stage: string,
  overrides: Partial<RecordContext> = {},
): PersistedRegistrationRecord =>
  buildRegistrationRecord(
    stage,
    {
      chainId: CHAIN_ID,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: 'eoa' } as unknown as Signer,
      accountAddress: OWNER,
      ownerAddress: OWNER,
      commitment: {
        commitment: `0x${'ab'.repeat(32)}` as Hash,
        secret: `0x${'cd'.repeat(32)}` as Hex,
      },
      commitmentTxId: 'tx-reg-commit',
      ...overrides,
    },
    1,
  )

const assess = (record: PersistedRegistrationRecord | null) =>
  assessRegistrationResume({
    name: 'leon.eth',
    chainId: CHAIN_ID,
    client,
    record,
  })

/** The chain as seen `ageSeconds` after the commitment landed. */
const chainAt = (ageSeconds: bigint) => {
  readContract.mockImplementation(
    async (_client: Client, { functionName }: { functionName: string }) =>
      functionName === 'commitmentAt' ? COMMITTED_AT : MAX_AGE,
  )
  getBlock.mockResolvedValue({ timestamp: COMMITTED_AT + ageSeconds })
}

describe('assessRegistrationResume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chainAt(60n)
  })

  it('finds nothing without a record', async () => {
    expect(await assess(null)).toEqual({ status: 'none' })
  })

  it("leaves another name's record alone", async () => {
    // Its own page resumes it; starting a registration here overwrites it.
    expect(
      await assess(recordAt('commitmentCooldown', { name: 'bob.eth' })),
    ).toEqual({ status: 'none' })
  })

  it('resumes a live commitment, with the token narrowed', async () => {
    const record = recordAt('commitmentCooldown')

    const verdict = await assess(record)

    expect(verdict).toMatchObject({
      status: 'resumable',
      record,
      commitmentOnChain: true,
    })
    expect(verdict.status === 'resumable' && verdict.token.symbol).toBe('USDC')
  })

  it('resumes a submitted register, which the machine verifies first', async () => {
    // The register was accepted against a landed commitment, so the commit
    // step is behind it even when the chain cannot be read.
    readContract.mockRejectedValue(new Error('rpc down'))

    const verdict = await assess(
      recordAt('waitingForRegistration', {
        registrationTxId: 'tx-reg-register',
      }),
    )

    expect(verdict).toMatchObject({
      status: 'resumable',
      commitmentOnChain: true,
    })
  })

  it('drops a run that stopped before its commitment', async () => {
    // Nothing paid worth saving, and resuming would prompt the wallet for a
    // resolver deploy the moment the page loads.
    expect(
      await assess(recordAt('deployingResolver', { commitment: undefined })),
    ).toEqual({ status: 'stale', reason: 'before-commit' })
  })

  it('drops an expired commitment, boundary included', async () => {
    chainAt(MAX_AGE)

    expect(await assess(recordAt('commitmentCooldown'))).toEqual({
      status: 'stale',
      reason: 'commitment-expired',
    })
  })

  it('keeps the record when the chain cannot be read', async () => {
    // Discarding over an RPC blip would cost the user a second commitment.
    readContract.mockRejectedValue(new Error('rpc down'))

    expect(await assess(recordAt('commitmentCooldown'))).toMatchObject({
      status: 'resumable',
      // Unconfirmed, so the commit step stays in view.
      commitmentOnChain: false,
    })
  })

  it('keeps the commit ahead of a run left at its commit prompt', async () => {
    // The record holds the commitment before the prompt opens. Closing the tab
    // and rejecting the prompt leaves it unsent, and the run must not look as
    // if it had moved past it.
    readContract.mockImplementation(
      async (_client: Client, { functionName }: { functionName: string }) =>
        functionName === 'commitmentAt' ? 0n : MAX_AGE,
    )
    getBlock.mockResolvedValue({ timestamp: 10n ** 12n })

    expect(await assess(recordAt('waitingForCommitment'))).toMatchObject({
      status: 'resumable',
      commitmentOnChain: false,
    })
  })

  it.each([
    [
      'another chain',
      recordAt('commitmentCooldown', { chainId: 1 }),
      'chain-mismatch',
    ],
    [
      'a non-EOA run',
      recordAt('commitmentCooldown', {
        signer: { type: 'rhinestone' } as unknown as Signer,
      }),
      'signer-mode-mismatch',
    ],
    [
      'a token the portal does not offer',
      recordAt('commitmentCooldown', { selectedToken: 'ETH' as never }),
      'unsupported-token',
    ],
    ['a finished run', recordAt('success'), 'already-finished'],
  ] as const)('drops %s', async (_label, record, reason) => {
    expect(await assess(record)).toEqual({ status: 'stale', reason })
  })
})

describe('decideRegistrationResume', () => {
  const resumable = (
    overrides: Partial<RecordContext> = {},
  ): RegistrationResumeVerdict => ({
    status: 'resumable',
    record: recordAt('commitmentCooldown', overrides),
    commitmentOnChain: true,
    token: {
      symbol: 'USDC',
      address: '0x0000000000000000000000000000000000000001',
      decimals: 6,
      Icon: () => null as never,
    } as never,
  })

  it('does nothing without a record', () => {
    expect(decideRegistrationResume({ status: 'none' }, OWNER)).toEqual({
      kind: 'none',
    })
  })

  it('drops stale records, telling the user only about a lost payment', () => {
    expect(
      decideRegistrationResume(
        { status: 'stale', reason: 'commitment-expired' },
        OWNER,
      ),
    ).toEqual({ kind: 'discard', notify: true })
    expect(
      decideRegistrationResume(
        { status: 'stale', reason: 'before-commit' },
        OWNER,
      ),
    ).toEqual({ kind: 'discard', notify: false })
  })

  it('resumes for the wallet that owns the run', () => {
    const verdict = resumable()

    expect(
      decideRegistrationResume(verdict, OWNER.toUpperCase() as Address),
    ).toEqual({ kind: 'resume', verdict })
  })

  it('names the owning wallet when none is connected', () => {
    expect(decideRegistrationResume(resumable(), undefined)).toEqual({
      kind: 'await-owner',
      owner: OWNER,
    })
  })

  it('keeps the run out of sight of a different wallet', () => {
    expect(decideRegistrationResume(resumable(), OTHER)).toEqual({
      kind: 'hide',
    })
  })
})
