import { describe, expect, it } from 'vitest'
import {
  canCaptureAnalytics,
  getAnalyticsProjectKey,
  sanitizeAnalyticsUrl,
  sanitizeAutomaticProperties,
} from './analyticsConfiguration'

describe('analytics environment and URL policy', () => {
  it('retains known staging origins while redacting names and external hosts', () => {
    expect(
      sanitizeAnalyticsUrl(
        'https://sepolia.app.ens.domains/alice.eth?secret=1',
      ),
    ).toBe('https://sepolia.app.ens.domains/:value')
    expect(
      sanitizeAnalyticsUrl('https://alice.example/alice.eth?secret=1'),
    ).toBe('[external]/:value')
  })

  it.each([
    [undefined, false, false, false],
    ['production', true, true, false],
    ['staging', true, false, false],
    ['staging', true, true, true],
    ['production', false, false, true],
  ] as const)(
    'gates environment %s development %s debug %s',
    (environment, isDevelopment, isDebugEnabled, expected) => {
      expect(
        canCaptureAnalytics({
          environment,
          isDevelopment,
          isDebugEnabled,
          stagingKey: 'staging',
          productionKey: 'production',
        }),
      ).toBe(expected)
    },
  )
  it('never falls back to production for staging or accepts a reused project key', () => {
    expect(
      getAnalyticsProjectKey({
        environment: 'staging',
        productionKey: 'production',
      }),
    ).toBeUndefined()
    expect(
      getAnalyticsProjectKey({
        environment: 'staging',
        productionKey: 'production',
        stagingKey: 'production',
      }),
    ).toBeUndefined()
    expect(
      canCaptureAnalytics({
        environment: 'staging',
        isDevelopment: true,
        isDebugEnabled: true,
        productionKey: 'production',
        stagingKey: 'production',
      }),
    ).toBe(false)
  })

  it('removes names, addresses, queries, fragments and DOM text from automatic capture', () => {
    expect(
      sanitizeAutomaticProperties({
        $current_url:
          'https://app.ens.domains/alice.eth/records?signature=secret#token',
        $pathname: '/0x12345/profile',
        $prev_pageview_current_url:
          'https://app.ens.domains/bob.eth?secret=private',
        $prev_pageview_pathname: '/bob.eth/profile',
        wallet_address: '0x12345',
        address: '0x12345',
        initial_address: '0x12345',
        $referrer: 'https://explorer.ens.domains/bob.eth?utm_campaign=private',
        $title: 'alice.eth',
        $elements_chain: 'private text',
        $utm_campaign: 'private campaign',
        flow_id: 'flow-1',
      }),
    ).toEqual({
      $current_url: 'https://app.ens.domains/:value/records',
      $pathname: '/:value/profile',
      $prev_pageview_current_url: 'https://app.ens.domains/:value',
      $prev_pageview_pathname: '/:value/profile',
      $referrer: 'https://explorer.ens.domains/:value',
      flow_id: 'flow-1',
    })
  })
})
