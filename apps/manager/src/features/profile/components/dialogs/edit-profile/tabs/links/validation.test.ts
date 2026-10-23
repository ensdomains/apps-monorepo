import { i18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import type { LinkItem } from '@/features/profile/types'
import { getLinkValidationIssues } from './validation'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const getIssueMessages = (links: readonly LinkItem[]) =>
  getLinkValidationIssues(links).map(({ message, ...issue }) => ({
    ...issue,
    message: i18n._(message),
  }))

describe('getLinkValidationIssues', () => {
  it('rejects link titles that collide with reserved text record keys', () => {
    expect(
      getIssueMessages([{ name: 'url', url: 'https://example.com' }]),
    ).toContainEqual({
      field: 'name',
      index: 0,
      message: 'Choose a different name (reserved key)',
    })
  })

  it('treats an untitled row with only the prefilled https:// as empty', () => {
    expect(getLinkValidationIssues([{ name: '', url: 'https://' }])).toEqual([])
  })

  it('accepts a bare domain without a scheme', () => {
    expect(
      getLinkValidationIssues([{ name: 'Site', url: 'asdfdf4t4.com' }]),
    ).toEqual([])
  })

  it('explains why a link URL is invalid', () => {
    expect(
      getIssueMessages([
        { name: 'Blog', url: 'https://example.com/a b' },
        { name: 'Home', url: 'hello' },
        { name: 'Script', url: 'javascript:alert(1)' },
      ]),
    ).toEqual([
      {
        field: 'url',
        index: 0,
        message: "Links can't contain spaces. Remove them and try again",
      },
      { field: 'url', index: 1, message: 'Add a domain extension, like .com' },
      {
        field: 'url',
        index: 2,
        message: 'Only http:// and https:// links are supported',
      },
    ])
  })

  it('asks for a link when a titled row only has the prefilled https://', () => {
    expect(
      getIssueMessages([{ name: 'Blog', url: 'https://' }]),
    ).toContainEqual({ field: 'url', index: 0, message: 'Enter a link' })
  })
})
