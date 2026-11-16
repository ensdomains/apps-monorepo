import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { FaqSection } from './FaqSection'

describe('FaqSection', () => {
  it('renders the support-docs link with the updated copy, href and target', () => {
    const { getByText } = render(<FaqSection />)

    const link = getByText('Need more help? Visit ENS Support Docs').closest(
      'a',
    )

    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', 'https://support.ens.domains')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('places the support-docs link after the FAQ items in DOM order', () => {
    const { getByText } = render(<FaqSection />)

    const lastFaqItem = getByText('How can I secure my ENS name?')
    const link = getByText('Need more help? Visit ENS Support Docs').closest(
      'a',
    )

    expect(link).not.toBeNull()
    // The link node must come *after* the last FAQ item in document order.
    expect(
      lastFaqItem.compareDocumentPosition(link as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('renders the link-out (ExternalLink) icon inside the link, not ArrowRight', () => {
    const { getByText, container } = render(<FaqSection />)

    const link = getByText('Need more help? Visit ENS Support Docs').closest(
      'a',
    )

    expect(link).not.toBeNull()
    // The ticket requires swapping ArrowRight for the link-out ExternalLink icon.
    // lucide-react tags each icon svg with a `lucide-<kebab-name>` class.
    expect(link?.querySelector('.lucide-external-link')).not.toBeNull()
    expect(container.querySelector('.lucide-arrow-right')).toBeNull()
  })

  describe('linked question', () => {
    const SUBNAME_QUESTION = 'What happens to subnames when I upgrade?'
    const SUBNAME_ANSWER = /Supported direct subnames/
    const SECURE_QUESTION = 'How can I secure my ENS name?'
    const SECURE_ANSWER = /Keep ownership in a cold wallet/

    // jsdom has no scrollIntoView, so record which element was scrolled to.
    const scrollIntoView = vi.fn<(this: Element) => void>()
    beforeEach(() => {
      scrollIntoView.mockReset()
      Element.prototype.scrollIntoView = scrollIntoView
    })
    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    })

    const scrolledIds = () =>
      scrollIntoView.mock.contexts.map((element) => element.id)

    it('opens and scrolls to the linked question only', () => {
      const { getByText, queryByText } = render(
        <FaqSection linkedQuestionId="subname-upgrades" />,
      )

      expect(getByText(SUBNAME_ANSWER)).toBeVisible()
      expect(queryByText(SECURE_ANSWER)).toBeNull()
      expect(scrolledIds()).toEqual(['subname-upgrades'])
    })

    it('keeps every answer closed and does not scroll without a link', () => {
      const { queryByText } = render(<FaqSection />)

      expect(queryByText(SUBNAME_ANSWER)).toBeNull()
      expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it('opens and scrolls to a newly linked question when the hash changes', () => {
      const { getByText, rerender } = render(
        <FaqSection linkedQuestionId="subname-upgrades" />,
      )

      rerender(<FaqSection linkedQuestionId="secure-name" />)

      expect(getByText(SECURE_ANSWER)).toBeVisible()
      expect(scrolledIds()).toEqual(['subname-upgrades', 'secure-name'])
    })

    it('lets the user close the linked question and open others', () => {
      const { getByText, queryByText } = render(
        <FaqSection linkedQuestionId="subname-upgrades" />,
      )

      fireEvent.click(getByText(SUBNAME_QUESTION))
      fireEvent.click(getByText(SECURE_QUESTION))

      expect(queryByText(SUBNAME_ANSWER)).toBeNull()
      expect(getByText(SECURE_ANSWER)).toBeVisible()
    })
  })
})
