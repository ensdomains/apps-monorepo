import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { err, ok, type Result } from 'neverthrow'
import { normalizeUrlInput } from './urlInputPrefix'

export type UrlInputIssue =
  | 'has-spaces'
  | 'invalid-url'
  | 'missing-domain-extension'
  | 'unsupported-scheme'

export class UrlInputError extends TaggedError('UrlInputError')<{
  readonly reason: UrlInputIssue
}> {}

const DOMAIN_WITH_EXTENSION = /^[^.]+(?:\.[^.]+)+$/
const SUPPORTED_PROTOCOLS = ['http:', 'https:'] as const

export const URL_INPUT_ISSUE_MESSAGES: Readonly<
  Record<UrlInputIssue, MessageDescriptor>
> = {
  'has-spaces': msg`Links can't contain spaces. Remove them and try again`,
  'invalid-url': msg`Enter a valid URL, like https://example.com`,
  'missing-domain-extension': msg`Add a domain extension, like .com`,
  'unsupported-scheme': msg`Only http:// and https:// links are supported`,
}

const isSupportedProtocol = (
  protocol: string,
): protocol is (typeof SUPPORTED_PROTOCOLS)[number] =>
  (SUPPORTED_PROTOCOLS as readonly string[]).includes(protocol)

const checkProtocol = (url: URL): Result<URL, UrlInputError> =>
  isSupportedProtocol(url.protocol)
    ? ok(url)
    : err(new UrlInputError({ reason: 'unsupported-scheme' }))

const checkDomainExtension = (url: URL): Result<URL, UrlInputError> =>
  DOMAIN_WITH_EXTENSION.test(url.hostname)
    ? ok(url)
    : err(new UrlInputError({ reason: 'missing-domain-extension' }))

export const validateUrlInput = (
  value: string,
): Result<string, UrlInputError> => {
  const normalized = normalizeUrlInput(value)
  if (/\s/.test(normalized)) {
    return err(new UrlInputError({ reason: 'has-spaces' }))
  }

  return fromSync(
    () => new URL(normalized),
    () => new UrlInputError({ reason: 'invalid-url' }),
  )
    .andThen(checkProtocol)
    .andThen(checkDomainExtension)
    .map(() => normalized)
}
