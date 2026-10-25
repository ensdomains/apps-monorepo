/** @jsxImportSource react */

import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { normalizeNotificationName } from '#services/delivery/templates/sanitize.js'
import type { EmailContext } from '../context.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { resolveThemeColor } from '../theme.js'
import {
  EmailFacts,
  EmailLayout,
  EmailParagraph,
  EmailWarning,
} from './EmailLayout.js'

export type NameTransferredPayload =
  PersonalNotificationPayloads['name-transferred']

interface NameTransferredEmailProps {
  readonly context: EmailContext
  readonly payload: NameTransferredPayload
  readonly themeColor: string
}

const NameTransferredEmail = ({
  context,
  payload,
  themeColor,
}: NameTransferredEmailProps) => {
  const name = normalizeNotificationName(payload.name)
  return (
    <EmailLayout
      context={context}
      preview={`${name} has moved to a new owner.`}
      heading="Your name was transferred"
      themeColor={themeColor}
      name={name}
      reason={`you turned on transfer alerts for ${name}`}
    >
      <EmailParagraph>
        {name} has moved to a new owner. If you made this transfer, there’s
        nothing else to do.
      </EmailParagraph>
      {/* Full values, never shortened: shortened addresses are what
          address-poisoning scams imitate. */}
      <EmailFacts
        isStacked
        facts={[
          { label: 'New owner', value: payload.to, isMono: true },
          { label: 'Transaction', value: payload.txHash, isMono: true },
        ]}
      />
      <EmailWarning title="Didn’t make this transfer?">
        ENS can’t reverse it. Your wallet may be compromised, so move what’s
        left in it to a new wallet. Anyone who offers to recover the name for
        you is running a scam.
      </EmailWarning>
    </EmailLayout>
  )
}

export const renderNameTransferredEmail = (
  context: EmailContext,
  payload: NameTransferredPayload,
  /** The name's `theme` text record, if it could be read. */
  themeRecord: string | null = null,
): Promise<RenderedEmail> => {
  const name = normalizeNotificationName(payload.name)
  return renderEmail(
    context,
    `${name} was transferred`,
    <NameTransferredEmail
      context={context}
      payload={payload}
      themeColor={resolveThemeColor(themeRecord)}
    />,
  )
}
