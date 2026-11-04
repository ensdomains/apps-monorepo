import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import * as v from 'valibot'

export const testNotificationBodySchema = v.variant('kind', [
  v.object({
    kind: v.literal('name-expiry'),
    payload: notificationDefinitions['name-expiry'].payloadSchema,
  }),
  v.object({
    kind: v.literal('name-transferred'),
    payload: notificationDefinitions['name-transferred'].payloadSchema,
  }),
])
