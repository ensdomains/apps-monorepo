import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileViewNewHeader } from './ProfileViewNewHeader'

describe('ProfileViewNewHeader', () => {
  it('keeps the mobile About section clear of the profile actions', () => {
    render(
      <ProfileViewNewHeader
        avatarLoading={false}
        name="example.eth"
        records={newEmptyProfileRecords()}
      />,
    )

    const aboutContainer = screen
      .getByRole('heading', { name: 'About' })
      .closest('section')?.parentElement

    expect(aboutContainer).toHaveClass('mt-29', 'lg:landscape:mt-0')
  })
})
