import type { IneligibleName } from '@ens-apps/migration'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { makeDomain } from '../service/_fixtures'
import { UnavailableMigrationNames } from './UnavailableMigrationNames'

const unavailable = (
  name: string,
  reason: IneligibleName['reason'],
): IneligibleName => ({ domain: makeDomain({ id: name, name }), reason })

describe('UnavailableMigrationNames', () => {
  it('names each unavailable name with its reason', () => {
    render(
      <UnavailableMigrationNames
        names={[
          unavailable('banner.eth', 'not-reserved'),
          unavailable('bare.eth', 'missing-registration'),
        ]}
      />,
    )

    expect(screen.getByText("These names can't be upgraded")).toBeVisible()
    expect(screen.getByText('banner.eth').parentElement).toHaveTextContent(
      'banner.eth: it has no ENSv2 reservation.',
    )
    expect(screen.getByText('bare.eth').parentElement).toHaveTextContent(
      'bare.eth: no ENSv1 registration was found for it.',
    )
  })

  it('renders nothing when every name can be upgraded', () => {
    const { container } = render(<UnavailableMigrationNames names={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
