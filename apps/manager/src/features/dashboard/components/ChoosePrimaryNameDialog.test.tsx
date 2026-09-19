import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { ChoosePrimaryNameDialog } from './ChoosePrimaryNameDialog'

const mocks = vi.hoisted(() => ({
  useSetPrimaryName: vi.fn(),
  useSmartAccountContext: vi.fn(),
  useV1Names: vi.fn(),
}))

vi.mock('@/features/migration/hooks/useV1Names', () => ({
  useV1Names: mocks.useV1Names,
}))

vi.mock('@/features/profile/hooks/useSetPrimaryName', () => ({
  useSetPrimaryName: mocks.useSetPrimaryName,
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))

const openDialog = () => {
  render(
    <ChoosePrimaryNameDialog>
      <button type="button">Choose primary name</button>
    </ChoosePrimaryNameDialog>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Choose primary name' }))
}

beforeEach(() => {
  mocks.useSetPrimaryName.mockReturnValue({
    submit: vi.fn(),
    isSubmitting: false,
    isError: false,
    error: null,
  })
  mocks.useSmartAccountContext.mockReturnValue({
    ownerAddress: null,
    walletClient: null,
  })
})

describe('ChoosePrimaryNameDialog V1 warning', () => {
  it('shows the warning when the wallet owns a V1 name', () => {
    mocks.useV1Names.mockReturnValue({
      data: ['legacy.eth'],
      isError: false,
    })

    openDialog()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only ENSv2 Names Supported',
    )
  })

  it('shows the same warning when the V1 name lookup fails', () => {
    mocks.useV1Names.mockReturnValue({ data: undefined, isError: true })

    openDialog()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only ENSv2 Names Supported',
    )
  })
})
