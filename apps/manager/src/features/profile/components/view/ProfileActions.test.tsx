import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileActions, ProfileDesktopActions } from './ProfileActions'

const renderUpgradeNav = (hasDesktopBar: boolean) =>
  render(
    <ProfileActions
      canEdit={false}
      hasDesktopBar={hasDesktopBar}
      hasFloatingBar={false}
      isInGrace={false}
      isOwner={hasDesktopBar}
      isUpgradeRequired
      name="example.eth"
      onUpdated={() => undefined}
      records={newEmptyProfileRecords()}
      renewalProtocol="v2"
      url="https://app.ens.domains/example.eth"
    />,
  )

describe('ProfileActions upgrade nav', () => {
  it.each([
    ['keeps the actions in the nav when they belong to the bar', true, 1],
    ['leaves them to the header when the header has them', false, 0],
  ] as const)('%s', (_, hasDesktopBar, count) => {
    renderUpgradeNav(hasDesktopBar)

    expect(screen.queryAllByRole('link', { name: 'Explore' })).toHaveLength(
      count,
    )
  })
})

describe('ProfileActions bar', () => {
  it.each([
    ["keeps an owner's actions in the bottom bar", true, true],
    [
      'gives a visitor no bar, since the header holds their actions',
      false,
      false,
    ],
  ] as const)('%s', (_, hasDesktopBar, hasBar) => {
    render(
      <ProfileActions
        canEdit={false}
        hasDesktopBar={hasDesktopBar}
        hasFloatingBar={false}
        isInGrace={false}
        isOwner={hasDesktopBar}
        isUpgradeRequired={false}
        name="example.eth"
        onUpdated={() => undefined}
        records={newEmptyProfileRecords()}
        renewalProtocol="v2"
        url="https://app.ens.domains/example.eth"
      />,
    )

    expect(
      screen.queryByRole('navigation', { name: 'Profile actions' }) !== null,
    ).toBe(hasBar)
  })

  it('puts Explore for the name in the visitor header actions', () => {
    render(
      <ProfileDesktopActions
        isOwner={false}
        name="example.eth"
        renewalProtocol="v2"
        url="https://app.ens.domains/example.eth"
      />,
    )

    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/example.eth',
    )
  })
})
