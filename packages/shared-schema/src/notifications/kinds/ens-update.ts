import * as v from 'valibot'
import type { NotificationDefinition } from '../types'

export const ensUpdateDefinition = {
  kind: 'ens-update',
  source: 'broadcast',
  payloadSchema: v.object({
    title: v.string(),
    summary: v.string(),
    url: v.optional(v.string()),
  }),
  metadata: {
    category: 'ENS Updates',
    label: 'ENS Update',
    description: 'Protocol and product updates in dashboard notifications',
    priority: 'medium',
    recommended: true,
    tags: ['updates'],
  },
  delivery: {
    mode: 'none',
    channels: [],
  },
} as const satisfies NotificationDefinition
