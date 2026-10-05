// Must import from the same module path as provider.tsx — mixing the default
// `posthog-js` build with `module.full.no-external` would bundle PostHog twice
// and run two separate SDK instances. See provider.tsx for why we use this build.
import posthog, {
  type CaptureOptions,
} from 'posthog-js/dist/module.full.no-external'

export type PostHogEvents = {
  'wallet:connect': {
    wallet_address: string
    chain_id: number
    wallet_connector: string
  }

  'wallet:disconnect': undefined

  'intercom:booted': undefined
}

export type PostHogEvent = keyof PostHogEvents

// False until telemetry is enabled (init is skipped) and again after opt-out.
export const isPostHogActive = (): boolean =>
  posthog.__loaded && posthog.is_capturing()

export function track<N extends PostHogEvent>(
  name: N,
  ...args: PostHogEvents[N] extends undefined ? [] : [PostHogEvents[N]]
): void {
  if (!isPostHogActive()) return
  posthog.capture(name, args[0])
}

export function trackWithOptions<N extends PostHogEvent>(
  name: N,
  args: PostHogEvents[N],
  options: CaptureOptions,
): void {
  if (!isPostHogActive()) return
  posthog.capture(name, args, options)
}
