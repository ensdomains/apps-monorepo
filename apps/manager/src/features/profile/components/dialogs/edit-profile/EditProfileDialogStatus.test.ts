import { describe, expect, it } from 'vitest'
import { getEditProfileDialogStatus } from './EditProfileDialogStatus'

describe('getEditProfileDialogStatus', () => {
  it('returns an error panel when saving fails', () => {
    expect(
      getEditProfileDialogStatus({
        errorMessage: 'User rejected the transaction',
      }),
    ).toEqual({
      kind: 'error',
      message: 'User rejected the transaction',
    })
  })

  it('shows only the first two non-empty lines of long wallet errors', () => {
    expect(
      getEditProfileDialogStatus({
        errorMessage:
          'User rejected the request.\n\nDetails: Tx Signature: User denied transaction signature.\nVersion: viem@2.48.8',
      }),
    ).toEqual({
      kind: 'error',
      message:
        'User rejected the request.\nDetails: Tx Signature: User denied transaction signature.',
    })
  })

  it('does not show a status panel after a successful save', () => {
    expect(getEditProfileDialogStatus({})).toBeUndefined()
  })
})
