import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fundPostMock = vi.fn()

vi.mock('@/utils/backend-client', () => ({
  backendClient: {
    wallet: {
      fund: {
        $post: (...args: unknown[]) => fundPostMock(...args),
      },
    },
  },
}))

import { useMigrationGasFunding } from './useMigrationGasFunding'

const OWNER = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'

beforeEach(() => {
  fundPostMock.mockReset()
  fundPostMock.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
})

describe('useMigrationGasFunding', () => {
  it('requests funding once for the owner address', async () => {
    renderHook(() => useMigrationGasFunding(OWNER))

    await waitFor(() => expect(fundPostMock).toHaveBeenCalledTimes(1))
    expect(fundPostMock).toHaveBeenCalledWith({ json: { address: OWNER } })
  })

  it('does not request when there is no owner address', () => {
    renderHook(() => useMigrationGasFunding(null))
    expect(fundPostMock).not.toHaveBeenCalled()
  })

  it('does not re-fire on re-renders with the same address', async () => {
    const { rerender } = renderHook(
      ({ address }: { address: string }) => useMigrationGasFunding(address),
      { initialProps: { address: OWNER } },
    )

    await waitFor(() => expect(fundPostMock).toHaveBeenCalledTimes(1))
    rerender({ address: OWNER })
    rerender({ address: OWNER.toLowerCase() }) // case change is the same owner
    expect(fundPostMock).toHaveBeenCalledTimes(1)
  })

  it('fires again when the owner address changes', async () => {
    const other = '0x1111111111111111111111111111111111111111'
    const { rerender } = renderHook(
      ({ address }: { address: string }) => useMigrationGasFunding(address),
      { initialProps: { address: OWNER } },
    )

    await waitFor(() => expect(fundPostMock).toHaveBeenCalledTimes(1))
    rerender({ address: other })
    await waitFor(() => expect(fundPostMock).toHaveBeenCalledTimes(2))
    expect(fundPostMock).toHaveBeenLastCalledWith({
      json: { address: other },
    })
  })

  it('swallows request failures (best-effort)', async () => {
    fundPostMock.mockRejectedValueOnce(new Error('network down'))
    renderHook(() => useMigrationGasFunding(OWNER))
    await waitFor(() => expect(fundPostMock).toHaveBeenCalledTimes(1))
    // No throw — the migration flow surfaces any out-of-gas error itself.
  })
})
