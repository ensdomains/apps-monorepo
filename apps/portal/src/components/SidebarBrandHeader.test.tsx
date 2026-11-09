import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaletteActionsContext } from '@/features/command-palette/context'
import { MobileHeader } from './MobileHeader'
import { SidebarBrandHeader } from './SidebarBrandHeader'
import { Sidebar, SidebarProvider } from './ui/sidebar'

const viewport = vi.hoisted(() => ({ isMobile: false }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.isMobile }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    readonly to: string
    readonly children: ReactNode
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const setup = (isMobile: boolean) => {
  viewport.isMobile = isMobile
  const openPalette = vi.fn(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  render(
    <PaletteActionsContext.Provider
      value={{
        isAvailable: true,
        openPalette,
        closePalette: () => {},
        registerPageCommands: () => () => {},
      }}
    >
      <SidebarProvider>
        {isMobile && <MobileHeader />}
        <Sidebar>
          <SidebarBrandHeader />
        </Sidebar>
      </SidebarProvider>
    </PaletteActionsContext.Provider>,
  )
  return { user: userEvent.setup(), openPalette }
}

beforeEach(() => {
  viewport.isMobile = false
})

describe('palette entry points', () => {
  it('opens unified search from the desktop sidebar', async () => {
    const { user, openPalette } = setup(false)
    await user.click(
      screen.getByRole('button', {
        name: 'Search names, addresses, and actions',
      }),
    )
    expect(openPalette).toHaveBeenCalledTimes(1)
  })

  it('keeps mobile header search available without opening the sidebar', async () => {
    const { user, openPalette } = setup(true)
    await user.click(
      screen.getByRole('button', {
        name: 'Search names, addresses, and actions',
      }),
    )
    expect(openPalette).toHaveBeenCalledTimes(1)
  })

  it('opens search from the mobile sidebar only after its real sheet has exited', async () => {
    const { user, openPalette } = setup(true)
    await user.click(screen.getByRole('button', { name: /Toggle Sidebar$/ }))
    const sidebar = screen.getByRole('dialog', { name: 'Sidebar' })
    await user.click(
      within(sidebar).getByRole('button', {
        name: 'Search names, addresses, and actions',
      }),
    )
    await waitFor(() => expect(openPalette).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Search names, addresses, and actions',
      }),
    ).toBeInTheDocument()
  })
})
