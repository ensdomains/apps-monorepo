import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProfileAddressName } from '@/features/profile/service/profileAddressNames'
import { render } from '@/utils/test-utils'

import { AddressProfileNamesList } from './AddressProfileNamesList'

// Reads the smart-account context, which this component does not otherwise need.
vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: () => false }))

// Renders a router `Link`. The toolbar is what is under test, so a row here is
// just its label.
vi.mock('@/features/dashboard/components/NameRow', () => ({
  NameRow: ({ label }: { readonly label: string }) => <span>{label}</span>,
  NameRowSkeleton: () => null,
}))

const name = (
  label: string,
  roleCategory: ProfileAddressName['roleCategory'] = 'owned',
): ProfileAddressName => ({
  key: `${label}-${roleCategory}`,
  label,
  protocol: 'v2',
  expiryDate: null,
  createdAt: null,
  registeredAt: null,
  nameRoles: roleCategory === 'owned' ? ['owner'] : ['manager'],
  roleCategory,
})

const addressNames = [name('alpha.eth'), name('beta.eth'), name('gamma.eth')]

const renderList = (isConnectedView: boolean) =>
  render(
    <AddressProfileNamesList
      addressNames={addressNames}
      isConnectedView={isConnectedView}
    />,
  )

const searchBox = () => screen.getByPlaceholderText('Search names')

describe('AddressProfileNamesList', () => {
  // WEB-1320: the search box was inside the connected-view branch, so visiting
  // someone else's address left no way to navigate a long list of names.
  it('offers the search box on an address that is not the connected one', () => {
    renderList(false)

    expect(searchBox()).toBeVisible()
    expect(screen.getByText('Names')).toBeVisible()
  })

  it("filters someone else's names as it filters your own", () => {
    renderList(false)

    expect(screen.getByText('alpha.eth')).toBeInTheDocument()
    expect(screen.getByText('beta.eth')).toBeInTheDocument()

    fireEvent.change(searchBox(), { target: { value: 'alph' } })

    expect(screen.getByText('alpha.eth')).toBeInTheDocument()
    expect(screen.queryByText('beta.eth')).not.toBeInTheDocument()
  })

  // Sorting and the role chips act on roles the viewer holds, so they stay
  // with the connected view — only the search moved out of it.
  it('keeps the role filter chips off an address that is not the connected one', () => {
    renderList(false)

    expect(screen.queryByRole('button', { name: /owned/i })).toBeNull()
  })

  it('still shows the role filter chips on the connected address', () => {
    renderList(true)

    expect(searchBox()).toBeVisible()
    expect(screen.getByRole('button', { name: /owned/i })).toBeVisible()
  })
})
