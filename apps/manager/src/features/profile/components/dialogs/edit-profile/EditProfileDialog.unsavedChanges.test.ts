import { describe, expect, it, vi } from 'vitest'
import type { PreparedProfileImageUpload } from '@/features/profile/service/profileImageUpload'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import {
  getEditProfileDialogCloseAction,
  getEditProfileDialogHasUnsavedChanges,
} from './EditProfileDialog.unsavedChanges'

const preparedAvatarUpload: PreparedProfileImageUpload = {
  dataURL: 'data:image/jpeg;base64,avatar',
  hash: 'avatar-hash',
  imageUrl: 'https://metadata.ens.domains/mainnet/avatar/test.eth',
  kind: 'avatar',
  name: 'test.eth',
}

describe('getEditProfileDialogHasUnsavedChanges', () => {
  it('returns false when records and prepared uploads are unchanged', () => {
    const records = newEmptyProfileRecords()

    expect(
      getEditProfileDialogHasUnsavedChanges({
        preparedImageUploads: [],
        savedRecords: records,
        values: records,
      }),
    ).toBe(false)
  })

  it('returns true when profile records have changed', () => {
    const savedRecords = newEmptyProfileRecords()
    const values = {
      ...newEmptyProfileRecords(),
      base: { description: 'Testing this name' },
    }

    expect(
      getEditProfileDialogHasUnsavedChanges({
        preparedImageUploads: [],
        savedRecords,
        values,
      }),
    ).toBe(true)
  })

  it('returns true when a prepared image upload is active in the draft records', () => {
    const savedRecords = newEmptyProfileRecords()
    const values = {
      ...newEmptyProfileRecords(),
      base: { avatar: preparedAvatarUpload.imageUrl },
    }

    expect(
      getEditProfileDialogHasUnsavedChanges({
        preparedImageUploads: [preparedAvatarUpload],
        savedRecords,
        values,
      }),
    ).toBe(true)
  })
})

describe('getEditProfileDialogCloseAction', () => {
  it('closes without confirmation when there are no unsaved changes', () => {
    const confirmDiscard = vi.fn()

    expect(
      getEditProfileDialogCloseAction({
        confirmDiscard,
        hasUnsavedChanges: false,
        isSaving: false,
      }),
    ).toBe('close')
    expect(confirmDiscard).not.toHaveBeenCalled()
  })

  it('keeps the dialog open while saving', () => {
    const confirmDiscard = vi.fn()

    expect(
      getEditProfileDialogCloseAction({
        confirmDiscard,
        hasUnsavedChanges: true,
        isSaving: true,
      }),
    ).toBe('keepOpen')
    expect(confirmDiscard).not.toHaveBeenCalled()
  })

  it('keeps the dialog open when unsaved changes are not discarded', () => {
    expect(
      getEditProfileDialogCloseAction({
        confirmDiscard: () => false,
        hasUnsavedChanges: true,
        isSaving: false,
      }),
    ).toBe('keepOpen')
  })

  it('closes when unsaved changes are discarded', () => {
    expect(
      getEditProfileDialogCloseAction({
        confirmDiscard: () => true,
        hasUnsavedChanges: true,
        isSaving: false,
      }),
    ).toBe('close')
  })
})
