/** @jsxImportSource react */
import { Button, Heading, Text } from '@react-email/components'
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

const buttonStyle = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
}

const nameExpiryCopy = (context: NameExpiryDeliveryContext) => {
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
      buttonText: 'Renew name',
      url: context.renewUrl,
    }))
    .with('grace-start', () => ({
      subject: 'Domain grace period started',
      body: (
        <>
          {name} has expired but can still be renewed until{' '}
          {formatCalendarDate(context.graceEndDate)}.
        </>
      ),
      buttonText: 'Renew name',
      url: context.renewUrl,
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
      buttonText: 'Renew name',
      url: context.renewUrl,
    }))
    .with('premium-start', () => ({
      subject: 'Domain grace period ended',
      body: (
        <>
          {name} is no longer in its grace period and has entered the temporary
          premium period.
        </>
      ),
      buttonText: 'Register name',
      url: context.registerUrl,
    }))
    .exhaustive()
}

const NameExpiryEmail = ({
  context,
  isOwner,
}: {
  context: NameExpiryDeliveryContext
  isOwner: boolean
}) => {
  const copy = nameExpiryCopy(context)
  return (
    <EmailLayout preview={copy.subject}>
      <Heading as="h1">{copy.subject}</Heading>
      <Text>{copy.body}</Text>
      <Button href={copy.url} style={buttonStyle}>
        {copy.buttonText}
      </Button>
      <Text>
        {isOwner
          ? 'You are receiving this because you own this name.'
          : 'You are receiving this because you are watching this name.'}
      </Text>
    </EmailLayout>
  )
}

export const renderNameExpiryEmail = (
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
): Promise<RenderedEmail> => {
  const context = buildNameExpiryDeliveryContext(payload, options)
  return renderEmail(
    nameExpiryCopy(context).subject,
    <NameExpiryEmail
      context={context}
      isOwner={payload.watchReason === 'owned'}
    />,
  )
}
