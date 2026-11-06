import {
  type AnalyticsConsent,
  hasAnalyticsConsent,
  invalidateAnalyticsOperations,
  notifyAnalyticsConsent,
  recordAnalyticsConsentChoice,
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
  invalidateAnalyticsOperations()
  try {
    recordAnalyticsConsentChoice()
  } catch (error) {
    console.warn('[posthog] consent generation update failed', error)
  }
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
  invalidateAnalyticsOperations()
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
  readonly environment?: string
  readonly isDevelopment: boolean
  readonly isDebugEnabled: boolean
  readonly stagingKey?: string
  readonly productionKey?: string
}

export const canCaptureAnalytics = (config: CaptureEnvironment): boolean => {
  if (config.environment === 'staging')
    return (
      Boolean(
        config.stagingKey && config.stagingKey !== config.productionKey,
      ) &&
      (!config.isDevelopment || config.isDebugEnabled)
    )
  return config.environment === 'production' && !config.isDevelopment
}

export const getAnalyticsProjectKey = (config: {
  readonly environment?: string
  readonly productionKey?: string
  readonly stagingKey?: string
}): string | undefined =>
  config.environment === 'staging'
    ? config.stagingKey && config.stagingKey !== config.productionKey
      ? config.stagingKey
      : undefined
    : config.productionKey

const STATIC_ROUTE_SEGMENTS = new Set([
  '',
  'dashboard',
  'settings',
  'register',
  'renew',
  'names',
  'name',
  'profile',
  'details',
  'records',
  'subnames',
  'permissions',
  'more',
  'search',
  'favorites',
  'upgrade',
  'upgrade-permissions',
  'notifications',
  'migration',
  'migrate',
  'dnssec-debug',
  'import',
  'sync',
  'resolver',
  'ownership',
  'primary-name',
  'deploy-registry',
  'wrap',
  'unwrap',
  'send',
  'transfer',
  'manage',
  'advanced',
])

export const sanitizeAnalyticsUrl = (value: string): string => {
  try {
    const url = new URL(value)
    const origin = [
      'app.ens.domains',
      'explorer.ens.domains',
      'localhost',
      '127.0.0.1',
    ].includes(url.hostname)
      ? url.origin
      : '[external]'
    return `${origin}${url.pathname
      .split('/')
      .map((segment) =>
        STATIC_ROUTE_SEGMENTS.has(segment) ? segment : ':value',
      )
      .join('/')}`
  } catch {
    return '[redacted]'
  }
}

const sanitizeUrlProperty = (value: unknown): string =>
  typeof value === 'string' ? sanitizeAnalyticsUrl(value) : '[redacted]'

const CAMPAIGN_IDENTIFIERS = new Set([
  'gad_source',
  'mc_cid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'igshid',
  'ttclid',
  'rdt_cid',
  'epik',
  'qclid',
  'sccid',
  'irclid',
  '_kx',
])

export const sanitizeAutomaticProperties = (
  properties: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]) => {
      const attributionKey = key.replace(/^\$(?:session_entry_)?/, '')
      if (
        [
          '$title',
          'title',
          '$elements',
          '$elements_chain',
          '$event_properties',
          '$element_selectors',
          '$el_text',
          'wallet_address',
          'address',
          'initial_address',
          '$set',
          '$set_once',
        ].includes(key)
      )
        return []
      if (key.includes('url') || key.includes('referrer'))
        return [[key, sanitizeUrlProperty(value)]]
      if (key.includes('pathname'))
        return [
          [
            key,
            typeof value === 'string'
              ? sanitizeAnalyticsUrl(`http://localhost${value}`).replace(
                  'http://localhost',
                  '',
                )
              : '[redacted]',
          ],
        ]
      if (
        key.includes('utm_') ||
        CAMPAIGN_IDENTIFIERS.has(attributionKey) ||
        key.startsWith('$initial_') ||
        attributionKey === 'ph_keyword' ||
        attributionKey === 'search_engine' ||
        key.includes('referring_domain')
      )
        return []
      return [[key, value]]
    }),
  )

export const SHARED_POSTHOG_CONFIG = {
  save_campaign_params: false,
  save_referrer: false,
  capture_pageview: 'history_change',
  capture_pageleave: true,
  autocapture: { dom_event_allowlist: ['click'], capture_copied_text: false },
  rageclick: true,
  capture_dead_clicks: false,
  mask_all_text: true,
  mask_all_element_attributes: true,
  capture_exceptions: false,
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

/** Flags read these persisted SDK properties before before_send can filter them. */
export const clearAnalyticsAttribution = (client: {
  readonly unregister: (key: string) => void
  readonly get_property: (key: string) => unknown
  readonly register: (properties: Readonly<Record<string, unknown>>) => void
}): void => {
  for (const key of [
    '$initial_person_info',
    '$initial_campaign_params',
    '$initial_referrer_info',
  ])
    client.unregister(key)
  const properties = client.get_property('$stored_person_properties')
  if (
    properties &&
    typeof properties === 'object' &&
    !Array.isArray(properties)
  )
    client.register({
      $stored_person_properties: sanitizeAutomaticProperties(
        properties as Readonly<Record<string, unknown>>,
      ),
    })
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
  if (event.event === '$autocapture' || event.event === '$exception')
    return null
  return {
    ...event,
    ...(event.$set ? { $set: sanitizeAutomaticProperties(event.$set) } : {}),
    ...(event.$set_once
      ? { $set_once: sanitizeAutomaticProperties(event.$set_once) }
      : {}),
    properties: {
      ...sanitizeAutomaticProperties(event.properties),
      source_app: context.sourceApp,
      environment: context.environment.environment,
      analytics_version: 1,
    },
  }
}
