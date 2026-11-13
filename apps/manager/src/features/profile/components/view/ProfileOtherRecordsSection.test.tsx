import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import {
  newEmptyProfileRecords,
  transformProfileRecords,
} from '@/features/profile/utils/transformRecords'
import { copyToClipboard } from '@/lib/clipboard'
import { render } from '@/utils/test-utils'
import { ProfileCards } from './ProfileCards'

vi.mock('@/lib/clipboard', () => ({ copyToClipboard: vi.fn() }))

const TOKENS =
  '0x5263E1f5A05e6b3F733fA401042c6F9f4a09464f,0xeFde44E09DDDc17d169760FC3922b55BEda7a53B,0xc9e364b45DEb73de694c7d97eF189A99013029dB'

const renderCards = (unknown: ProfileRecords['unknown']) =>
  render(
    <ProfileCards
      name="aibuilders.inphinity.eth"
      records={{ ...newEmptyProfileRecords(), unknown }}
    />,
  )

describe('ProfileOtherRecordsSection', () => {
  it('shows a resolver record with a custom key on the profile', () => {
    render(
      <ProfileCards
        name="aibuilders.inphinity.eth"
        records={transformProfileRecords({
          texts: [
            { key: 'description', value: 'An index fund on Arc Testnet.' },
            { key: 'inphinity.symbol', value: 'AIBLD' },
          ],
          coins: [],
        })}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Other records' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /inphinity\.symbol\s*AIBLD/ }),
    ).toBeInTheDocument()
  })

  it('copies the whole value of a record', async () => {
    renderCards([{ key: 'inphinity.tokens', value: TOKENS }])

    fireEvent.click(screen.getByRole('button', { name: /inphinity\.tokens/ }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(TOKENS))
  })

  it('hides the section when no row has both a key and a value', () => {
    renderCards([{ key: '', value: '' }])

    expect(
      screen.queryByRole('heading', { name: 'Other records' }),
    ).not.toBeInTheDocument()
  })

  it.each(['https://example.com/profile', 'javascript:alert(1)'])(
    'shows %s as text and never as a link',
    (value) => {
      renderCards([{ key: 'inphinity.site', value }])

      expect(screen.getByText(value)).toBeInTheDocument()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    },
  )
})
