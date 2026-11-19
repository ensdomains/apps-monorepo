import { renderHook, waitFor } from '@testing-library/react'
import { type Address, isAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils'
import { useAddressResolution } from './useAddressResolution'

const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const RECORD: Address = '0x1111111111111111111111111111111111111111'

// Any name resolves to RECORD, so no lookup leaves the test.
vi.mock('@/features/roles/helpers/addUser.handlers', () => ({
  resolveAddressOrName: ({ nameOrAddress }: { nameOrAddress: string }) =>
    Promise.resolve(isAddress(nameOrAddress) ? nameOrAddress : RECORD),
}))

const render = (input: string) =>
  renderHook(() => useAddressResolution(input), {
    wrapper: createTestWrapper(),
  })

describe('useAddressResolution', () => {
  it.each([
    { input: `${VITALIK}.eth`, address: RECORD, isAddressLike: true },
    { input: VITALIK, address: VITALIK, isAddressLike: false },
  ])(
    'resolves $input and flags it as address-like: $isAddressLike',
    async ({ input, address, isAddressLike }) => {
      const { result } = render(input)

      await waitFor(() => expect(result.current.status).toBe('resolved'))
      expect(result.current.address).toBe(address)
      expect(result.current.isAddressLike).toBe(isAddressLike)
    },
  )
})
