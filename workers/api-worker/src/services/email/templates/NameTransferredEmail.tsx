/** @jsxImportSource react */

import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { Heading, Text } from '@react-email/components'
import { normalizeNotificationName } from '#services/delivery/templates/sanitize.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { EmailLayout } from './EmailLayout.js'

export type NameTransferredPayload =
  PersonalNotificationPayloads['name-transferred']

interface NameTransferredEmailProps {
  readonly payload: NameTransferredPayload
}

const NameTransferredEmail = ({ payload }: NameTransferredEmailProps) => {
  const name = normalizeNotificationName(payload.name)
  return (
    <EmailLayout preview={`${name} was transferred`}>
      <Heading as="h1">Domain Transferred</Heading>
      <Text>
        Your domain <strong>{name}</strong> has been transferred.
      </Text>
      <Text>
        To: <strong>{payload.to}</strong>
      </Text>
      <Text>
        Transaction: <strong>{payload.txHash}</strong>
      </Text>
      <Text>Open the ENS Manager app to view this name.</Text>
    </EmailLayout>
  )
}

export const renderNameTransferredEmail = (
  payload: NameTransferredPayload,
): Promise<RenderedEmail> =>
  renderEmail('Domain Transferred', <NameTransferredEmail payload={payload} />)
