import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { type FilterChipDef, FilterChips } from './FilterChips'

type Scope = 'subnames' | 'v1' | 'v2'

const CHIPS: readonly FilterChipDef<Scope>[] = [
  { value: 'subnames', label: 'Subnames', count: 2 },
  { value: 'v1', label: 'V1', count: 0 },
  { value: 'v2', label: 'V2' },
]

const renderChips = (value: Scope | null, shouldHideEmpty = true) =>
  render(
    <FilterChips
      chips={CHIPS}
      onChange={() => undefined}
      shouldHideEmpty={shouldHideEmpty}
      value={value}
    />,
  )

describe('FilterChips', () => {
  it('hides a filter with nothing in it, but not one still counting', () => {
    renderChips(null)

    expect(screen.getByRole('button', { name: 'Subnames 2' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'V2' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /V1/ })).toBeNull()
  })

  it('hides an empty filter even when it is selected', () => {
    renderChips('v1')

    expect(screen.queryByRole('button', { name: /V1/ })).toBeNull()
  })

  it('shows empty filters unless asked to hide them', () => {
    renderChips(null, false)

    expect(screen.getByRole('button', { name: 'V1' })).toBeVisible()
  })
})
