import {
  type AnalyticsConsent,
  hasAnalyticsConsent,
  notifyAnalyticsConsent,
} from './analyticsConsent'
import { hasMatchingWalletIdentity } from './walletIdentity'

type ConsentTarget = {
  readonly __loaded?: boolean
  get_explicit_consent_status: () => AnalyticsConsent
  get_property: (key: string) => unknown
  opt_in_capturing: (options: { captureEventName: false }) => void
  opt_out_capturing: () => void
  reset: () => void
  set_config: (config: {
    disable_session_recording: boolean
    disable_surveys: boolean
  }) => void
}

export const writeAnalyticsConsent = (
  client: ConsentTarget,
  consent: AnalyticsConsent,
): void => {
  if (consent === 'granted')
    client.opt_in_capturing({ captureEventName: false })
  if (consent === 'denied') client.opt_out_capturing()
}

export const setAnalyticsConsent = (
  client: ConsentTarget,
  granted: boolean,
): void => {
  if (!granted) {
    try {
      client.reset()
    } catch (error) {
      console.warn('[posthog] consent reset failed', error)
    }
  }
  try {
    writeAnalyticsConsent(client, granted ? 'granted' : 'denied')
  } catch (error) {
    console.warn('[posthog] consent update failed', error)
  }
  notifyAnalyticsConsent()
}

export const resetKeepingConsent = (client: ConsentTarget): void => {
  if (!client.__loaded) return
  const consent = client.get_explicit_consent_status()
  client.reset()
  writeAnalyticsConsent(client, consent)
}

export const applyAnalyticsConsent = (client: ConsentTarget): void => {
  const isGranted = hasAnalyticsConsent(client)
  if (!isGranted && client.get_property('$user_state') === 'identified')
    resetKeepingConsent(client)
  client.set_config({
    disable_session_recording: true,
    disable_surveys: !isGranted,
  })
}

type CaptureEnvironment = {
  readonly network?: string
  readonly isDevelopment: boolean
  readonly isDebugEnabled: boolean
  readonly projectKey?: string
}

export const canCaptureAnalytics = (config: CaptureEnvironment): boolean =>
  Boolean(config.projectKey?.trim()) &&
  (config.network === 'mainnet' || config.network === 'sepolia') &&
  (!config.isDevelopment ||
    (config.network === 'sepolia' && config.isDebugEnabled))

const SENSITIVE_FIELDS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'private_key',
  'secret_key',
  'signature',
  'signatures',
  'calldata',
  'raw_error',
  'error',
])

const hasCredentialParameter = (params: URLSearchParams): boolean =>
  [...params.keys()].some((key) => SENSITIVE_FIELDS.has(key.toLowerCase()))

const redactCredentialParameters = (params: URLSearchParams): string =>
  new URLSearchParams(
    [...params].map(([key, value]) => [
      key,
      SENSITIVE_FIELDS.has(key.toLowerCase()) ? '[redacted]' : value,
    ]),
  ).toString()

