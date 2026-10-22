/** PostHog boolean flag whose payload carries the notice banner per app and chain. */
export const NOTICE_BANNER_FLAG = 'notice-banner'

export type NoticeBannerApp = 'manager' | 'explorer'

export const NOTICE_BANNER_VARIANTS = [
  'info',
  'warning',
  'danger',
  'success',
] as const
export type NoticeBannerVariant = (typeof NOTICE_BANNER_VARIANTS)[number]

const DEFAULT_VARIANT: NoticeBannerVariant = 'warning'

export type NoticeBanner = {
  readonly message: string
  readonly variant: NoticeBannerVariant
  /** Changes with any part of the entry, so a dismissal only covers this exact notice. */
  readonly id: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isVariant = (value: unknown): value is NoticeBannerVariant =>
  NOTICE_BANNER_VARIANTS.includes(value as NoticeBannerVariant)

/** The banner for one app on one chain, or null when the payload has none. */
export const readNoticeBanner = (
  payload: unknown,
  target: { readonly app: NoticeBannerApp; readonly chainId: number },
): NoticeBanner | null => {
  if (!isRecord(payload)) return null
  const byChain = payload[target.app]
  if (!isRecord(byChain)) return null
  const entry = byChain[String(target.chainId)]
  if (!isRecord(entry)) return null
  const { message, variant } = entry
  if (typeof message !== 'string' || message.trim() === '') return null
  const resolvedVariant = isVariant(variant) ? variant : DEFAULT_VARIANT
  return {
    message: message.trim(),
    variant: resolvedVariant,
    id: `${target.app}/${target.chainId}/${resolvedVariant}/${message.trim()}`,
  }
}
