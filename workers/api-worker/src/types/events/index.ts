import {
  type NameExpiryStage,
  nameExpiryProtocolSchema,
  nameExpiryStageSchema,
} from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'

const legacyExpiryStageSchema = v.picklist(['30d', '7d', '1d', 'expired'])

const LEGACY_EXPIRY_STAGE_MAP = {
  '30d': 'expiry-30d',
  '7d': 'expiry-7d',
  '1d': 'expiry-1d',
  expired: 'grace-start',
} as const satisfies Record<
  v.InferOutput<typeof legacyExpiryStageSchema>,
  NameExpiryStage
>

export const expiryStageIdSchema = v.pipe(
  v.union([nameExpiryStageSchema, legacyExpiryStageSchema]),
  v.transform((stage): NameExpiryStage => {
    if (stage in LEGACY_EXPIRY_STAGE_MAP) {
      return LEGACY_EXPIRY_STAGE_MAP[
        stage as keyof typeof LEGACY_EXPIRY_STAGE_MAP
      ]
    }

    return stage as NameExpiryStage
  }),
)
export type ExpiryStageId = v.InferOutput<typeof expiryStageIdSchema>

export const expiryEventSchema = v.object({
  type: v.literal('name_expiring'),
  name: v.string(),
  expiryDate: v.number(),
  stage: expiryStageIdSchema,
  // Discovery currently emits v2 only. Default missing protocol so in-flight
  // events from the previous schema still ingest.
  protocol: v.optional(nameExpiryProtocolSchema, 'v2'),
  owner: v.optional(v.string()),
  includeFavorites: v.boolean(),
})

export type ExpiryEvent = v.InferOutput<typeof expiryEventSchema>
