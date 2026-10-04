import * as v from 'valibot'
import type { NotificationDefinition } from '../types'

export const nameExpiryStageSchema = v.picklist([
  'expiry-30d',
  'expiry-7d',
  'expiry-1d',
  'grace-start',
  'grace-7d',
  'grace-1d',
  'premium-start',
  // A name with no registrar grace, such as a subname, at its expiry.
  'expired',
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

export const nameExpiryNoticeKindSchema = v.picklist([
  'pre-expiry',
  'grace-start',
  'grace-ending',
  'premium-start',
  'expired',
])
export type NameExpiryNoticeKind = v.InferOutput<
  typeof nameExpiryNoticeKindSchema
>

const NAME_EXPIRY_NOTICE_KIND_BY_STAGE = {
  'expiry-30d': 'pre-expiry',
  'expiry-7d': 'pre-expiry',
  'expiry-1d': 'pre-expiry',
  'grace-start': 'grace-start',
  'grace-7d': 'grace-ending',
  'grace-1d': 'grace-ending',
  'premium-start': 'premium-start',
  expired: 'expired',
} as const satisfies Record<NameExpiryStage, NameExpiryNoticeKind>

export const nameExpiryNoticeKindFromStage = (
  stage: NameExpiryStage,
): NameExpiryNoticeKind => NAME_EXPIRY_NOTICE_KIND_BY_STAGE[stage]

export const nameExpiryDefinition = {
  kind: 'name-expiry',
  source: 'personal',
  payloadSchema: v.object({
    name: v.string(),
    expiryDate: v.number(),
    isOwner: v.boolean(),
    watchReason: nameExpiryWatchReasonSchema,
    // Existing beta inbox rows predate lifecycle stages. New writes include it.
    stage: v.optional(nameExpiryStageSchema),
    // Unix ms. An ENSv1 lease's grace is 90 days, ENSv2's 28; rows written
    // before this field fall back to the ENSv2 grace.
    graceEndDate: v.optional(v.number()),
  }),
  metadata: {
    category: 'Domain Lifecycle',
    label: 'Name Expiry',
    description:
      'Get notified when your domains are expiring, in grace, or entering the temporary premium period',
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
