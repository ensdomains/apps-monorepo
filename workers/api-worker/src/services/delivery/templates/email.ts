import type {
  NotificationPayloads,
  SupportedNotifications,
} from '#config/notifications.js'

type EmailTemplate<K extends SupportedNotifications<'email'>> = (
  payload: NotificationPayloads[K],
) => {
  templateId: string
  dynamicData: Record<string, any>
}

export const emailTemplates: {
  [K in SupportedNotifications<'email'>]: EmailTemplate<K>
} = {
  'name-expiry': (payload) => ({
    templateId: 'd-xxxxx',
    dynamicData: {
      name: payload.name,
      expiryDate: new Date(payload.expiryDate).toLocaleDateString(),
    },
  }),

  'name-transferred': (payload) => ({
    templateId: 'd-yyyyy',
    dynamicData: {
      name: payload.name,
      to: payload.to,
      txHash: payload.txHash,
    },
  }),
}
