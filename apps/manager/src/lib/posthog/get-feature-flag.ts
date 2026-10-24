import { ANALYTICS_CONSENT_COOKIE } from '@ens-apps/utils/posthog/analyticsConsent'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { PostHog } from 'posthog-node'
import { isAddress } from 'viem'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'

type PostHogFeatureFlag =
  (typeof POSTHOG_FEATURE_FLAGS)[keyof typeof POSTHOG_FEATURE_FLAGS]

type FeatureFlagInput = {
  flag: PostHogFeatureFlag
}

const POSTHOG_REQUEST_TIMEOUT_MS = 1000
const KNOWN_FEATURE_FLAGS = new Set<string>(
  Object.values(POSTHOG_FEATURE_FLAGS),
)

const validateFeatureFlagInput = (input: unknown): FeatureFlagInput => {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('flag' in input) ||
    typeof input.flag !== 'string' ||
    !KNOWN_FEATURE_FLAGS.has(input.flag)
  ) {
    throw new Error('Invalid PostHog feature flag')
  }

  return { flag: input.flag as PostHogFeatureFlag }
}

export const getFeatureFlag = createServerFn({ method: 'GET' })
  .validator(validateFeatureFlagInput)
  .handler(async ({ data }): Promise<boolean | null> => {
    const walletAddress = getConnectionCookie()

    if (!walletAddress || !isAddress(walletAddress)) return null

    const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

    if (!apiKey || !host) return null

    const posthog = new PostHog(apiKey, {
      flushAt: 1,
      flushInterval: 0,
      host,
      requestTimeout: POSTHOG_REQUEST_TIMEOUT_MS,
    })

    try {
      // The address only feeds the flag's wallet rules, and only once the
      // visitor accepted analytics (PostHog writes 1 to its consent cookie).
      // A throwaway id keeps this server check from naming the visitor.
      const hasConsent = getCookie(ANALYTICS_CONSENT_COOKIE) === '1'
      const enabled = await posthog.isFeatureEnabled(
        data.flag,
        crypto.randomUUID(),
        {
          ...(hasConsent
            ? { personProperties: { address: walletAddress } }
            : {}),
          sendFeatureFlagEvents: false,
        },
      )

      // PostHog omits disabled boolean flags from a successful /flags response,
      // which the Node SDK exposes as undefined.
      return enabled ?? false
    } catch (error) {
      console.warn('[posthog] Feature flag evaluation failed', {
        error,
        flag: data.flag,
      })
      return null
    } finally {
      posthog.shutdown(100)
    }
  })
