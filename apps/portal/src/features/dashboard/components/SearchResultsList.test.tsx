import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Suggestion } from '../utils/buildSearchSuggestions'
import { SearchResultsList } from './SearchResultsList'

const NAME: Suggestion = {
  id: 'name:new.eth',
  label: 'new.eth',
  inputValue: 'new.eth',
  description: 'View ENS name details',
  action: () => {},
}

describe('SearchResultsList', () => {
  it('exposes View and Register as separate options without nested interactive controls', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <SearchResultsList
        suggestions={[NAME]}
        availableNames={[NAME]}
        ownerBySuggestionId={new Map([[NAME.id, null]])}
        offchainNameIds={new Set()}
        pendingAvailabilityIds={new Set()}
        ownedNamesFiltered={[]}
        onSelect={onSelect}
        variant="listbox"
      />,
    )

    const view = screen.getByRole('option', {
      name: /new.eth.*Available to register/,
    })
    const register = screen.getByRole('option', { name: /Register new.eth/ })
    expect(view.querySelector('a, button')).toBeNull()
    await user.click(view)
    await user.click(register)
    expect(onSelect.mock.calls).toEqual([
      ['name:new.eth'],
      ['register:new.eth'],
    ])
  })
})
