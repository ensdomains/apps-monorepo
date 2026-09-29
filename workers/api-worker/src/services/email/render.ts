import { plainTextSelectors, render } from '@react-email/components'
import type { ReactElement } from 'react'

/** Provider-neutral output of a transactional email template. */
export interface RenderedEmail {
  readonly subject: string
  readonly html: string
  readonly text: string
}

// html-to-text upper-cases headings by default; keep the text part literal.
const PLAIN_TEXT_SELECTORS = [
  ...plainTextSelectors,
  { selector: 'h1', options: { uppercase: false } },
  { selector: 'h2', options: { uppercase: false } },
  { selector: 'h3', options: { uppercase: false } },
]

/**
 * Renders a template to the HTML and plain-text parts of an email.
 *
 * Transactional emails are deliberately link-free (no buttons, no URLs), so
 * that a lookalike email carrying a link is easy to recognise as fake.
 */
export const renderEmail = async (
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
  return { subject, html, text }
}
