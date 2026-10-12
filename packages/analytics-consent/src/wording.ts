/**
 * The shared wording of the consent banner and the privacy notice. First
 * draft for a lawyer: it states plainly, and only, what the apps do. Each
 * app adds its own usage-events paragraph, since the collected events
 * differ per app.
 */

export const DELETION_EMAIL = 'privacy@ens.domains'

export const consentBanner = {
  text: 'We use PostHog to measure how this app is used. You can accept or decline analytics; the app works the same either way.',
  acceptLabel: 'Accept Analytics',
  declineLabel: 'Decline',
  noticeLinkLabel: 'Privacy notice',
} as const

export const consentChoiceLabels = {
  none: 'You have made no choice yet.',
  accepted: 'Analytics are on.',
  declined: 'Analytics are off.',
} as const

export const analyticsNoticeHeadings = {
  purposes: 'Purposes',
  yourChoice: 'Your choice',
} as const

/**
 * The notice paragraphs in order, with the app's usage-events paragraph
 * slotted in after the first. Rendered as plain text paragraphs.
 */
export const analyticsNoticeParagraphs = (
  usageEventsParagraph: string,
): readonly string[] =>
  [
    'When you choose Accept Analytics, this app sends PostHog, the analytics service that processes data for us, the following: wallet addresses as your identity when a wallet is connected; page visits, including the names and wallet addresses in page addresses; the usage events listed below; and browser details such as browser type, operating system, and screen size.',
    usageEventsParagraph,
    'We use this data to understand how the app is used and to improve it.',
    'PostHog (posthog.com) processes analytics data on our behalf.',
    'If you decline, or have made no choice, the app sends PostHog no usage events and no wallet address, nothing from PostHog is stored on your device, and feature switches are checked anonymously. Everything in the app works the same.',
    `To ask for deletion of your analytics data, email ${DELETION_EMAIL}.`,
  ] as const
