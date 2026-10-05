// Same build as provider.tsx; see the note there.
import posthog from 'posthog-js/dist/module.full.no-external'
import { isPostHogActive } from './events'

type SurveyOptions = Parameters<typeof posthog.displaySurvey>[1]

let feedbackClient: typeof posthog | undefined

// Survey-only client for users who have telemetry off. Nothing is sent until
// they click Feedback; no cookie, no autocapture, pageviews, replay or flags.
const getFeedbackClient = () => {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  if (!key) return undefined

  feedbackClient ??= posthog.init(
    key,
    {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      persistence: 'memory',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      advanced_disable_flags: true,
      advanced_enable_surveys: true,
      disable_surveys_automatic_display: true,
    },
    'feedback',
  )
  return feedbackClient
}

export const displayFeedbackSurvey = (
  surveyId: string,
  options: SurveyOptions,
): void => {
  try {
    if (isPostHogActive()) {
      posthog.displaySurvey(surveyId, options)
      return
    }

    const client = getFeedbackClient()
    if (!client) return

    // Survey definitions load async, and displaySurvey needs them cached.
    let isShown = false
    let unsubscribe: (() => void) | undefined
    unsubscribe = client.onSurveysLoaded(() => {
      if (isShown) return
      isShown = true
      client.displaySurvey(surveyId, options)
      unsubscribe?.()
    })
  } catch (error) {
    console.warn('[feedback] failed to open survey', error)
  }
}
