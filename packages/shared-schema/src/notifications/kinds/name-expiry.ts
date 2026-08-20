import * as v from 'valibot'
import type { NotificationDefinition } from '../types'

export const nameExpiryProtocolSchema = v.picklist(['v1', 'v2'])
export type NameExpiryProtocol = v.InferOutput<typeof nameExpiryProtocolSchema>

export const nameExpiryStageSchema = v.picklist([
  'expiry-30d',
  'expiry-7d',
  'expiry-1d',
  'grace-start',
  'grace-7d',
  'grace-1d',
  'premium-start',
])
export type NameExpiryStage = v.InferOutput<typeof nameExpiryStageSchema>

export const nameExpiryWatchReasonSchema = v.picklist([
  'owned',
  'favourited',
  'manual',
])
export type NameExpiryWatchReason = v.InferOutput<
  typeof nameExpiryWatchReasonSchema
>

export const nameExpiryDefinition = {
  kind: 'name-expiry',
  source: 'personal',
  payloadSchema: v.object({
    name: v.string(),
    expiryDate: v.number(),
    watchReason: nameExpiryWatchReasonSchema,
    // Optional so existing inbox rows (pre-lifecycle-stages) still parse.
    // New writes always include both; do not default missing protocol to v2.
    protocol: v.optional(nameExpiryProtocolSchema),
    stage: v.optional(nameExpiryStageSchema),
    // Legacy field kept optional so stored records that used isOwner still parse.
    isOwner: v.optional(v.boolean()),
  }),
  metadata: {
    category: 'Domain Lifecycle',
    label: 'Name Expiry',
    description: 'Get notified when your domains are about to expire',
    priority: 'high',
    recommended: true,
    thresholds: [30, 7, 1],
    tags: ['expiry'],
  },
  delivery: {
    mode: 'opt-in',
    channels: ['email', 'telegram', 'push'],
    preferenceKey: 'watchBasedNameExpiry',
  },
} as const satisfies NotificationDefinition
