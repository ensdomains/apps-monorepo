import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createTestWrapper } from '@/test-utils'
import { useAddressResolution } from './useAddressResolution'

const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'

const render = (input: string) =>
  renderHook(() => useAddressResolution(input), {
    wrapper: createTestWrapper(),
  })

describe('useAddressResolution', () => {
  it('never resolves a name that reads like a wallet address', () => {
    const { result } = render(`${VITALIK}.eth`)

    expect(result.current).toMatchObject({
      status: 'address-like',
      address: null,
      isResolving: false,
      isInvalid: true,
    })
  })

  it('still uses the address itself', async () => {
    const { result } = render(VITALIK)

    await waitFor(() => expect(result.current.status).toBe('resolved'))
    expect(result.current.address).toBe(VITALIK)
  })
})
