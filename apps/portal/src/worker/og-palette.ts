/**
 * Colour coding for the OG cards, by the kind of thing the card is about.
 *
 * The explorer already colour-codes entities in the app itself — an
 * `EntityBadge` is blue for a name, green for an address, pink for a contract —
 * and the OG set carries that same coding into the preview so a link reads as
 * "a name" or "a contract" before the page opens (WEB-1265).
 *
 * Values mirror the `--{accent,success,danger,default}-{fill,text}` tokens in
 * `styles/index.css`, as literal hex: satori resolves no CSS variables, so the
 * card markup can only carry the resolved colour. Keep the two in sync.
 */

export type OgEntity = 'address' | 'contract' | 'name' | 'neutral'

export type OgPalette = {
  /** Card background — the tint that identifies the entity kind. */
  readonly background: string
  /** Fill behind the entity chip. */
  readonly chipBackground: string
  /** The entity's own text, inside the chip. */
  readonly chipText: string
  /** Mark, wordmark and the subtitle under the chip. */
  readonly text: string
}

/** Every chip sits on the same neutral-0 fill, whatever the card's tint. */
const CHIP_BACKGROUND = '#ffffff'

/** Mark, wordmark and subtitle ink — `--foreground` / quartz-900. */
const TEXT = '#191919'

const OG_PALETTES = {
  // --success-fill, with the address in message/success/text (#105c23) as the
  // Figma set draws it — a shade darker than the --success-text the app's own
  // address badges use.
  address: { background: '#e8f6ef', chipText: '#105c23' },
  // --danger-fill / --danger-text: resolvers and registries.
  contract: { background: '#fef0f6', chipText: '#e72a96' },
  // --accent-fill / --accent-text.
  name: { background: '#ebf7fd', chipText: '#0082bb' },
  // --default-fill / --default-text: the app card, and anything unresolvable.
  neutral: { background: '#f2f2f2', chipText: '#595755' },
} as const satisfies Record<
  OgEntity,
  Omit<OgPalette, 'chipBackground' | 'text'>
>

/** Palette for a card about `entity`. */
export function getOgPalette(entity: OgEntity): OgPalette {
  return { ...OG_PALETTES[entity], chipBackground: CHIP_BACKGROUND, text: TEXT }
}
