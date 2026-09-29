/** @jsxImportSource react */

import type { PersonalNotificationPayloads } from '@ens-apps/shared-schema/notifications'
import { Button, Heading, Link, Text } from '@react-email/components'
import {
  encodeNamePathSegment,
  normalizeNotificationName,
} from '#services/delivery/templates/sanitize.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { EmailLayout } from './EmailLayout.js'

export type NameTransferredPayload =
  PersonalNotificationPayloads['name-transferred']

const buttonStyle = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
}

const NameTransferredEmail = ({
  payload,
  managerAppUrl,
}: {
  payload: NameTransferredPayload
  managerAppUrl: string
}) => {
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
        Transaction:{' '}
        <Link
          href={`https://etherscan.io/tx/${encodeURIComponent(payload.txHash)}`}
        >
          {payload.txHash}
        </Link>
      </Text>
      <Button
        href={new URL(
          `/${encodeNamePathSegment(name)}`,
          managerAppUrl,
        ).toString()}
        style={buttonStyle}
      >
        View name
      </Button>
    </EmailLayout>
  )
}

export const renderNameTransferredEmail = (
  payload: NameTransferredPayload,
  options: { managerAppUrl: string },
): Promise<RenderedEmail> =>
  renderEmail(
    'Domain Transferred',
    <NameTransferredEmail
      payload={payload}
      managerAppUrl={options.managerAppUrl}
    />,
  )
