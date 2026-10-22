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
      addresses: [60, 2147488648, 2147483648, 0x80000000 + 1234567].map(
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
      'Ethereum Mantle Any EVM chain EVM chain 1234567',
    )
    for (const label of [
      'Ethereum',
      'Mantle',
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
              coinType: 2147488648,
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
    const mantle = getByRole('button', { name: /^Copy Mantle address/ })
    const unknown = getByRole('button', {
      name: /^Copy Coin type 123456789 address/,
    })
    expect(within(mantle).getByText('Mantle')).toBeVisible()
    expect(within(unknown).getByText('Coin type 123456789')).toBeVisible()
    expect(mantle.querySelector('img')).toBeNull()
    expect(unknown.querySelector('img')).toBeNull()
  })
})
