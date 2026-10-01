import { env } from 'cloudflare:workers'
import type {
  PersonalNotificationPayloads,
  SupportedNotifications,
} from '@ens-apps/shared-schema/notifications'
import type { RenderedEmail } from '#services/email/render.js'
import { renderNameExpiryEmail } from '#services/email/templates/NameExpiryEmail.js'
import { renderNameTransferredEmail } from '#services/email/templates/NameTransferredEmail.js'

export type EmailTemplate<K extends SupportedNotifications<'email'>> = (
  payload: PersonalNotificationPayloads[K],
) => Promise<RenderedEmail>

export const emailTemplates: {
  [K in SupportedNotifications<'email'>]: EmailTemplate<K>
} = {
  'name-expiry': (payload) =>
    renderNameExpiryEmail(payload, { managerAppUrl: env.MANAGER_APP_URL }),

  'name-transferred': (payload) => renderNameTransferredEmail(payload),
}
