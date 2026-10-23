/** @jsxImportSource react */

import { MS_PER_DAY, V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import type { ReactNode } from 'react'
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
import { GRACE_THEME_COLOR, resolveThemeColor } from '../theme.js'
import {
  EmailAppSteps,
  type EmailFact,
  EmailFacts,
  EmailLayout,
  EmailParagraph,
  emphasis,
} from './EmailLayout.js'

// The temporary premium after grace falls to the normal price over 21 days
// (PREMIUM_DAYS in the manager's premium chart).
const TEMPORARY_PREMIUM_DAYS = 21

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** "22 Oct 2026, 18:00 UTC": unambiguous for readers in any locale. */
const formatEmailDate = (date: Date): string =>
  `${DATE_TIME_FORMAT.format(date)} UTC`

/** "22 Oct": for subjects and running text, next to a full date in the facts. */
const formatShortDate = (date: Date): string => SHORT_DATE_FORMAT.format(date)

/** Whether the steps lead to renewing, registering, or just looking. */
type NameExpiryAction = 'renew' | 'register' | 'check'

interface NameExpiryCopy {
  readonly subject: string
  readonly heading: string
  readonly body: string
  readonly facts: readonly EmailFact[]
  readonly action: NameExpiryAction
  /** Grace overrides the name's theme, as on the profile page. */
  readonly isInGrace: boolean
}

const AFTER_GRACE: EmailFact = {
  label: 'After that',
  value: 'Anyone can register it',
}

const premiumEndDate = (expiry: NameExpiryDeliveryContext): Date =>
  new Date(expiry.graceEndDate.getTime() + TEMPORARY_PREMIUM_DAYS * MS_PER_DAY)

/**
 * "in 7 days", or "today" for a send that lands on the day itself. Day counts
 * round partial days up, so "1 day" can mean a few hours: never "tomorrow".
 */
const expiresWhen = (days: number): string =>
  days <= 0 ? 'today' : `in ${formatDayCount(days)}`

// A week or less out, the subject counts down; further out, it gives the date.
const expiresInSubject = ({
  name,
  daysUntilExpiry,
  expiryDate,
}: NameExpiryDeliveryContext): string =>
  daysUntilExpiry <= 7
    ? `${name} expires ${expiresWhen(daysUntilExpiry)}`
    : `${name} expires on ${formatShortDate(expiryDate)}`

// Owners want to keep the name; the copy escalates towards the grace deadline.
const getOwnerCopy = (expiry: NameExpiryDeliveryContext): NameExpiryCopy => {
  const { name } = expiry
  const expires = formatEmailDate(expiry.expiryDate)
  const graceEnds = formatEmailDate(expiry.graceEndDate)
  return match(expiry.noticeKind)
    .with('pre-expiry', () => ({
      subject: expiresInSubject(expiry),
      heading: `Your name expires ${expiresWhen(expiry.daysUntilExpiry)}`,
      body: `When ${name} expires it stops resolving, so wallets and apps can’t use it and it can’t be transferred. Renew it before ${expires} to keep it working.`,
      facts: [
        { label: 'Expires', value: expires },
        { label: 'Grace period ends', value: graceEnds, isEmphasized: true },
        AFTER_GRACE,
      ],
      action: 'renew' as const,
      isInGrace: false,
    }))
    .with('grace-start', () => ({
      subject: `${name} has expired`,
      heading: 'Your name has expired',
      body: `${name} has stopped resolving and can’t be transferred. It’s still yours until ${formatShortDate(expiry.graceEndDate)}. Renew it before then and it starts working again.`,
      facts: [
        { label: 'Expired', value: expires },
        { label: 'Renew before', value: graceEnds, isEmphasized: true },
        AFTER_GRACE,
      ],
      action: 'renew' as const,
      isInGrace: true,
    }))
    .with('grace-ending', () => {
      const isLastDay = expiry.daysUntilGraceEnd <= 1
      const daysLeft = formatDayCount(expiry.daysUntilGraceEnd)
      return {
        subject: isLastDay
          ? `Last day to renew ${name}`
          : `${daysLeft} left to renew ${name}`,
        heading: isLastDay
          ? 'Last day to keep your name'
          : `${daysLeft} left to keep your name`,
        body: `${name} isn’t resolving. Renew it before ${graceEnds} to restore it. After that, you lose it and anyone can register it.`,
        facts: [
          { label: 'Expired', value: expires },
          { label: 'Renew before', value: graceEnds, isEmphasized: true },
        ],
        action: 'renew' as const,
        isInGrace: true,
      }
    })
    .with('premium-start', () => ({
      subject: `You no longer own ${name}`,
      heading: 'Your name has been released',
      body: `The grace period for ${name} ended on ${formatShortDate(expiry.graceEndDate)}. Anyone can now register it, including you. It has a temporary premium that falls every day and reaches the normal price on ${formatShortDate(premiumEndDate(expiry))}.`,
      facts: [
        { label: 'Grace period ended', value: graceEnds },
        {
          label: 'Normal price from',
          value: formatEmailDate(premiumEndDate(expiry)),
          isEmphasized: true,
        },
      ],
      action: 'register' as const,
      isInGrace: false,
    }))
    .exhaustive()
}

// Watchers want to know when the name could become theirs, so the copy leads
// with when it opens up rather than when it expires.
const getWatcherCopy = (expiry: NameExpiryDeliveryContext): NameExpiryCopy => {
  const { name } = expiry
  const graceEnds = formatEmailDate(expiry.graceEndDate)
  const premiumEnds = premiumEndDate(expiry)
  const opensUp = `The owner has until ${formatShortDate(expiry.graceEndDate)} to renew it. If they don’t, anyone can register it from then, with a temporary premium that falls to the normal price by ${formatShortDate(premiumEnds)}.`
  const graceFacts: readonly EmailFact[] = [
    { label: 'Expired', value: formatEmailDate(expiry.expiryDate) },
    { label: 'Could be available from', value: graceEnds, isEmphasized: true },
    { label: 'Normal price from', value: formatEmailDate(premiumEnds) },
  ]
  return match(expiry.noticeKind)
    .with('pre-expiry', () => ({
      subject: expiresInSubject(expiry),
      heading: 'A name you watch is expiring',
      body: `If it isn’t renewed, ${name} stops resolving on ${formatShortDate(expiry.expiryDate)} and has a ${V2_GRACE_PERIOD_DAYS}-day grace period, during which only renewal is possible. It could become available on ${formatShortDate(expiry.graceEndDate)}.`,
      facts: [
        { label: 'Expires', value: formatEmailDate(expiry.expiryDate) },
        {
          label: 'Could be available from',
          value: graceEnds,
          isEmphasized: true,
        },
      ],
      action: 'check' as const,
      isInGrace: false,
    }))
    .with('grace-start', () => ({
      subject: `${name} has expired`,
      heading: 'A name you watch has expired',
      body: opensUp,
      facts: graceFacts,
      action: 'check' as const,
      isInGrace: true,
    }))
    .with('grace-ending', () => ({
      subject: `${name} could be available in ${formatDayCount(expiry.daysUntilGraceEnd)}`,
      heading: 'A name you watch may become available',
      body: opensUp,
      facts: graceFacts,
      action: 'check' as const,
      isInGrace: true,
    }))
    .with('premium-start', () => ({
      subject: `${name} is available to register`,
      heading: 'A name you watch is available',
      body: `Anyone can register ${name} now. It has a temporary premium that falls every day and reaches the normal price on ${formatShortDate(premiumEnds)}.`,
      facts: [
        { label: 'Available since', value: graceEnds },
        {
          label: 'Normal price from',
          value: formatEmailDate(premiumEnds),
          isEmphasized: true,
        },
      ],
      action: 'register' as const,
      isInGrace: false,
    }))
    .exhaustive()
}

const getSteps = (
  name: string,
  action: NameExpiryAction,
): { readonly title: string; readonly lastStep: ReactNode } =>
  match(action)
    .with('renew', () => ({
      title: 'How to renew',
      lastStep: (
        <>
          Find {emphasis(name)} and choose {emphasis('Renew')}.
        </>
      ),
    }))
    .with('register', () => ({
      title: 'How to register it',
      lastStep: (
        <>
          Find {emphasis(name)} and choose {emphasis('Register')}.
        </>
      ),
    }))
    .with('check', () => ({
      title: 'How to check on it',
      lastStep: <>Search for {emphasis(name)}.</>,
    }))
    .exhaustive()

interface NameExpiryEmailProps {
  readonly context: EmailContext
  readonly expiry: NameExpiryDeliveryContext
  readonly copy: NameExpiryCopy
  readonly themeColor: string
  readonly isOwner: boolean
}

const NameExpiryEmail = ({
  context,
  expiry,
  copy,
  themeColor,
  isOwner,
}: NameExpiryEmailProps) => {
  const steps = getSteps(expiry.name, copy.action)
  return (
    <EmailLayout
      context={context}
      preview={copy.body}
      heading={copy.heading}
      themeColor={themeColor}
      name={expiry.name}
      reason={
        isOwner ? `you own ${expiry.name}` : `you are watching ${expiry.name}`
      }
    >
      <EmailParagraph>{copy.body}</EmailParagraph>
      <EmailFacts facts={copy.facts} />
      <EmailAppSteps
        context={context}
        title={steps.title}
        lastStep={steps.lastStep}
      />
    </EmailLayout>
  )
}

export const renderNameExpiryEmail = (
  context: EmailContext,
  payload: NameExpiryPayload,
  options: NameExpiryRenderOptions,
  /** The name's `theme` text record, if it could be read. */
  themeRecord: string | null = null,
): Promise<RenderedEmail> => {
  const isOwner = payload.watchReason === 'owned'
  const expiry = buildNameExpiryDeliveryContext(payload, options)
  const copy = isOwner ? getOwnerCopy(expiry) : getWatcherCopy(expiry)
  return renderEmail(
    context,
    copy.subject,
    <NameExpiryEmail
      context={context}
      expiry={expiry}
      copy={copy}
      themeColor={
        copy.isInGrace ? GRACE_THEME_COLOR : resolveThemeColor(themeRecord)
      }
      isOwner={isOwner}
    />,
  )
}
