import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { ResumeAssessment } from '@/features/register-v2/service/assessResumableRegistration'
import type { StoredRegistration } from '@/features/register-v2/service/registrationPersistence'
import { registrationHoldingFunds } from './pendingRegistration'

const HCA: Address = '0xaaaa000000000000000000000000000000000001'
const OTHER_HCA: Address = '0xbbbb000000000000000000000000000000000002'
const OWNER: Address = '0x1111111111111111111111111111111111111111'

const makeStored = (
  overrides: {
    readonly signerType?: 'eoa' | 'rhinestone'
    readonly accountAddress?: Address
  } = {},
): StoredRegistration => ({
  label: 'leon',
  confirmedData: {
    label: 'leon',
    duration: 31_536_000n,
    ownerAddress: OWNER,
    token: 'USDC',
    totalPrice: 5_000_000n,
    basePriceNumber: 5,
    premiumPriceNumber: 0,
  },
  record: {
    v: 1,
    fingerprint: 'test',
    stage: 'commitmentCooldown',
    updatedAt: 0,
    context: {
      chainId: 11155111,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signerType: overrides.signerType ?? 'rhinestone',
      accountAddress: overrides.accountAddress ?? HCA,
      ownerAddress: OWNER,
    },
  },
})

const continuable = (
  status: 'resumable' | 'failed',
  stored: StoredRegistration,
): ResumeAssessment => ({
  status,
  stored,
  confirmedData: stored.confirmedData,
  priceIsStale: false,
})

describe('registrationHoldingFunds', () => {
  it.each([
    [
      'a waiting registration',
      continuable('resumable', makeStored()),
      'leon.eth',
    ],
    [
      'a failed run still holding its commitment',
      continuable('failed', makeStored()),
      'leon.eth',
    ],
    ['no stored registration', { status: 'none' } as const, null],
    [
      'an expired commitment',
      {
        status: 'stale',
        reason: 'commitment-expired',
        run: { label: 'leon', updatedAt: 0 },
      } as const,
      null,
    ],
    [
      "another account's registration",
      continuable('resumable', makeStored({ accountAddress: OTHER_HCA })),
      null,
    ],
    [
      'a registration the wallet pays for directly',
      continuable('resumable', makeStored({ signerType: 'eoa' })),
      null,
    ],
  ] satisfies readonly (readonly [string, ResumeAssessment, string | null])[])(
    'returns the name for %s, or null',
    (_, assessment, expected) => {
      expect(registrationHoldingFunds(assessment, HCA)).toBe(expected)
    },
  )
})
