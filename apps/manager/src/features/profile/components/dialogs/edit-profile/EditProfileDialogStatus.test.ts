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

  it('does not show a status panel after a successful save', () => {
    expect(getEditProfileDialogStatus({})).toBeUndefined()
  })
})
