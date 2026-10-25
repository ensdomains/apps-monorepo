import { plainTextSelectors, render } from '@react-email/components'
import type { ReactElement } from 'react'
import { type EmailContext, isTestnet, networkLabel } from './context.js'
import { TEXT_COLUMNS_CLASS } from './templates/EmailLayout.js'

/** Provider-neutral output of a transactional email template. */
export interface RenderedEmail {
  readonly subject: string
  /** Display name of the sender, so testnet mail is told apart in the inbox. */
  readonly fromName: string
  readonly html: string
  readonly text: string
}

// html-to-text upper-cases headings by default; keep the text part literal.
const PLAIN_TEXT_SELECTORS = [
  ...plainTextSelectors,
  { selector: 'h1', options: { uppercase: false } },
  { selector: 'h2', options: { uppercase: false } },
  { selector: 'h3', options: { uppercase: false } },
  {
    selector: `table.${TEXT_COLUMNS_CLASS}`,
    format: 'dataTable',
    options: {
      colSpacing: 2,
      maxColumnWidth: 200,
      uppercaseHeaderCells: false,
    },
  },
]

/**
 * Renders a template to the HTML and plain-text parts of an email.
 *
 * Transactional emails are deliberately link-free (no buttons, no URLs), so
 * that a lookalike email carrying a link is easy to recognise as fake.
 * Testnet emails are marked in the subject and sender name.
 */
export const renderEmail = async (
  context: EmailContext,
  subject: string,
  element: ReactElement,
): Promise<RenderedEmail> => {
  const [html, text] = await Promise.all([
    render(element),
    render(element, {
      plainText: true,
      htmlToTextOptions: { selectors: PLAIN_TEXT_SELECTORS },
    }),
  ])
  if (!isTestnet(context)) return { subject, fromName: 'ENS', html, text }
  const label = networkLabel(context)
  return {
    subject: `[${label}] ${subject}`,
    fromName: `ENS (${label})`,
    html,
    text,
  }
}
