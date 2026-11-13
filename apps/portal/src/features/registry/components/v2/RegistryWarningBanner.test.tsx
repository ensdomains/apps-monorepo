import { ok } from 'neverthrow'
import { type Address, type Hex, pad } from 'viem'
import { mainnet } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper, render, screen } from '@/test-utils'
import { RegistryWarningBanner } from './RegistryWarningBanner'

const REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const UNTRUSTED_IMPLEMENTATION = '0x75FF9AdBcFcE2469B097AC68f6Ae650EaE1351Bb'
const AFFECTED_IMPLEMENTATION = '0xC927bCaA77cd7bE283518760896Be0CF3Cfbe08d'

const getStorageAt = vi.hoisted(() => vi.fn<() => Promise<Hex>>())

vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  getStorageAt,
}))

vi.mock('@/lib/wagmi/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wagmi/helpers')>()),
  safeGetClient: () => ok({ chain: { id: mainnet.id } }),
}))

const AFFECTED_TITLE = 'Avoid using this registry in production'
const UNTRUSTED_TITLE = 'Untrusted registry'

const renderBanner = () =>
  render(<RegistryWarningBanner address={REGISTRY} />, {
    wrapper: createTestWrapper(),
  })

describe('RegistryWarningBanner', () => {
  beforeEach(() => {
    getStorageAt.mockReset()
  })

  it('warns about a registry on an affected implementation', async () => {
    getStorageAt.mockResolvedValue(pad(AFFECTED_IMPLEMENTATION))
    renderBanner()

    expect(await screen.findByText(AFFECTED_TITLE)).toBeVisible()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('shows only the untrusted alert for a registry that is both', async () => {
    getStorageAt.mockResolvedValue(pad(UNTRUSTED_IMPLEMENTATION))
    renderBanner()

    expect(await screen.findByText(UNTRUSTED_TITLE)).toBeVisible()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByText(AFFECTED_TITLE)).not.toBeInTheDocument()
  })

  it('still warns about an affected registry when the untrusted check fails', async () => {
    // The untrusted query is declared first, so its read is the first call.
    getStorageAt
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValue(pad(AFFECTED_IMPLEMENTATION))
    renderBanner()

    expect(await screen.findByText(AFFECTED_TITLE)).toBeVisible()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
