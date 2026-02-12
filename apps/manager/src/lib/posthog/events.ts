import type { FailedRunPayloadV1 } from '@ens-apps/transaction-manager'
import posthog, { type CaptureOptions } from 'posthog-js'

export type PostHogEvents = {
  'wallet:connect': {
    wallet_address: string
    chain_id: number
    wallet_connector: string
  }

  'wallet:disconnect': undefined

  'intercom:booted': undefined

  'tm:failed_run': FailedRunPayloadV1 & {
    source_app: 'manager'
    build_env: string
  }
}

export type PostHogEvent = keyof PostHogEvents

export function track<N extends PostHogEvent>(
  name: N,
  ...args: PostHogEvents[N] extends undefined ? [] : [PostHogEvents[N]]
): void {
  posthog.capture(name, args[0])
}

export function trackWithOptions<N extends PostHogEvent>(
  name: N,
  args: PostHogEvents[N],
  options: CaptureOptions,
): void {
  posthog.capture(name, args, options)
}
