import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { PrimaryNameV1Warning } from './PrimaryNameV1Warning'

const TITLE = 'Only ENSv2 Names Supported'
const DESCRIPTION =
  'You own names that need to be upgraded to ENSv2 before they can be set as your Primary Name'

describe('PrimaryNameV1Warning', () => {
  it.each([
    1, 2,
  ])('shows one Figma warning when %i name(s) can be upgraded', (upgradeableNameCount) => {
    render(
      <PrimaryNameV1Warning
        isError={false}
        upgradeableNameCount={upgradeableNameCount}
      />,
    )

    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(TITLE)
    expect(warning).toHaveTextContent(DESCRIPTION)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('does not show the warning when no name can be upgraded', () => {
    render(<PrimaryNameV1Warning isError={false} upgradeableNameCount={0} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the same Figma warning when the V1 lookup fails', () => {
    render(<PrimaryNameV1Warning isError upgradeableNameCount={0} />)

    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(TITLE)
    expect(warning).toHaveTextContent(DESCRIPTION)
  })
})
