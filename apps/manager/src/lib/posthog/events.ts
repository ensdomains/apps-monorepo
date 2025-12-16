import posthog from 'posthog-js'

export type PostHogEvents = {
  'wallet:connect': {
    wallet_address: string
    chain_id: number
    wallet_connector: string
  }

  'wallet:disconnect': undefined
}

export type PostHogEvent = keyof PostHogEvents

export function track<N extends PostHogEvent>(
  name: N,
  ...args: PostHogEvents[N] extends undefined ? [] : [PostHogEvents[N]]
): void {
  posthog.capture(name, args[0])
}
