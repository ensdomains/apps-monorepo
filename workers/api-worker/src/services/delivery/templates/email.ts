import { env } from 'cloudflare:workers'
import { createBignameClient } from '@ens-apps/indexer/bigname'
import type {
  PersonalNotificationPayloads,
  SupportedNotifications,
} from '@ens-apps/shared-schema/notifications'
import { fromSync } from '@ens-apps/utils/neverthrow'
import { getConfig } from '#core/config.js'
import { getEmailContext } from '#services/email/context.js'
import type { RenderedEmail } from '#services/email/render.js'
import { renderNameExpiryEmail } from '#services/email/templates/NameExpiryEmail.js'
import { renderNameTransferredEmail } from '#services/email/templates/NameTransferredEmail.js'
import { readThemeRecord } from '#services/email/theme.js'
import { normalizeNotificationName } from './sanitize.js'

export type EmailTemplate<K extends SupportedNotifications<'email'>> = (
  payload: PersonalNotificationPayloads[K],
) => Promise<RenderedEmail>

// The email header takes the name's profile theme. A network without an
// indexer gets the default theme rather than a failed email.
const readNameTheme = async (name: string): Promise<string | null> => {
  const bignameApi = fromSync(
    () => getConfig(env).endpoints.bignameApi,
    () => null,
  ).unwrapOr(null)
  if (!bignameApi) return null
  return readThemeRecord(
    createBignameClient(bignameApi),
    normalizeNotificationName(name),
  )
}

export const emailTemplates: {
  [K in SupportedNotifications<'email'>]: EmailTemplate<K>
} = {
  'name-expiry': async (payload) =>
    renderNameExpiryEmail(
      getEmailContext(),
      payload,
      { managerAppUrl: env.MANAGER_APP_URL },
      await readNameTheme(payload.name),
    ),

  'name-transferred': async (payload) =>
    renderNameTransferredEmail(
      getEmailContext(),
      payload,
      await readNameTheme(payload.name),
    ),
}
