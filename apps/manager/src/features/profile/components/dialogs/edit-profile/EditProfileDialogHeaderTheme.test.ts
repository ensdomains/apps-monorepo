import { describe, expect, it } from 'vitest'
import { getEditProfileDialogHeaderStyle } from './EditProfileDialogHeaderTheme'

describe('getEditProfileDialogHeaderStyle', () => {
  it('uses the profile theme color for the edit dialog header nameplate', () => {
    expect(getEditProfileDialogHeaderStyle('#ED2496')).toMatchObject({
      '--theme-color': '#ED2496',
    })
  })
})
