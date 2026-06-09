import { describe, expect, it } from 'vitest'
import { getEditProfileDialogStatus } from './EditProfileDialogStatus'

describe('getEditProfileDialogStatus', () => {
  it('returns an error panel when saving fails', () => {
    expect(
      getEditProfileDialogStatus({
        errorMessage: 'User rejected the transaction',
        isSuccess: false,
      }),
    ).toEqual({
      kind: 'error',
      message: 'User rejected the transaction',
    })
  })

  it('keeps the transaction hash available after a successful save', () => {
    expect(
      getEditProfileDialogStatus({
        isSuccess: true,
        txHash: '0x123',
      }),
    ).toEqual({
      kind: 'success',
      txHash: '0x123',
    })
  })
})
