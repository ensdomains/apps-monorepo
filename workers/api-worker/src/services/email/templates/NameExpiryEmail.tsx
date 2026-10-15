/** @jsxImportSource react */
import { match } from 'ts-pattern'
import {
  buildNameExpiryDeliveryContext,
  formatDayCount,
  type NameExpiryDeliveryContext,
  type NameExpiryPayload,
  type NameExpiryRenderOptions,
} from '#services/delivery/templates/name-expiry.js'
import type { EmailContext } from '../context.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import {
  AppHost,
  EmailDetail,
  EmailLayout,
  EmailParagraph,
} from './EmailLayout.js'

interface NameExpiryCopy {
  readonly subject: string
  readonly heading: string
  readonly body: string
  readonly details: readonly { label: string; value: string }[]
  readonly actionTitle: string
}

interface NameExpiryEmailProps {
  readonly context: EmailContext
  readonly expiry: NameExpiryDeliveryContext
  readonly copy: NameExpiryCopy
  readonly isOwner: boolean
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

/** "22 Oct 2026, 18:00 UTC": unambiguous for readers in any locale. */
export const formatEmailDate = (date: Date): string =>
  `${DATE_FORMAT.format(date)} UTC`

const getNameExpiryCopy = (
  expiry: NameExpiryDeliveryContext,
  isOwner: boolean,
): NameExpiryCopy => {
  const { name } = expiry
  const graceDetails = [
    {
      label: 'Grace period ends in',
      value: formatDayCount(expiry.daysUntilGraceEnd),
    },
    {
      label: 'Grace period end date',
      value: formatEmailDate(expiry.graceEndDate),
    },
  ]
  return match(expiry.noticeKind)
    .with('pre-expiry', () => ({
      subject: isOwner
        ? 'Your name is expiring'
        : 'A name you watch is expiring',
      heading: isOwner
        ? 'Your name is expiring'
        : 'A name you watch is expiring',
      body: isOwner
        ? `Renew ${name} before it expires to keep ownership and avoid temporary premiums after expiry.`
        : `${name} expires soon. If it isn’t renewed, it enters a grace period and then becomes available for anyone to register.`,
      details: [
        { label: 'Expires in', value: formatDayCount(expiry.daysUntilExpiry) },
        { label: 'Expiry date', value: formatEmailDate(expiry.expiryDate) },
      ],
      actionTitle: 'Renew in the ENS app',
    }))
    .with('grace-start', () => ({
      subject: 'Your name has expired',
      heading: 'Your name has expired',
      body: `${name} has expired, but you can still renew it during the grace period. After that, anyone can register it.`,
      details: graceDetails,
      actionTitle: 'Renew in the ENS app',
    }))
    .with('grace-ending', () => ({
      subject: 'Your name’s grace period is ending',
      heading: 'Grace period ending',
      body: `${name} has expired. You can still renew it until the grace period ends. After that, anyone can register it.`,
      details: graceDetails,
      actionTitle: 'Renew in the ENS app',
    }))
    .with('premium-start', () => ({
      subject: 'Your name’s grace period has ended',
      heading: 'Grace period ended',
      body: `${name} is out of its grace period. Anyone can now register it, at a temporary premium that falls each day.`,
      details: [
        {
          label: 'Grace period ended',
          value: formatEmailDate(expiry.graceEndDate),
        },
      ],
      actionTitle: 'Register in the ENS app',
    }))
    .exhaustive()
}

const NameExpiryEmail = ({
  context,
  expiry,
  copy,
  isOwner,
}: NameExpiryEmailProps) => (
  <EmailLayout
    context={context}
    preview={`${copy.subject}: ${expiry.name}`}
    heading={copy.heading}
    name={expiry.name}
    action={{
      title: copy.actionTitle,
      body: (
        <>
          Go to <AppHost context={context} /> in your browser, then search for{' '}
          {expiry.name}.
        </>
      ),
    }}
    reason={isOwner ? 'you own this name' : 'you are watching this name'}
  >
    <EmailParagraph>{copy.body}</EmailParagraph>
    {copy.details.map((detail) => (
      <EmailDetail key={detail.label} {...detail} />
    ))}
  </EmailLayout>
)

export const renderNameExpiryEmail = (
  context: EmailContext,
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
): Promise<RenderedEmail> => {
  const isOwner = payload.watchReason === 'owned'
  const expiry = buildNameExpiryDeliveryContext(payload, options)
  const copy = getNameExpiryCopy(expiry, isOwner)
  return renderEmail(
    context,
    copy.subject,
    <NameExpiryEmail
      context={context}
      expiry={expiry}
      copy={copy}
      isOwner={isOwner}
    />,
  )
}
