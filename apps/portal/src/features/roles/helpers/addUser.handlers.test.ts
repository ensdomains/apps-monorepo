import { okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { getEnsAddress } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAddressOrName } from './addUser.handlers'

vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  getEnsAddress: vi.fn(),
}))

// Someone owns every name here. The old helper handed that owner back when a
// name had no address record.
const stranger = '0x5555555555555555555555555555555555555555' as Address
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwner: vi.fn(() => okAsync({ owner: stranger })),
}))

const client = {} as Parameters<typeof getEnsAddress>[0]
const recipient = '0x7777777777777777777777777777777777777777' as Address

describe('resolveAddressOrName', () => {
  beforeEach(() => {
    vi.mocked(getEnsAddress).mockReset()
  })

  it('resolves a name through its ETH address record', async () => {
    vi.mocked(getEnsAddress).mockResolvedValue(recipient)

    await expect(
      resolveAddressOrName({ client, nameOrAddress: 'alice.eth' }),
    ).resolves.toBe(recipient)
  })

  // Immunefi #89395: a transfer or role grant to a name with no address record
  // went to whoever owned the name (a V2 twin's registrant, or a V1 controller).
  it('does not resolve a name without an address record to its owner', async () => {
    vi.mocked(getEnsAddress).mockResolvedValue(null)

    await expect(
      resolveAddressOrName({ client, nameOrAddress: 'alice.eth' }),
    ).resolves.toBeNull()
  })

  it('produces no address when the lookup fails', async () => {
    vi.mocked(getEnsAddress).mockRejectedValue(new Error('rpc down'))

    await expect(
      resolveAddressOrName({ client, nameOrAddress: 'alice.eth' }),
    ).resolves.toBeNull()
  })
})
