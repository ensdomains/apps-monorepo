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
      <ProfileAddressesSection name="example.eth" records={records} />,
    )

    expect(getAllByRole('button')).toHaveLength(2)
    const mainCard = getByRole('button', { name: /example.eth/ })
    const solCard = getByRole('button', { name: /examp\.\.\.dress/ })
    expect(mainCard).toHaveAttribute('title', iostValue)
    expect(solCard).toHaveAttribute('title', solValue)
    expect(within(mainCard).getByRole('img', { name: 'icon' })).toHaveAttribute(
      'src',
      coinIcons.iost,
    )
    expect(within(solCard).getByRole('img', { name: 'icon' })).toHaveAttribute(
      'src',
      coinIcons.sol,
    )

    fireEvent.click(solCard)
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenLastCalledWith(solValue),
    )
    fireEvent.click(mainCard)
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenLastCalledWith(iostValue),
    )
  })
})
