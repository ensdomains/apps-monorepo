import { buildRegistrationRecord } from '@ens-apps/transaction-manager'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { RegistrationConfirmedData } from '../state/registrationUi.machine'
import { resolveOrphanRegistration } from './orphanRegistrationCleanup'
import type { StoredRegistration } from './registrationPersistence'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address
const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const COMMITMENT = `0x${'ab'.repeat(32)}` as Hash
const SECRET = `0x${'cd'.repeat(32)}` as Hex
const CHAIN_ID = 11155111

const confirmedData: RegistrationConfirmedData = {
  label: 'leon',
  duration: 31_536_000n,
  ownerAddress: OWNER,
  token: 'USDC',
  totalPrice: 5_000_000n,
  basePriceNumber: 5,
  premiumPriceNumber: 0,
}

const stored = (
  options: { withCommitment?: boolean } = {},
): StoredRegistration => ({
  label: 'leon',
  confirmedData,
  record: buildRegistrationRecord(
    'waitingForRhinestoneBundle',
    {
      chainId: CHAIN_ID,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: 'rhinestone' } as never,
      accountAddress: HCA,
      ownerAddress: OWNER,
      ...(options.withCommitment === false
        ? {}
        : { commitment: { commitment: COMMITMENT, secret: SECRET } }),
      publicClient: {} as PublicClient,
    },
    Date.now(),
  ),
})

const clientOwnedBy = (owner: Address) =>
  ({
    readContract: vi.fn(async () => owner),
  }) as unknown as PublicClient

describe('resolveOrphanRegistration', () => {
  it('reports our own registration landing while the user was away', async () => {
    // The whole reason this lives outside the register route: the loader
    // redirects on exactly this outcome, so the provider never runs.
    await expect(
      resolveOrphanRegistration({
        stored: stored(),
        publicClient: clientOwnedBy(OWNER),
        chainId: CHAIN_ID,
      }),
    ).resolves.toEqual({ status: 'registered', label: 'leon' })
  })

  it('matches the owner regardless of checksum casing', async () => {
    await expect(
      resolveOrphanRegistration({
        stored: stored(),
        publicClient: clientOwnedBy(
          `0x${OWNER.slice(2).toUpperCase()}` as Address,
        ),
        chainId: CHAIN_ID,
      }),
    ).resolves.toMatchObject({ status: 'registered' })
  })

  it('keeps the record when the owner cannot be compared', async () => {
    // Reporting "taken" on an unreadable address would clear a name the user
    // may own. Leaving it pending costs nothing — the next navigation retries.
    await expect(
      resolveOrphanRegistration({
        stored: stored(),
        publicClient: clientOwnedBy('not-an-address' as Address),
        chainId: CHAIN_ID,
      }),
    ).resolves.toEqual({ status: 'pending' })
  })

  it('reports the name being sniped by someone else', async () => {
    await expect(
      resolveOrphanRegistration({
        stored: stored(),
        publicClient: clientOwnedBy(OTHER),
        chainId: CHAIN_ID,
      }),
    ).resolves.toEqual({ status: 'taken', label: 'leon' })
  })

  it('keeps an unregistered name pending so the user can come back', async () => {
    await expect(
      resolveOrphanRegistration({
        stored: stored(),
        publicClient: clientOwnedBy(zeroAddress),
        chainId: CHAIN_ID,
      }),
    ).resolves.toEqual({ status: 'pending' })
  })

  it('does not read the chain before a commitment exists', async () => {
    // Nothing was submitted, so an unowned name says nothing about this record.
    const publicClient = clientOwnedBy(OTHER)

    await expect(
      resolveOrphanRegistration({
        stored: stored({ withCommitment: false }),
        publicClient,
        chainId: CHAIN_ID,
      }),
    ).resolves.toEqual({ status: 'pending' })
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })
})
