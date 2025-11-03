import type {
  NotificationPayloads,
  SupportedNotifications,
} from '#config/notifications.js'

type EmailTemplate<K extends SupportedNotifications<'email'>> = (
  payload: NotificationPayloads[K],
) => {
  templateId: string
  dynamicData: Record<string, any>
  subject: string
}

export const emailTemplates: {
  [K in SupportedNotifications<'email'>]: EmailTemplate<K>
} = {
  'name-expiry': (payload) => ({
    templateId: 'd-54bbff22769e41c6b219adf894bbe100',
    dynamicData: {
      name: payload.name,
      expiryDate: new Date(payload.expiryDate).toLocaleDateString(),
      isOwner: payload.isOwner,
    },
    subject: 'Domain Expiration Alert',
  }),

  'name-transferred': (payload) => ({
    templateId: 'd-yyyyy',
    dynamicData: {
      name: payload.name,
      to: payload.to,
      txHash: payload.txHash,
    },
    subject: 'Domain Transferred',
  }),
}
