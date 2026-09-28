import type { ProfileActionDetails } from './profileAiPreparation'

// A destination phrase can qualify the resource without supplying a URL/title.
export const profileLinkDestinationWords =
  '(?:(?:a|an|my|the)\\s+)?(?:(?:new|custom|profile|website)\\s+)*link'

const literal =
  '(?:"([^"\\n]+)"|“([^”\\n]+)”|\'([^\'\\n]+)\'|([\\p{L}\\p{N}_-]+))'
const extractTitle = (match: RegExpExecArray | null) =>
  match
    ?.slice(1)
    .find((value) => value !== undefined)
    ?.trim()
const namedTitle = new RegExp(`\\b(?:named|called|titled)\\s+${literal}`, 'iu')
const titleBeforeLink = new RegExp(
  `(?<![\\p{L}\\p{N}_.-])${literal}\\s+link\\b`,
  'iu',
)
const titleAfterLink = new RegExp(
  `\\blink\\s+(?:(?:named|called|titled)\\s+)?${literal}`,
  'iu',
)
const reservedTitleWords = new Set([
  'a',
  'my',
  'the',
  'this',
  'new',
  'custom',
  'to',
  'for',
  'from',
  'on',
  'with',
  'as',
  'add',
  'edit',
  'update',
  'change',
  'replace',
  'remove',
  'delete',
  'use',
  'register',
  'renew',
  'rename',
  'http',
  'https',
])

const validTitle = (title: string | undefined) =>
  title && !reservedTitleWords.has(title.toLowerCase()) ? title : undefined

const isGenericResourceLink = (
  query: string,
  named: string | undefined,
  title: string | undefined,
) =>
  !named &&
  /^(?:github|website)$/i.test(title ?? '') &&
  !/["“'](?:GitHub|website)["”']/i.test(query)

export const isProfileLinkRename = (instruction: string): boolean =>
  /\brename\b/i.test(instruction) ||
  /\b(?:change|update|set)\b.*(?:\b(?:title|label|name)\s+(?:of|for)\b.*\blink\b|\blink(?:\s+\[PROFILE_VALUE_\d+\])?\s+(?:title|label|name)\b)/i.test(
    instruction,
  )

const parseLinkRename = (
  query: string,
  title: string | undefined,
): ProfileActionDetails | undefined => {
  // Changing a URL alongside the title requires another separately reviewed
  // edit; never silently apply only the title from that request.
  if (/https?:\/\//i.test(query)) return undefined
  const renamed = validTitle(
    extractTitle(new RegExp(`\\bto\\s+${literal}`, 'iu').exec(query)),
  )
  return {
    section: 'links',
    field: 'link',
    operation: 'rename',
    ...(title && { linkTarget: title }),
    ...(renamed && { linkName: renamed }),
  }
}

const parseLinkUrlAssignment = (
  query: string,
  replacing: boolean,
): Pick<ProfileActionDetails, 'value' | 'expectedValue'> | null => {
  const urls = [...query.matchAll(/https?:\/\/[^\s"“”‘’<>]+/gi)]
  if (urls.length > 2) return null
  const previous = urls.length === 2 ? urls[0] : undefined
  const next = urls.length === 2 ? urls[1] : urls[0]
  if (
    previous &&
    (!replacing ||
      !next ||
      !/^\s*(?:with|to)\s*$/i.test(
        query.slice(previous.index + previous[0].length, next.index),
      ))
  )
    return null
  return {
    ...(next && { value: next[0] }),
    ...(previous && { expectedValue: previous[0] }),
  }
}

/** Link titles and URLs are literal spans, never strings supplied by the model. */
export const parseNamedProfileLink = (
  query: string,
  operation: ProfileActionDetails['operation'],
): ProfileActionDetails | undefined => {
  if (!/\blinks?\b/i.test(query)) return undefined
  const named = validTitle(extractTitle(namedTitle.exec(query)))
  const before = validTitle(extractTitle(titleBeforeLink.exec(query)))
  const after = validTitle(extractTitle(titleAfterLink.exec(query)))
  const title = named ?? before ?? after
  if (isGenericResourceLink(query, named, title)) return undefined
  if (operation === 'remove')
    return {
      section: 'links',
      field: 'link',
      operation,
      ...(title && { linkName: title, linkTarget: title }),
    }
  // Renaming changes the title only; its URL will be read from the current row.
  if (operation === 'rename') return parseLinkRename(query, title)
  const replacing = /\b(?:change|update|replace)\b/i.test(query)
  const assignment = parseLinkUrlAssignment(query, replacing)
  if (!assignment) return undefined
  if (!title && !replacing) return undefined
  return {
    section: 'links',
    field: 'link',
    ...(title && { linkName: title }),
    ...(replacing &&
      (title ? { linkTarget: title } : { linkTargetRequested: true })),
    ...assignment,
  }
}
