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
  ])('shows one Figma warning when the V1 query returns %i name(s)', (v1NameCount) => {
    render(<PrimaryNameV1Warning isV1Error={false} v1NameCount={v1NameCount} />)

    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(TITLE)
    expect(warning).toHaveTextContent(DESCRIPTION)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('does not show the warning when the V1 query returns no names', () => {
    render(<PrimaryNameV1Warning isV1Error={false} v1NameCount={0} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the same Figma warning when the V1 query fails', () => {
    render(<PrimaryNameV1Warning isV1Error v1NameCount={0} />)

    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(TITLE)
    expect(warning).toHaveTextContent(DESCRIPTION)
  })
})
