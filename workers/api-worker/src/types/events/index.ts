import {
  type NameExpiryStage,
  nameExpiryStageSchema,
} from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'

export const expiryStageIdSchema = nameExpiryStageSchema
export type ExpiryStageId = v.InferOutput<typeof expiryStageIdSchema>

export const EXPIRY_STAGE_IDS = [
  'expiry-30d',
  'expiry-7d',
  'expiry-1d',
  'grace-start',
  'grace-7d',
  'grace-1d',
  'premium-start',
] as const satisfies readonly NameExpiryStage[]

export const expiryEventSchema = v.object({
  type: v.literal('name_expiring'),
  name: v.string(),
  /** Unix seconds: the registration's own expiry (the lease date for ENSv1). */
  expiryDate: v.number(),
  /**
   * Unix seconds: end of the renewal grace. Optional so messages queued before
   * it existed still parse; those render with the ENSv2 grace.
   */
  graceEndDate: v.optional(v.number()),
  stage: expiryStageIdSchema,
  owner: v.optional(v.string()),
  includeFavorites: v.boolean(),
})

export type ExpiryEvent = v.InferOutput<typeof expiryEventSchema>
