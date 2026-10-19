/** @jsxImportSource react */

import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { normalizeNotificationName } from '#services/delivery/templates/sanitize.js'
import type { EmailContext } from '../context.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import {
  AppHost,
  EmailDetail,
  EmailLayout,
  EmailParagraph,
} from './EmailLayout.js'

export type NameTransferredPayload =
  PersonalNotificationPayloads['name-transferred']

interface NameTransferredEmailProps {
  readonly context: EmailContext
  readonly payload: NameTransferredPayload
}

const SUBJECT = 'Your name was transferred'

const NameTransferredEmail = ({
  context,
  payload,
}: NameTransferredEmailProps) => {
  const name = normalizeNotificationName(payload.name)
  return (
    <EmailLayout
      context={context}
      preview={`${SUBJECT}: ${name}`}
      heading={SUBJECT}
      name={name}
      action={{
        title: 'Check the name in the ENS app',
        body: (
          <>
            Go to <AppHost context={context} /> in your browser, then search for{' '}
            {name} to see its owner and history.
          </>
        ),
      }}
      reason="you turned on transfer alerts for this name"
    >
      <EmailParagraph>
        {name} has moved to a new owner. If you made this transfer, there’s
        nothing else to do.
      </EmailParagraph>
      <EmailDetail label="New owner" value={payload.to} />
      <EmailDetail label="Transaction" value={payload.txHash} />
    </EmailLayout>
  )
}

export const renderNameTransferredEmail = (
  context: EmailContext,
  payload: NameTransferredPayload,
): Promise<RenderedEmail> =>
  renderEmail(
    context,
    SUBJECT,
    <NameTransferredEmail context={context} payload={payload} />,
  )
