import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileActions } from './ProfileActions'

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
