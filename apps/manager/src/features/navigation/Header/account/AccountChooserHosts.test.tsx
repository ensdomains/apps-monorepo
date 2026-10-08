import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ChoosePrimaryNameDialog } from '@/features/dashboard/components/ChoosePrimaryNameDialog'
import { render } from '@/utils/test-utils'
import { DesktopAccountSection } from './DesktopAccountSection'
import { MobileAccountDrawer } from './MobileAccountDrawer'

// Keep both real hosts, AccountContent/NavSection, Base UI popover, Vaul drawer,
// and Radix dialog focus scopes. Replace wallet/transaction IO and chooser body,
// not the hosts' scheduling, overlay lifetime, trigger refs or autofocus events.
vi.mock('@/features/wallet/hooks/useConnectedReverseName', () => ({
  useConnectedReverseName: () => ({ data: null, isSuccess: true }),
}))
vi.mock('@posthog/react', () => ({ useFeatureFlagEnabled: () => false }))
vi.mock('./AccountTriggerContent', () => ({
  AccountTriggerContent: () => <span>Account</span>,
}))
vi.mock('../notifications/UnreadBadge', () => ({ UnreadDot: () => null }))
vi.mock('../notifications/NotificationsMenuItem', () => ({
  NotificationsMenuItem: () => null,
}))
vi.mock('./WalletSection', () => ({ WalletSection: () => null }))
vi.mock('./LanguageSection', () => ({ LanguageSection: () => null }))
vi.mock('@/features/dashboard/components/ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: ({
    open,
    onOpenChange,
    onCloseAutoFocus,
  }: ComponentProps<typeof ChoosePrimaryNameDialog>) => (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle>Choose Primary Name</DialogTitle>
        <DialogClose>Cancel chooser</DialogClose>
      </DialogContent>
    </Dialog>
  ),
}))

const renderHost = async (surface: ReactNode) => {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => surface }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe.each([
  { host: 'desktop popover', Host: DesktopAccountSection },
  { host: 'mobile drawer', Host: MobileAccountDrawer },
] as const)('$host chooser handoff', ({ Host }) => {
  it.each([
    'Escape',
    'Cancel',
  ] as const)('survives menu dismissal, then restores its account trigger on %s', async (closeMethod) => {
    await renderHost(<Host />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    trigger.focus()
    fireEvent.click(trigger)
    const action = await screen.findByRole('button', {
      name: 'Primary Name Profile',
    })
    action.focus()
    const accountOverlay = action.closest('[role="dialog"]')

    // Hold only the host's next frame; the actual overlay libraries remain
    // free to finish dismissing. Opening synchronously must fail this check.
    let handoffFrame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementationOnce(
      (callback) => {
        handoffFrame = callback
        return -1
      },
    )
    fireEvent.click(action)
    expect(
      screen.queryByRole('dialog', { name: 'Choose Primary Name' }),
    ).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // Happy DOM does not finish Vaul's CSS exit animation. Deliver its real
    // animation-end event so Radix Presence can unmount the closed drawer.
    if (accountOverlay) {
      fireEvent.animationEnd(accountOverlay, {
        animationName: getComputedStyle(accountOverlay).animationName,
      })
    }
    await waitFor(() => expect(action).not.toBeInTheDocument())
    expect(handoffFrame).toBeDefined()
    if (!handoffFrame)
      throw new Error('Host did not schedule the chooser handoff')
    const frame = handoffFrame
    act(() => frame(performance.now()))

    const chooser = await screen.findByRole('dialog', {
      name: 'Choose Primary Name',
    })
    const cancel = within(chooser).getByRole('button', {
      name: 'Cancel chooser',
    })
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(action).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(chooser).toBeVisible()

    if (closeMethod === 'Escape') {
      fireEvent.keyDown(cancel, { key: 'Escape', code: 'Escape' })
    } else {
      fireEvent.click(cancel)
    }
    await waitFor(() => expect(chooser).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    // The same surviving trigger must remain usable after the handoff.
    fireEvent.click(trigger)
    expect(
      await screen.findByRole('button', { name: 'Primary Name Profile' }),
    ).toBeVisible()
  })
})
