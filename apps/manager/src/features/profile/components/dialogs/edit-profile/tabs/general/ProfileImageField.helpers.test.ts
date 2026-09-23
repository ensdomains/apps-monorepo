import { describe, expect, it } from 'vitest'
import {
  getImageUploadError,
  IMAGE_UPLOAD_ACCEPT,
  MAX_FILE_SIZE_BYTES,
} from './ProfileImageField.helpers'

describe('profile image upload validation', () => {
  it.each([
    ['image.svg', ''],
    ['image.SVG', 'application/octet-stream'],
    ['image.svg', 'image/png'],
    ['image.svgz', 'application/gzip'],
    ['image', 'image/svg+xml'],
  ])('rejects %s with MIME type %s', (name, type) => {
    const file = new File(['svg'], name, { type })

    expect(getImageUploadError(file)).toContain('Enter manually')
    expect(IMAGE_UPLOAD_ACCEPT).not.toContain('image/svg+xml')
    expect(IMAGE_UPLOAD_ACCEPT).not.toContain('image/*')
  })

  it.each([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
  ])('allows %s through both the picker and validation', (type) => {
    const file = new File(['raster image'], 'image', { type })

    expect(IMAGE_UPLOAD_ACCEPT.split(',')).toContain(type)
    expect(getImageUploadError(file)).toBeNull()
  })

  it('rejects unsupported files even when bypassing the file picker', () => {
    const file = new File(['text'], 'image.txt', { type: 'text/plain' })

    expect(getImageUploadError(file)).toContain('Please select')
  })

  it('retains the upload size limit', () => {
    const file = new File(
      [new Uint8Array(MAX_FILE_SIZE_BYTES + 1)],
      'image.png',
      {
        type: 'image/png',
      },
    )

    expect(getImageUploadError(file)).toBe('Image must be under 3MB')
  })
})
