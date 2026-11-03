import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { GracePeriodBanner } from './GracePeriodBanner'

describe('GracePeriodBanner', () => {
  it('includes hours, minutes, seconds and a UTC offset in the grace-end deadline', () => {
    render(
      <GracePeriodBanner
        graceEndDate={new Date('2026-10-30T01:37:42Z')}
        previewRenew
        renewName="example.eth"
        variant="profileNotOwnedName"
      />,
    )

    expect(
      screen.getByText(/\d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}/),
    ).toBeInTheDocument()
  })
})
