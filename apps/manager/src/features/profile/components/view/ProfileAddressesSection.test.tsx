import { getCoinTypeForReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { coinIcons } from '@/assets/coins'
import type { ProfileRecords } from '@/features/profile/types'
import { copyToClipboard } from '@/lib/clipboard'
import { render } from '@/utils/test-utils'
import { ProfileAddressesSection } from './ProfileAddressesSection'

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}))

describe('ProfileAddressesSection', () => {
  it('shows canonical L2 names and artwork beside a distinct Sepolia record', () => {
    const value = '0x1234567890123456789012345678901234567890'
    const testnetValue = '0x2234567890123456789012345678901234567890'
    const { getByRole } = render(
      <ProfileAddressesSection
        records={{
          addresses: [
            { coinType: 60, value },
            ...[10, 42161, 8453, 59144, 534352].map((chainId) => ({
              coinType: 0x80000000 + chainId,
              value,
            })),
            {
              coinType: getCoinTypeForReverseRegistrarChainId(10, 'sepolia'),
              value: testnetValue,
            },
          ],
          base: {},
          contact: [],
          links: [],
          social: [],
          unknown: [],
          agentRegistrations: [],
        }}
      />,
    )
    const canonicalCard = getByRole('button', { name: `Copy address ${value}` })
    for (const label of [
      'Optimism',
      'Arbitrum One',
      'Base',
      'Linea',
      'Scroll',
    ]) {
      expect(within(canonicalCard).getByText(label)).toBeVisible()
    }
    expect(canonicalCard.querySelectorAll('img')).toHaveLength(6)
    expect(canonicalCard.querySelector('.lucide-network')).toBeNull()
    const testnetCard = getByRole('button', {
      name: `Copy Optimism Sepolia address ${testnetValue}`,
    })
    expect(within(testnetCard).getByText('Optimism Sepolia')).toBeVisible()
    expect(testnetCard.querySelector('img')).toHaveAttribute(
      'src',
      coinIcons.op,
    )
  })

  it.each([
    [784, 'Sui'],
    [236, 'BitcoinSV'],
    [8444, 'Chia'],
  ] as const)(
    'renders local brand artwork for coin type %i (%s)',
    (coinType, label) => {
      const { getByRole } = render(
        <ProfileAddressesSection
          records={{
            addresses: [{ coinType, value: 'synthetic-address' }],
            base: {},
            contact: [],
            links: [],
            social: [],
            unknown: [],
            agentRegistrations: [],
          }}
        />,
      )
      const card = getByRole('button', {
        name: 'Copy address synthetic-address',
      })
      expect(within(card).getByText(label, { selector: 'span' })).toBeVisible()
      expect(card.querySelector('span[aria-hidden="true"] svg')).not.toBeNull()
      expect(card.querySelector('.lucide-network')).toBeNull()
    },
  )

  it('renders separate case-sensitive cards and copies each record unchanged', async () => {
    // Synthetic values exercise the display and clipboard boundary only.
    const iostValue = 'ExampleAddress'
    const solValue = 'exampleAddress'
    const records: ProfileRecords = {
      addresses: [
        { coinType: 291, value: iostValue },
        { coinType: 501, value: solValue },
      ],
      base: {},
      contact: [],
      links: [],
      social: [],
      unknown: [],
      agentRegistrations: [],
    }

    const { getAllByRole, getByRole } = render(
      <ProfileAddressesSection records={records} />,
    )

    expect(getAllByRole('button')).toHaveLength(2)
    const mainCard = getByRole('button', {
      name: 'Copy address ExampleAddress',
    })
    const solCard = getByRole('button', {
      name: 'Copy Solana address exampleAddress',
    })
    expect(mainCard).toHaveAttribute('title', iostValue)
    expect(solCard).toHaveAttribute('title', solValue)
    expect(mainCard.querySelector('img')).toHaveAttribute('src', coinIcons.iost)
    expect(solCard.querySelector('img')).toHaveAttribute('src', coinIcons.sol)

    fireEvent.click(solCard)
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenLastCalledWith(solValue),
    )
    fireEvent.click(mainCard)
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenLastCalledWith(iostValue),
    )
  })

  it('identifies every shared network even without artwork or encoder metadata', async () => {
    const value = '0x1234567890123456789012345678901234567890'
    const records: ProfileRecords = {
      addresses: [60, 2147483817, 2147483648, 0x80000000 + 1234567].map(
        (coinType) => ({ coinType, value }),
      ),
      base: {},
      contact: [],
      links: [],
      social: [],
      unknown: [],
      agentRegistrations: [],
    }
    const { getByRole } = render(<ProfileAddressesSection records={records} />)
    const card = getByRole('button', { name: `Copy address ${value}` })
    expect(card).toHaveAccessibleDescription(
      'Ethereum Manta Pacific Any EVM chain EVM chain 1234567',
    )
    for (const label of [
      'Ethereum',
      'Manta Pacific',
      'Any EVM chain',
      'EVM chain 1234567',
    ]) {
      expect(within(card).getByText(label)).toBeVisible()
    }
    expect(card.querySelectorAll('button, a, [tabindex]')).toHaveLength(0)
    const image = card.querySelector('img')
    if (!image) throw new Error('Expected Ethereum artwork')
    fireEvent.error(image)
    expect(card.querySelector('img')).toBeNull()
    expect(within(card).getByText('Ethereum')).toBeVisible()
    fireEvent.click(card)
    await waitFor(() => expect(copyToClipboard).toHaveBeenLastCalledWith(value))
  })

  it('labels separate cards for unknown coin types and networks without artwork', () => {
    const { getByRole } = render(
      <ProfileAddressesSection
        records={{
          addresses: [
            {
              coinType: 60,
              value: '0x1234567890123456789012345678901234567890',
            },
            {
              coinType: 2147483817,
              value: '0x2234567890123456789012345678901234567890',
            },
            { coinType: 123456789, value: 'caseSensitiveAddress' },
          ],
          base: {},
          contact: [],
          links: [],
          social: [],
          unknown: [],
          agentRegistrations: [],
        }}
      />,
    )
    const manta = getByRole('button', { name: /^Copy Manta Pacific address/ })
    const unknown = getByRole('button', {
      name: /^Copy Coin type 123456789 address/,
    })
    expect(within(manta).getByText('Manta Pacific')).toBeVisible()
    expect(within(unknown).getByText('Coin type 123456789')).toBeVisible()
    expect(manta.querySelector('img')).toBeNull()
    expect(unknown.querySelector('img')).toBeNull()
  })
})
