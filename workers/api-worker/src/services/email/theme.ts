import type { BignameClient } from '@ens-apps/indexer/bigname'
import { logger } from '#utils/logger.js'

// Mirrors the manager app's profile themes (PROFILE_THEMES in
// apps/manager/src/features/profile/constants.ts) and its grace cover colour
// (COVER_COLORS in .../profile/utils/defaultHeaderCover.ts), so a name's email
// header matches its profile header. Keep the two in sync.
const QUARTZ = '#02293B'
const GARNET = '#E72A96'
const LAPIS = '#0082BB'
const PERIDOT = '#007C20'
const CITRINE = '#984D1B'

export const DEFAULT_THEME_COLOR = LAPIS
/** Grace overrides the name's theme, as on the profile page. */
export const GRACE_THEME_COLOR = '#87514C'

const THEME_COLORS_BY_HEX = new Map<string, string>([
  ...[QUARTZ, GARNET, LAPIS, PERIDOT, CITRINE].map(
    (color) => [color.toLowerCase(), color] as const,
  ),
  ['#000000', QUARTZ],
  ['#191919', QUARTZ],
  ['#ed2496', GARNET],
  ['#0080bc', LAPIS],
  ['#007c23', PERIDOT],
])

/**
 * The header colour for a `theme` text record. Anything that is not one of the
 * app's themes falls back to the default, so a record can never put an
 * arbitrary colour into an email.
 */
export const resolveThemeColor = (record: string | null): string =>
  THEME_COLORS_BY_HEX.get(record?.trim().toLowerCase() ?? '') ??
  DEFAULT_THEME_COLOR

const THEME_LOOKUP_TIMEOUT_MS = 3_000

/**
 * The theme value from a records response, read defensively: the client only
 * checks the envelope, and a malformed body must not fail the email.
 */
const themeValueFrom = (data: unknown): string | null => {
  const records =
    typeof data === 'object' && data !== null && 'records' in data
      ? data.records
      : null
  const answer =
    typeof records === 'object' && records !== null && 'text:theme' in records
      ? records['text:theme']
      : null
  if (typeof answer !== 'object' || answer === null) return null
  if (!('status' in answer && answer.status === 'ok' && 'value' in answer)) {
    return null
  }
  return typeof answer.value === 'string' ? answer.value : null
}

/**
 * Reads a name's `theme` text record. Never fails: an email with the default
 * header is better than a delayed or failed email.
 */
export const readThemeRecord = (
  client: BignameClient,
  name: string,
): Promise<string | null> =>
  client
    .nameRecords(
      name,
      { namespace: 'ens', keys: ['text:theme'] },
      { signal: AbortSignal.timeout(THEME_LOOKUP_TIMEOUT_MS) },
    )
    .map(({ data }) => themeValueFrom(data))
    .mapErr((error) => {
      logger.warn('Could not read theme record for email', {
        name,
        code: error.code,
      })
      return error
    })
    .unwrapOr(null)
