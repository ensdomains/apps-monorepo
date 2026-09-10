import { getDestinationContracts } from '@ens-apps/smart-account'
import { buildRegistrationRecord } from '@ens-apps/transaction-manager'
import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistrationConfirmedData } from '../state/registrationUi.machine'
import {
  assessResumableRegistration,
  isResumeOwner,
} from './assessResumableRegistration'
import type { StoredRegistration } from './registrationPersistence'

const getRegisterPrice = vi.fn()
const getRegisterPriceQueryOptions = vi.fn((...args: unknown[]) => ({
  queryKey: ['register-price', ...args],
  queryFn: () => getRegisterPrice(...args),
}))
vi.mock('../data/queries/pricing.query', () => ({
  getRegisterPrice: (...args: unknown[]) =>
    (getRegisterPrice as unknown as (...a: unknown[]) => unknown)(...args),
  getRegisterPriceQueryOptions: (...args: unknown[]) =>
    (getRegisterPriceQueryOptions as unknown as (...a: unknown[]) => unknown)(
      ...args,
    ),
}))

// Controlled explicitly rather than left to the real router: whether a query
// client exists decides which of the two re-quote paths runs, and a unit test
// should not depend on router internals to pick one.
const getQueryClient = vi.fn<() => { fetchQuery: unknown } | undefined>(
  () => undefined,
)
vi.mock('@/utils/router/root-context', () => ({
  getQueryClient: () => getQueryClient(),
}))

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address
const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const COMMITMENT = `0x${'ab'.repeat(32)}` as Hash
const SECRET = `0x${'cd'.repeat(32)}` as Hex

const CHAIN_ID = 11155111
const MAX_COMMITMENT_AGE = 86_400n
const NOW = 1_800_000_000n

const confirmedData: RegistrationConfirmedData = {
  label: 'leon',
  duration: 31_536_000n,
  ownerAddress: OWNER,
  token: 'USDC',
  totalPrice: 5_000_000n,
  basePriceNumber: 5,
  premiumPriceNumber: 0,
}

const storedRegistration = (
  overrides: {
    stage?: string
    label?: string
    chainId?: number
    withCommitment?: boolean
    signerType?: 'eoa' | 'rhinestone'
  } = {},
): StoredRegistration => ({
  label: overrides.label ?? 'leon',
  confirmedData,
  record: buildRegistrationRecord(
    overrides.stage ?? 'commitmentCooldown',
    {
      chainId: overrides.chainId ?? CHAIN_ID,
      name: `${overrides.label ?? 'leon'}.eth`,
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: overrides.signerType ?? 'rhinestone' } as never,
      accountAddress: HCA,
      ownerAddress: OWNER,
      ...(overrides.withCommitment === false
        ? {}
        : { commitment: { commitment: COMMITMENT, secret: SECRET } }),
      publicClient: {} as PublicClient,
    },
    Date.now(),
  ),
})

/** `commitmentAt` and the age immutables, plus a block for chain time. */
const publicClientWith = (committedAt: bigint | Error) =>
  ({
    chain: { id: CHAIN_ID },
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'MAX_COMMITMENT_AGE') return MAX_COMMITMENT_AGE
      if (functionName === 'MIN_COMMITMENT_AGE') return 60n
      if (committedAt instanceof Error) throw committedAt
      return committedAt
    }),
    getBlock: vi.fn(async () => ({ timestamp: NOW })),
  }) as unknown as PublicClient

const assess = (params: {
  stored: StoredRegistration | null
  publicClient?: PublicClient
  label?: string
}) =>
  assessResumableRegistration({
    label: params.label ?? 'leon',
    chainId: CHAIN_ID,
    publicClient: params.publicClient ?? publicClientWith(NOW - 60n),
    stored: params.stored,
  })

