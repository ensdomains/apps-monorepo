import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorMessage } from './ErrorMessage'

describe('ErrorMessage', () => {
  it('renders with default title and description', () => {
    render(<ErrorMessage />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Please try again or contact support if the issue persists.',
      ),
    ).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<ErrorMessage title="Custom Error" />)

    expect(screen.getByText('Custom Error')).toBeInTheDocument()
  })

  it('renders with custom description', () => {
    render(
      <ErrorMessage
        title="Error"
        description="This is a custom error message"
      />,
    )

    expect(
      screen.getByText('This is a custom error message'),
    ).toBeInTheDocument()
  })

  it('renders with description as React node', () => {
    render(
      <ErrorMessage
        title="Error"
        description={<span data-testid="custom-node">Custom Node</span>}
      />,
    )

    expect(screen.getByTestId('custom-node')).toBeInTheDocument()
    expect(screen.getByText('Custom Node')).toBeInTheDocument()
  })
})
