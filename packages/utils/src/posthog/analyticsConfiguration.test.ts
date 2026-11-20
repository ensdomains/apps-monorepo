import { describe, expect, it } from 'vitest'
import {
  canCaptureAnalytics,
  prepareAnalyticsEvent,
} from './analyticsConfiguration'

describe('analytics environment and URL policy', () => {
  it.each([
    [undefined, false, false, false],
    ['mainnet', true, true, false],
    ['sepolia', true, false, false],
    ['sepolia', true, true, true],
    ['mainnet', false, false, true],
    ['sepolia', false, false, true],
    ['unknown', false, true, false],
  ] as const)(
    'gates network %s development %s debug %s',
    (network, isDevelopment, isDebugEnabled, expected) => {
      expect(
        canCaptureAnalytics({
          network,
          isDevelopment,
          isDebugEnabled,
          projectKey: 'configured-project',
        }),
      ).toBe(expected)
    },
  )
  it('disables capture without a configured project key', () => {
    expect(
      canCaptureAnalytics({
        network: 'sepolia',
        isDevelopment: false,
        isDebugEnabled: true,
      }),
    ).toBe(false)
  })

  it('preserves native metadata and attribution while removing named secrets from the entire event', () => {
    const url =
      'https://preview.example/alice.eth/records?utm_campaign=launch&gclid=click&signature=private#access_token=credential'
    const event = prepareAnalyticsEvent(
      {
        event: '$identify',
        properties: {
          distinct_id: 'anonymous',
          $current_url: url,
          $pathname: '/alice.eth/records',
          title: 'alice.eth',
          $referrer: 'https://search.example/?utm_source=partner',
          $utm_campaign: 'launch',
          gclid: 'click',
          $initial_referring_domain: 'search.example',
          record_type: 'text',
          calldata: 'private',
          authorization: 'Bearer credential',
          diagnostics: {
            error_code: 'user_rejected',
            raw_error: { message: 'private' },
          },
        },
        $set: { intercom_visitor_id: 'visitor', api_key: 'private' },
        $set_once: { $initial_utm_campaign: 'launch', signature: 'private' },
      },
      {
        sourceApp: 'manager',
        environment: {
          network: 'sepolia',
          projectKey: 'staging',
          isDevelopment: false,
          isDebugEnabled: false,
        },
        walletAddress: null,
      },
    )
    expect(event?.properties).toEqual({
      distinct_id: 'anonymous',
      $current_url:
        'https://preview.example/alice.eth/records?utm_campaign=launch&gclid=click&signature=%5Bredacted%5D#access_token=%5Bredacted%5D',
      $pathname: '/alice.eth/records',
      title: 'alice.eth',
      $referrer: 'https://search.example/?utm_source=partner',
      $utm_campaign: 'launch',
      gclid: 'click',
      $initial_referring_domain: 'search.example',
      record_type: 'text',
      diagnostics: { error_code: 'user_rejected' },
      source_app: 'manager',
      environment: 'staging',
      analytics_version: 1,
    })
    expect(event?.$set).toEqual({ intercom_visitor_id: 'visitor' })
    expect(event?.$set_once).toEqual({ $initial_utm_campaign: 'launch' })
  })
  it('keeps exception frames and debug IDs while removing RPC call bodies and named credentials', () => {
    const captured = prepareAnalyticsEvent(
      {
        event: '$exception',
        properties: {
          distinct_id: 'anonymous',
          $exception_list: [
            {
              type: 'ContractFunctionExecutionError',
              value: 'Registration failed\nContract Call:\n calldata=private',
              stacktrace: {
                frames: [
                  {
                    filename: 'https://app.ens.domains/assets/app.js',
                    function: 'submit',
                    lineno: 10,
                    colno: 4,
                    chunk_id: 'debug-id',
                  },
                ],
              },
            },
          ],
          $exception_message:
            'Request failed: https://rpc.example/?access_token=credential Authorization: Bearer private',
        },
      },
      {
        sourceApp: 'manager',
        environment: {
          network: 'sepolia',
          projectKey: 'staging',
          isDevelopment: false,
          isDebugEnabled: false,
        },
        walletAddress: null,
      },
    )
    expect(captured?.properties.$exception_list).toEqual([
      {
        type: 'ContractFunctionExecutionError',
        value: 'Registration failed',
        stacktrace: {
          frames: [
            {
              filename: 'https://app.ens.domains/assets/app.js',
              function: 'submit',
              lineno: 10,
              colno: 4,
              chunk_id: 'debug-id',
            },
          ],
        },
      },
    ])
    expect(JSON.stringify(captured)).not.toMatch(
      /credential|Bearer private|calldata=private/,
    )
  })
})
