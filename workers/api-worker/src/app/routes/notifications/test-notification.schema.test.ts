import type {
  PersonalNotificationKind,
  PersonalNotificationPayloads,
} from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { testNotificationBodySchema } from './test-notification.schema.js'

const VALID_INPUTS = {
  'name-expiry': {
    kind: 'name-expiry',
    payload: {
      name: 'alice.eth',
      expiryDate: 1_800_000_000_000,
      isOwner: true,
      watchReason: 'owned',
    },
  },
  'name-transferred': {
    kind: 'name-transferred',
    payload: {
      name: 'alice.eth',
      txHash: '0x1234',
      to: '0x0000000000000000000000000000000000000001',
    },
  },
} as const satisfies {
  readonly [K in PersonalNotificationKind]: {
    readonly kind: K
    readonly payload: PersonalNotificationPayloads[K]
  }
}

const VALID_INPUT_LIST = Object.values(VALID_INPUTS)

const MISMATCHED_INPUTS = VALID_INPUT_LIST.flatMap((kindInput) =>
  VALID_INPUT_LIST.filter(
    (payloadInput) => payloadInput.kind !== kindInput.kind,
  ).map((payloadInput) => ({
    kind: kindInput.kind,
    payload: payloadInput.payload,
  })),
)

describe('testNotificationBodySchema', () => {
  it.each(VALID_INPUT_LIST)('accepts $kind with its payload', (input) => {
    expect(v.safeParse(testNotificationBodySchema, input).success).toBe(true)
  })

  it.each(MISMATCHED_INPUTS)(
    'rejects $kind with a mismatched payload %#',
    (input) => {
      expect(v.safeParse(testNotificationBodySchema, input).success).toBe(false)
    },
  )

  it.each([
    { kind: 'blog-post', payload: {} },
    { kind: 'future-kind', payload: {} },
  ])('rejects non-personal or unknown kind $kind', (input) => {
    expect(v.safeParse(testNotificationBodySchema, input).success).toBe(false)
  })

  it.each([null, [], {}, 'name-expiry', 1, true])(
    'rejects malformed JSON body %#',
    (input) => {
      expect(v.safeParse(testNotificationBodySchema, input).success).toBe(false)
    },
  )
})
