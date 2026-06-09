import { describe, expect, it } from 'vitest'
import {
  getSaveRecordsErrorMessage,
  RecordsValidationError,
} from './ProfileEdit.errors'

describe('getSaveRecordsErrorMessage', () => {
  it('returns the message for non-validation save errors', () => {
    expect(
      getSaveRecordsErrorMessage(new Error('User rejected the transaction')),
    ).toBe('User rejected the transaction')
  })

  it('does not return validation errors that render next to fields', () => {
    expect(
      getSaveRecordsErrorMessage(
        new RecordsValidationError([
          {
            sectionKey: 'address',
            fieldKey: '60',
            message: 'Invalid ETH address',
          },
        ]),
      ),
    ).toBeUndefined()
  })
})
