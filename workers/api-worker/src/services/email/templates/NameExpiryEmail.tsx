/** @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import {
  buildNameExpiryDeliveryContext,
  formatCalendarDate,
  formatDayCount,
  type NameExpiryDeliveryContext,
  type NameExpiryPayload,
  type NameExpiryRenderOptions,
} from '#services/delivery/templates/name-expiry.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { EmailLayout } from './EmailLayout.js'

interface NameExpiryCopy {
  readonly subject: string
  readonly body: ReactNode
  readonly action: string
}

interface NameExpiryEmailProps {
  readonly copy: NameExpiryCopy
  readonly isOwner: boolean
}

const RENEW_ACTION = 'Open the ENS Manager app to renew this name.'
const REGISTER_ACTION = 'Open the ENS Manager app to register this name.'

const getNameExpiryCopy = (
  context: NameExpiryDeliveryContext,
): NameExpiryCopy => {
  const name = <strong>{context.name}</strong>
  return match(context.noticeKind)
    .with('pre-expiry', () => ({
      subject: 'Domain expiration alert',
      body: (
        <>
          {name} expires on {formatCalendarDate(context.expiryDate)} (in{' '}
          {formatDayCount(context.daysUntilExpiry)}).
        </>
      ),
      action: RENEW_ACTION,
    }))
    .with('grace-start', () => ({
      subject: 'Domain grace period started',
      body: (
        <>
          {name} has expired but can still be renewed until{' '}
          {formatCalendarDate(context.graceEndDate)}.
        </>
      ),
      action: RENEW_ACTION,
    }))
    .with('grace-ending', () => ({
      subject: 'Domain grace period ending soon',
      body: (
        <>
          The grace period for {name} ends in{' '}
          {formatDayCount(context.daysUntilGraceEnd)} (
          {formatCalendarDate(context.graceEndDate)}). Renew now to keep the
          name.
        </>
      ),
      action: RENEW_ACTION,
    }))
    .with('premium-start', () => ({
      subject: 'Domain grace period ended',
      body: (
        <>
          {name} is no longer in its grace period and has entered the temporary
          premium period.
        </>
      ),
      action: REGISTER_ACTION,
    }))
    .exhaustive()
}

const NameExpiryEmail = ({ copy, isOwner }: NameExpiryEmailProps) => (
  <EmailLayout preview={copy.subject}>
    <Heading as="h1">{copy.subject}</Heading>
    <Text>{copy.body}</Text>
    <Text>{copy.action}</Text>
    <Text>
      {isOwner
        ? 'You are receiving this because you own this name.'
        : 'You are receiving this because you are watching this name.'}
    </Text>
  </EmailLayout>
)

export const renderNameExpiryEmail = (
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
): Promise<RenderedEmail> => {
  const copy = getNameExpiryCopy(
    buildNameExpiryDeliveryContext(payload, options),
  )
  return renderEmail(
    copy.subject,
    <NameExpiryEmail copy={copy} isOwner={payload.watchReason === 'owned'} />,
  )
}
