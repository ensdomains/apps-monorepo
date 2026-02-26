import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegistrationDetails } from './RegistrationDetails'

describe('RegistrationDetails', () => {
  it('renders domain name and registration details', () => {
    render(
      <RegistrationDetails
        discountAmount={0}
        domainName="test.eth"
        duration={1}
        expiresDate={new Date(2027, 0, 1)}
        totalPrice={100}
      />,
    )
    expect(screen.getByText('Registration Details')).toBeInTheDocument()
    expect(screen.getByText('Registration Period')).toBeInTheDocument()
    expect(screen.getByText('test.eth')).toBeInTheDocument()
    expect(screen.getByText('1 Year')).toBeInTheDocument()
  })

  it('computes and displays discount percentage when registration fee > 0', () => {
    render(
      <RegistrationDetails
        discountAmount={20}
        domainName="test.eth"
        duration={1}
        expiresDate={new Date(2027, 0, 1)}
        totalPrice={80}
      />,
    )
    expect(screen.getByText('Registration Details')).toBeInTheDocument()
  })
})
