import { fireEvent, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { NavSection } from './NavSection'

const reverseNameMock = vi.hoisted(() => ({
  data: undefined as string | undefined,
  status: 'success' as 'pending' | 'error' | 'success',
}))

vi.mock('@/features/dashboard/components/ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: () => null,
}))

vi.mock('@/features/wallet/hooks/useConnectedReverseName', () => ({
  useConnectedReverseName: () => ({
    data: reverseNameMock.data,
    isSuccess: reverseNameMock.status === 'success',
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  linkOptions: <T,>(options: T) => options,
  Link: ({
    children,
    to,
    params,
    activeProps: _activeProps,
    inactiveProps: _inactiveProps,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly children: ReactNode
    readonly to: string
    readonly params?: { readonly name?: string }
    readonly activeProps?: unknown
    readonly inactiveProps?: unknown
  }) => (
    <a href={to === '/$name' ? `/${params?.name}` : to} {...props}>
      {children}
    </a>
  ),
}))

describe('NavSection primary name profile action', () => {
  beforeEach(() => {
    reverseNameMock.data = undefined
    reverseNameMock.status = 'success'
  })

  it('is an enabled configuration button when no primary name exists', () => {
    const onChoosePrimaryName = vi.fn()
    render(
      <NavSection
        onAction={() => undefined}
        onChoosePrimaryName={onChoosePrimaryName}
      />,
    )

    const action = screen.getByRole('button', {
      name: 'Primary Name Profile',
    })
    expect(action).toBeEnabled()
    expect(action).toHaveClass('focus-visible:ring-2')
    fireEvent.click(action)
    expect(onChoosePrimaryName).toHaveBeenCalledOnce()
  })

  it.each([
    'pending',
    'error',
  ] as const)('does not offer the chooser while reverse-name state is %s', (status) => {
    reverseNameMock.status = status
    const onChoosePrimaryName = vi.fn()
    const onAction = vi.fn()
    render(
      <NavSection
        onAction={onAction}
        onChoosePrimaryName={onChoosePrimaryName}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Primary Name Profile' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Primary Name Profile'))
    expect(onChoosePrimaryName).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('remains a profile link when a primary name exists', () => {
    reverseNameMock.data = 'alpha.eth'
    render(
      <NavSection
        onAction={() => undefined}
        onChoosePrimaryName={() => undefined}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Primary Name Profile' }),
    ).toHaveAttribute('href', '/alpha.eth')
    expect(
      screen.queryByRole('button', { name: /Primary Name Profile/ }),
    ).toBeNull()
  })
})
