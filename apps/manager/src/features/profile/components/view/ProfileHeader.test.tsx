import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileHeader } from './ProfileHeader'

describe('ProfileHeader', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the default Lapis background when no profile theme is set', () => {
    render(
      <ProfileHeader
        avatarLoading={false}
        name="example.eth"
        records={newEmptyProfileRecords()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'example.eth' }).parentElement,
    ).toHaveClass('bg-[var(--theme-color,var(--color-ens-lapis-500))]')
  })

  it('keeps the mobile About section clear of the profile actions', () => {
    render(
      <ProfileHeader
        avatarLoading={false}
        name="example.eth"
        records={newEmptyProfileRecords()}
      />,
    )

    const aboutContainer = screen
      .getByRole('heading', { name: 'About' })
      .closest('section')?.parentElement

    expect(aboutContainer).toHaveClass('mt-29', 'lg:landscape:mt-0')
  })

  it('shows the full description when the two-line preview overflows', () => {
    const description = 'A detailed profile description. '.repeat(12).trim()
    let measuredScrollHeight = 40
    let notifyResize = () => {}
    const scrollHeight = Object.getOwnPropertyDescriptor(
      HTMLParagraphElement.prototype,
      'scrollHeight',
    )
    const clientHeight = Object.getOwnPropertyDescriptor(
      HTMLParagraphElement.prototype,
      'clientHeight',
    )

    Object.defineProperty(HTMLParagraphElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => measuredScrollHeight,
    })
    Object.defineProperty(HTMLParagraphElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 40,
    })
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          notifyResize = () => callback([], this as unknown as ResizeObserver)
        }
        observe() {}
        disconnect() {}
      },
    )

    try {
      render(
        <ProfileHeader
          avatarLoading={false}
          name="example.eth"
          records={{
            ...newEmptyProfileRecords(),
            base: { description },
          }}
        />,
      )

      expect(screen.getByText(description, { selector: 'p' })).toHaveClass(
        'line-clamp-2',
      )
      expect(
        screen.queryByRole('button', { name: 'Show more' }),
      ).not.toBeInTheDocument()

      measuredScrollHeight = 72
      act(() => notifyResize())
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }))

      expect(
        within(screen.getByRole('dialog')).getByText(description),
      ).toBeVisible()
    } finally {
      if (scrollHeight) {
        Object.defineProperty(
          HTMLParagraphElement.prototype,
          'scrollHeight',
          scrollHeight,
        )
      } else {
        Reflect.deleteProperty(HTMLParagraphElement.prototype, 'scrollHeight')
      }
      if (clientHeight) {
        Object.defineProperty(
          HTMLParagraphElement.prototype,
          'clientHeight',
          clientHeight,
        )
      } else {
        Reflect.deleteProperty(HTMLParagraphElement.prototype, 'clientHeight')
      }
    }
  })
})
