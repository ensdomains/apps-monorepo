import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRegistrationResume } from '@/features/register/hooks/useRegistrationResume'
import { RegisterName } from './RegisterName'

vi.mock('@/features/register/hooks/useRegistrationResume', () => ({
  useRegistrationResume: vi.fn(),
}))

describe('RegisterName', () => {
  it('refuses a name that reads like a wallet address before resuming a run stored for it', () => {
    render(
      <RegisterName name="0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth" />,
    )

    expect(screen.getByText('Name can’t be registered')).toBeInTheDocument()
    expect(useRegistrationResume).not.toHaveBeenCalled()
  })
})
