import { createFileRoute } from '@tanstack/react-router'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { getFeatureFlag } from '@/lib/posthog/get-feature-flag'

export const Route = createFileRoute('/$name')({
  beforeLoad: async () => {
    const profileViewNewEnabled = await getFeatureFlag({
      data: { flag: POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW },
    })

    return {
      profileViewNewEnabled: profileViewNewEnabled === true,
    }
  },
  params: {
    parse: ({ name }) => {
      if (name.length < 3 || !name.includes('.')) {
        throw new Error('Invalid ENS name')
      }

      return {
        name,
      }
    },
  },
  skipRouteOnParseError: {
    params: true,
    // Prioritize address over names since addresses are more strict.
    priority: 50,
  },
})
