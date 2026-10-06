import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResolverCollectionNotice } from './ResolverCollectionNotice'

describe('ResolverCollectionNotice', () => {
  it('explains unavailable collections without claiming there are no roles', () => {
    render(<ResolverCollectionNotice collection="roles" status="unsupported" />)
    expect(
      screen.getByText('The roles for this resolver are unavailable.'),
    ).toBeInTheDocument()
  })

  it('warns when known rows are an incomplete list', () => {
    render(<ResolverCollectionNotice collection="links" status="partial" />)
    expect(screen.getByText(/Only some links.*incomplete/)).toBeInTheDocument()
  })

  it('does not warn for complete collections', () => {
    const { container } = render(
      <ResolverCollectionNotice collection="roles" status="full" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
