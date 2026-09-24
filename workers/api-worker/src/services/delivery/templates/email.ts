import { env } from 'cloudflare:workers'
import type {
  PersonalNotificationPayloads,
  SupportedNotifications,
} from '@ens-apps/shared-schema/notifications'
import { buildNameExpiryEmailContent } from './name-expiry.js'

export type EmailTemplate<K extends SupportedNotifications<'email'>> = (
  payload: PersonalNotificationPayloads[K],
) => {
  templateId: string
  dynamicData: Record<string, unknown>
  subject: string
}

export const emailTemplates: {
  [K in SupportedNotifications<'email'>]: EmailTemplate<K>
} = {
  'name-expiry': (payload) => {
    const content = buildNameExpiryEmailContent(payload, {
      managerAppUrl: env.MANAGER_APP_URL,
    })
    return {
      templateId: env.SENDGRID_TEMPLATE_IDS['name-expiry'],
      ...content,
    }
  },

  'name-transferred': (payload) => ({
    templateId: env.SENDGRID_TEMPLATE_IDS['name-transferred'],
    dynamicData: {
      name: payload.name,
      to: payload.to,
      txHash: payload.txHash,
    },
    subject: 'Domain Transferred',
  }),
}
