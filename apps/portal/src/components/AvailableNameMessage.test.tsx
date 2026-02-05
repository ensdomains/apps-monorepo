import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvailableNameMessage } from './AvailableNameMessage'

describe('AvailableNameMessage', () => {
  it('renders defaults with badge and action link', () => {
    render(<AvailableNameMessage name="example.eth" />)

    expect(screen.getByText('example.eth is available!')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Register in Manager Alpha' }),
    ).toHaveAttribute('href', 'https://app.ens.dev')
  })

  it('uses custom description and action button', () => {
    render(
      <AvailableNameMessage
        name="custom.eth"
        description={<span>Custom description</span>}
        badge="Beta"
        actionButton={{ label: 'Custom action' }}
      />,
    )

    expect(screen.getByText('Custom description')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Custom action' }),
    ).toBeInTheDocument()
  })
})
