import { getAddress, isAddress } from 'viem'
import { normalizeProfileName } from '@/features/profile/service/profileName'

export type OgCardSubject =
  | { readonly kind: 'address'; readonly address: string }
  | { readonly kind: 'generic' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'name'; readonly name: string }

// Normalising takes more than linear time in the name's length.
const OG_NAME_MAX_LENGTH = 1000

/** The canonical name a card or its page's meta tags may show, if there is one. */
export const normalizeOgCardName = (value: string): string | null =>
  value.length > OG_NAME_MAX_LENGTH ? null : normalizeProfileName(value)

/**
 * Decide which card `/og/<segment>.png` draws.
 *
 * An address gets the address card, checksummed the way the design draws it.
 * Anything dotted is meant as a name: one that normalises gets its own card
 * (under its canonical spelling), one that doesn't gets the invalid-name card.
 * Whatever's left isn't name-shaped at all, so it falls back to the app card.
 */
export function getOgCardSubject(segment: string): OgCardSubject {
  const value = segment.replace(/\.png$/, '')

  if (isAddress(value, { strict: false })) {
    return { kind: 'address', address: getAddress(value) }
  }

  if (!value.includes('.')) return { kind: 'generic' }

  const name = normalizeOgCardName(value)

  return name ? { kind: 'name', name } : { kind: 'invalid' }
}