const redactUrlCredentials = (value: string): string => {
  if (!/^https?:\/\//i.test(value)) return value
  try {
    const url = new URL(value)
    const fragment = new URLSearchParams(url.hash.slice(1))
    const hasFragmentCredentials = hasCredentialParameter(fragment)
    if (
      !url.username &&
      !url.password &&
      !hasCredentialParameter(url.searchParams) &&
      !hasFragmentCredentials
    )
      return value
    const query = url.search
      ? `?${redactCredentialParameters(url.searchParams)}`
      : ''
    const hash = hasFragmentCredentials
      ? `#${redactCredentialParameters(fragment)}`
      : url.hash
    return `${url.origin}${url.pathname}${query}${hash}`
  } catch {
    return value
  }
}

const redactExceptionText = (value: string): string => {
  const message =
    value.split(
      /\b(?:Request body|Raw Call Arguments|Contract Call|Transaction Request|RPC request|Request Arguments):/i,
    )[0] ?? value
  return message
    .trimEnd()
    .replace(/https?:\/\/[^\s"'<>]+/g, redactUrlCredentials)
    .replace(/\bBearer\s+[^\s"',;}]+/gi, 'Bearer [redacted]')
    .replace(
      /(\b(?:authorization|password|access_token|refresh_token|id_token|api_key|private_?key|secret|signature|calldata|callData|data|input)["']?\s*[:=]\s*["']?)[^\s"',;}\]]+/gi,
      '$1[redacted]',
    )
}

const protectAnalyticsValue = (
  value: unknown,
  isException = false,
): unknown => {
  if (typeof value === 'string')
    return isException
      ? redactExceptionText(value)
      : redactUrlCredentials(value)
  if (Array.isArray(value))
    return value.map((item) => protectAnalyticsValue(item, isException))
  if (
    value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
    return protectAnalyticsProperties(
      value as Readonly<Record<string, unknown>>,
      isException,
    )
  return value
}

const protectAnalyticsProperties = (
  properties: Readonly<Record<string, unknown>>,
  isException = false,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => !SENSITIVE_FIELDS.has(key.toLowerCase()))
      .map(([key, value]) => [key, protectAnalyticsValue(value, isException)]),
  )

export const SHARED_POSTHOG_CONFIG = {
  save_campaign_params: true,
  save_referrer: true,
  capture_pageview: 'history_change',
  capture_pageleave: true,
  autocapture: { dom_event_allowlist: ['click'], capture_copied_text: false },
  rageclick: true,
  capture_dead_clicks: false,
  mask_all_text: true,
  mask_all_element_attributes: true,
  capture_exceptions: {
    capture_unhandled_errors: true,
    capture_unhandled_rejections: true,
    capture_console_errors: false,
  },
  disable_session_recording: true,
  disable_surveys: true,
  disable_product_tours: true,
  disable_web_experiments: true,
  disable_conversations: true,
  defaults: '2025-11-30',
  person_profiles: 'identified_only',
  opt_out_capturing_by_default: true,
  opt_out_capturing_persistence_type: 'cookie',
} as const

/** Preserve saved attribution/flag targeting while removing explicitly named credentials. */
export const protectStoredAnalyticsCredentials = (client: {
  readonly get_property: (key: string) => unknown
  readonly register: (properties: Readonly<Record<string, unknown>>) => void
}): void => {
  for (const key of [
    '$initial_person_info',
    '$initial_campaign_params',
    '$initial_referrer_info',
    '$stored_person_properties',
  ]) {
    const value = client.get_property(key)
    if (value && typeof value === 'object')
      client.register({ [key]: protectAnalyticsValue(value) })
  }
}

/** Applies one capture policy to custom and native SDK events. */
export const prepareAnalyticsEvent = <
  Event extends {
    readonly event: string
    readonly properties: Readonly<Record<string, unknown>>
    readonly $set?: Readonly<Record<string, unknown>>
    readonly $set_once?: Readonly<Record<string, unknown>>
  },
>(
  event: Event | null,
  context: {
    readonly sourceApp: 'manager' | 'explorer'
    readonly environment: CaptureEnvironment
    readonly walletAddress: string | null | undefined
  },
):
  | (Omit<Event, 'properties' | '$set' | '$set_once'> & {
      readonly properties: Readonly<Record<string, unknown>>
      readonly $set?: Readonly<Record<string, unknown>>
      readonly $set_once?: Readonly<Record<string, unknown>>
    })
  | null => {
  if (!event || !canCaptureAnalytics(context.environment)) return null
  const identity = event.properties.distinct_id
  if (
    typeof identity !== 'string' ||
    !hasMatchingWalletIdentity(context.walletAddress, identity, event.event)
  )
    return null
  if (event.event === '$autocapture') return null
  return {
    ...event,
    ...(event.$set ? { $set: protectAnalyticsProperties(event.$set) } : {}),
    ...(event.$set_once
      ? { $set_once: protectAnalyticsProperties(event.$set_once) }
      : {}),
    properties: {
      ...protectAnalyticsProperties(
        event.properties,
        event.event === '$exception',
      ),
      source_app: context.sourceApp,
      environment:
        context.environment.network === 'mainnet' ? 'production' : 'staging',
      analytics_version: 1,
    },
  }
}
