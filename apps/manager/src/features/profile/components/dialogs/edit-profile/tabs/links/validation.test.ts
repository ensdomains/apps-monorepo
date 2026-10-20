import { describe, expect, it } from 'vitest'
import { getLinkValidationIssues } from './validation'

describe('getLinkValidationIssues', () => {
  it('rejects link titles that collide with reserved text record keys', () => {
    expect(
      getLinkValidationIssues([{ name: 'url', url: 'https://example.com' }]),
    ).toContainEqual({
      field: 'name',
      index: 0,
      message: 'Choose a different name (reserved key)',
    })
  })

  it('treats an untitled row with only the prefilled https:// as empty', () => {
    expect(getLinkValidationIssues([{ name: '', url: 'https://' }])).toEqual([])
  })

  it('rejects a link URL containing spaces', () => {
    expect(
      getLinkValidationIssues([
        { name: 'Blog', url: 'https://example.com/a b' },
      ]),
    ).toContainEqual({ field: 'url', index: 0, message: 'Enter a valid URL' })
  })

  it('asks for a link when a titled row only has the prefilled https://', () => {
    expect(
      getLinkValidationIssues([{ name: 'Blog', url: 'https://' }]),
    ).toContainEqual({ field: 'url', index: 0, message: 'Enter a link' })
  })
})
