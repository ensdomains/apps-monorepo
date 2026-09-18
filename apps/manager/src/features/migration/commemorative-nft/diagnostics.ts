import { type PostHogEvents, trackWithOptions } from '@/lib/posthog/events'

type NftEvent = Extract<keyof PostHogEvents, `nft:${string}`>

/** Only bounded categories/counts belong here, never proofs or RPC payloads. */
export const trackNftEvent = <N extends NftEvent>(
  event: N,
  properties: PostHogEvents[N],
): void => {
  // Diagnostics must never interrupt a verified transaction or recovery write.
  try {
    trackWithOptions(event, properties, {})
  } catch {
    // The feature remains usable when analytics is unavailable.
  }
}
