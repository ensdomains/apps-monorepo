import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Autorenewal } from './Autorenewal'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('Autorenewal', () => {
  it('renders domain name and expiry', () => {
    render(<Autorenewal domainName="test.eth" duration={1} />)
    expect(screen.getByText('test.eth')).toBeInTheDocument()
    expect(
      screen.getByText('Protect your name with autorenewal'),
    ).toBeInTheDocument()
  })

  it('shows Skip button and shows success state when clicked', () => {
    render(<Autorenewal domainName="test.eth" duration={1} />)
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(screen.getByText('Registration successful')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /create profile/i }),
    ).toBeInTheDocument()
  })

  it('calls onCompleteFlow and onReset when navigating away', () => {
    const onCompleteFlow = vi.fn()
    const onReset = vi.fn()
    render(
      <Autorenewal
        domainName="test.eth"
        duration={1}
        onCompleteFlow={onCompleteFlow}
        onReset={onReset}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))
    expect(onCompleteFlow).toHaveBeenCalled()
    expect(onReset).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
  })
})
