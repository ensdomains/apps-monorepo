import { describe, expect, it, vi } from 'vitest'
import { NO_EDITABLE_TYPES } from '@/utils/records/editRecordUtils'
import {
  getRecordSaveEligibility,
  uploadImagesBeforeSaveReview,
} from './recordSaveFlow'

describe('getRecordSaveEligibility', () => {
  it('blocks a valid pending record the wallet can no longer edit', () => {
    expect(
      getRecordSaveEligibility({
        records: [
          {
            type: 'text',
            key: 'email',
            value: 'test@example.com',
            isNew: true,
          },
        ],
        editableTypes: NO_EDITABLE_TYPES,
        changesCount: 1,
      }),
    ).toEqual({
      validationErrors: [],
      hasDisallowedChanges: true,
      canSave: false,
    })
  })
})

describe('uploadImagesBeforeSaveReview', () => {
  it('validates the save again when control returns from the upload batch', async () => {
    const controller = new AbortController()
    const openReview = vi.fn()
    const review = uploadImagesBeforeSaveReview({
      uploads: [],
      submit: async () => {},
      onUploaded: () => {},
      assertCurrent: () => controller.signal.throwIfAborted(),
      openReview,
    })

    controller.abort()

    await expect(review).rejects.toMatchObject({ name: 'AbortError' })
    expect(openReview).not.toHaveBeenCalled()
  })
})