describe('assessResumableRegistration', () => {
  beforeEach(() => {
    getRegisterPrice.mockReset()
    getQueryClient.mockReset()
    getQueryClient.mockReturnValue(undefined)
    getRegisterPrice.mockResolvedValue({
      isErr: () => false,
      value: { basePrice: 4_000_000n, premium: 1_000_000n },
    })
  })

  it('re-quotes through the shared pricing query when a client is available', async () => {
    // Deduped against the pricing screen's query rather than a second raw
    // contract read for the same label/duration/token.
    const fetchQuery = vi.fn(async (options: { queryFn: () => unknown }) => {
      const quote = (await options.queryFn()) as {
        value: { basePrice: bigint; premium: bigint }
      }
      return quote.value
    })
    getQueryClient.mockReturnValue({ fetchQuery })

    const result = await assess({ stored: storedRegistration() })

    expect(fetchQuery).toHaveBeenCalledOnce()
    expect(getRegisterPriceQueryOptions).toHaveBeenCalledWith(
      'leon',
      31_536_000,
      'USDC',
    )
    expect(result.status).toBe('resumable')
    if (result.status !== 'resumable') return
    expect(result.confirmedData.totalPrice).toBe(5_000_000n)
    expect(result.priceIsStale).toBe(false)
  })

  it('keeps the stored price when the shared query throws', async () => {
    // `resultQueryOptions` unwraps the Result by throwing on Err, so the
    // fallback has to be a catch, not a `.isErr()` check.
    getQueryClient.mockReturnValue({
      fetchQuery: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    })

    const result = await assess({ stored: storedRegistration() })

    expect(result.status).toBe('resumable')
    if (result.status !== 'resumable') return
    expect(result.priceIsStale).toBe(true)
    expect(result.confirmedData.totalPrice).toBe(5_000_000n)
  })

  it('reports nothing to do with no stored record', async () => {
    await expect(assess({ stored: null })).resolves.toEqual({ status: 'none' })
  })

  it('resumes a fresh commitment and re-quotes the price', async () => {
    const result = await assess({ stored: storedRegistration() })

    expect(result.status).toBe('resumable')
    if (result.status !== 'resumable') return
    // The temporary premium decays continuously, so the stored quote is
    // always suspect; the permit must be sized against a fresh one.
    expect(result.confirmedData.totalPrice).toBe(5_000_000n)
    expect(result.confirmedData.basePriceNumber).toBe(4)
    expect(result.confirmedData.premiumPriceNumber).toBe(1)
    expect(result.priceIsStale).toBe(false)
  })

  it('discards a commitment past MAX_COMMITMENT_AGE', async () => {
    // Without this check, `validatingCommitment` passes and the user waits out
    // a cooldown only for register to revert with an opaque `CommitmentTooOld`.
    const result = await assess({
      stored: storedRegistration(),
      publicClient: publicClientWith(NOW - MAX_COMMITMENT_AGE - 1n),
    })

    expect(result).toEqual({ status: 'stale', reason: 'commitment-expired' })
  })

  it('discards a commitment exactly at the age limit', async () => {
    // The reveal window is the OPEN interval (commit+min, commit+max), and the
    // reveal necessarily runs later than this assessment — a commitment at the
    // boundary is already doomed to `CommitmentTooOld`.
    const result = await assess({
      stored: storedRegistration(),
      publicClient: publicClientWith(NOW - MAX_COMMITMENT_AGE),
    })

    expect(result).toEqual({ status: 'stale', reason: 'commitment-expired' })
  })

  it('resumes a commitment one second inside the age limit', async () => {
    const result = await assess({
      stored: storedRegistration(),
      publicClient: publicClientWith(NOW - MAX_COMMITMENT_AGE + 1n),
    })

    expect(result.status).toBe('resumable')
  })

  it('reads the commitment off the registrar the record was written against', async () => {
    // Same contract on Sepolia today; the moment the deployments diverge, the
    // live-mode registrar would report `commitmentAt == 0` for the other
    // path's commitment and silently disable the expiry check.
    const eoaClient = publicClientWith(NOW - 60n)
    await assess({
      stored: storedRegistration({ signerType: 'eoa' }),
      publicClient: eoaClient,
    })

    expect(eoaClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'commitmentAt',
        address: ENS_SEPOLIA_CONTRACTS.ETHRegistrar,
      }),
    )

    const hcaClient = publicClientWith(NOW - 60n)
    await assess({ stored: storedRegistration(), publicClient: hcaClient })

    expect(hcaClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'commitmentAt',
        address: getDestinationContracts(CHAIN_ID).ethRegistrar,
      }),
    )
  })

  it('resumes when the commitment is not recorded yet', async () => {
    // Still filling, or it failed. `validatingCommitment` retries and then
    // routes to a signer-aware retry — better placed to tell those apart.
    const result = await assess({
      stored: storedRegistration(),
      publicClient: publicClientWith(0n),
    })

    expect(result.status).toBe('resumable')
  })

  it('resumes rather than discarding when the chain read fails', async () => {
    // Discarding on an RPC blip throws away a commitment the user paid for.
    const result = await assess({
      stored: storedRegistration(),
      publicClient: publicClientWith(new Error('rpc down')),
    })

    expect(result.status).toBe('resumable')
  })

  it('skips the age check entirely before a commitment exists', async () => {
    const publicClient = publicClientWith(NOW)
    const result = await assess({
      stored: storedRegistration({ withCommitment: false }),
      publicClient,
    })

    expect(result.status).toBe('resumable')
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('discards a record for another label', async () => {
    const result = await assess({
      stored: storedRegistration({ label: 'bob' }),
      label: 'leon',
    })

    expect(result).toEqual({ status: 'stale', reason: 'label-mismatch' })
  })

  it('discards a record from another chain', async () => {
    const result = await assess({ stored: storedRegistration({ chainId: 1 }) })

    expect(result).toEqual({ status: 'stale', reason: 'chain-mismatch' })
  })

  it('discards a record written under the other signer mode', async () => {
    // `VITE_FF_USE_EOA` can flip on redeploy between the run that committed and
    // the one resuming. RESUME replaces the stored signerType with the live
    // signer, so every signer-aware branch downstream would then run against a
    // commitment made under the other mode.
    const result = await assessResumableRegistration({
      label: 'leon',
      chainId: CHAIN_ID,
      publicClient: publicClientWith(NOW - 60n),
      // The record is written by a rhinestone run (see `storedRegistration`).
      signerType: 'eoa',
      stored: storedRegistration(),
    })

    expect(result).toEqual({ status: 'stale', reason: 'signer-mode-mismatch' })
  })

  it('resumes when the signer mode still matches', async () => {
    const result = await assessResumableRegistration({
      label: 'leon',
      chainId: CHAIN_ID,
      publicClient: publicClientWith(NOW - 60n),
      signerType: 'rhinestone',
      stored: storedRegistration(),
    })

    expect(result.status).toBe('resumable')
  })

  it('does not gate on signer mode before the account has resolved one', async () => {
    // The wallet restores asynchronously; an absent signer must not be read as
    // a mismatch, or the record would be destroyed mid-restore.
    const result = await assessResumableRegistration({
      label: 'leon',
      chainId: CHAIN_ID,
      publicClient: publicClientWith(NOW - 60n),
      signerType: undefined,
      stored: storedRegistration(),
    })

    expect(result.status).toBe('resumable')
  })

  it.each([
    'success',
    'idle',
  ])('discards a record left at the %s stage', async (stage) => {
    const result = await assess({ stored: storedRegistration({ stage }) })

    expect(result).toEqual({ status: 'stale', reason: 'already-finished' })
  })

  it('keeps the stored price when the re-quote fails', async () => {
    getRegisterPrice.mockResolvedValue({ isErr: () => true, error: 'nope' })

    const result = await assess({ stored: storedRegistration() })

    expect(result.status).toBe('resumable')
    if (result.status !== 'resumable') return
    expect(result.priceIsStale).toBe(true)
    expect(result.confirmedData.totalPrice).toBe(5_000_000n)
  })
})

describe('isResumeOwner', () => {
  it('matches case-insensitively', () => {
    expect(isResumeOwner(OWNER, OWNER.toUpperCase() as Address)).toBe(true)
  })

  it('rejects a different wallet', () => {
    expect(isResumeOwner(OWNER, OTHER)).toBe(false)
  })

  it('rejects while the wallet is still restoring', () => {
    // Treating "not connected yet" as a match would resume without a wallet;
    // the hook decides separately what to show while none is connected.
    expect(isResumeOwner(OWNER, null)).toBe(false)
    expect(isResumeOwner(undefined, OWNER)).toBe(false)
  })
})
