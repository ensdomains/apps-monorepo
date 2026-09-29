import { plainTextSelectors, render } from '@react-email/components'
import type { ReactElement } from 'react'

/** Provider-neutral output of a transactional email template. */
export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

// html-to-text upper-cases headings by default; keep the text part literal.
const plainTextOptions = {
  plainText: true as const,
  htmlToTextOptions: {
    selectors: [
      ...plainTextSelectors,
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } },
      { selector: 'h3', options: { uppercase: false } },
    ],
  },
}

export const renderEmail = async (
  subject: string,
  element: ReactElement,
): Promise<RenderedEmail> => {
  const [html, text] = await Promise.all([
    render(element),
    render(element, plainTextOptions),
  ])
  return { subject, html, text }
}
