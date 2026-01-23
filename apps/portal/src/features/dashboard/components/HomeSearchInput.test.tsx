import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HomeSearchInput } from './HomeSearchInput'

// Mock dependencies
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}))

vi.mock('@/hooks/useDebounce', () => ({
  useDebouncedValue: (value: string) => value,
}))

const { useIsMobile } = await import('@/hooks/use-mobile')

describe('HomeSearchInput', () => {
  describe('Address Suggestions', () => {
    it('should truncate address label on mobile', async () => {
      vi.mocked(useIsMobile).mockReturnValue(true)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, '0x205d2686da3bf33f64c17f21462c51b5ead462cf')

      await waitFor(() => {
        // Should show truncated address: "0x205d...62CF"
        expect(screen.getByText(/0x205d.*62CF/)).toBeInTheDocument()
        // Should NOT show full address
        expect(
          screen.queryByText('0x205d2686da3bf33f64c17f21462c51b5ead462cf'),
        ).not.toBeInTheDocument()
      })
    })

    it('should show full address label on desktop', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, '0x205d2686da3bf33f64c17f21462c51b5ead462cf')

      await waitFor(() => {
        // Should show full checksummed address
        expect(
          screen.getByText('0x205d2686da3Bf33f64C17f21462c51B5eaD462CF'),
        ).toBeInTheDocument()
      })
    })

    it('should create address suggestion with correct format', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, '0x205d2686da3bf33f64c17f21462c51b5ead462cf')

      await waitFor(() => {
        // Should show checksum address (note: mixed case due to EIP-55 checksumming)
        expect(
          screen.getByText('0x205d2686da3Bf33f64C17f21462c51B5eaD462CF'),
        ).toBeInTheDocument()
        // Should show description
        expect(screen.getByText('View address details')).toBeInTheDocument()
      })
    })

    it('should handle invalid addresses gracefully', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      // Type invalid address (too short)
      await user.type(input, '0x123')

      await waitFor(() => {
        // Should show ENS name suggestion instead
        expect(screen.getByText('0x123.eth')).toBeInTheDocument()
      })
    })
  })

  describe('ENS Name Suggestions', () => {
    it('should NOT truncate normal ENS names on mobile', async () => {
      vi.mocked(useIsMobile).mockReturnValue(true)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, 'vitalik.eth')

      await waitFor(() => {
        // Should show full name (not truncated)
        expect(screen.getByText('vitalik.eth')).toBeInTheDocument()
      })
    })

    it('should NOT truncate ENS names starting with 0x but not being addresses on mobile', async () => {
      vi.mocked(useIsMobile).mockReturnValue(true)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      // Type a name that starts with "0x" but is too short to be an address
      await user.type(input, '0xdev')

      await waitFor(() => {
        // Should show full name, NOT truncated (only 5 chars, not 42)
        expect(screen.getByText('0xdev.eth')).toBeInTheDocument()
        expect(screen.queryByText(/0xde…/)).not.toBeInTheDocument()
      })
    })

    it('should auto-append .eth suffix to ENS names', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, 'vitalik')

      await waitFor(() => {
        // Should show name with .eth suffix
        expect(screen.getByText('vitalik.eth')).toBeInTheDocument()
        expect(screen.getByText('View ENS name details')).toBeInTheDocument()
      })
    })

    it('should create ENS name suggestion with correct format', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, 'nick.eth')

      await waitFor(() => {
        // Should show ENS name
        expect(screen.getByText('nick.eth')).toBeInTheDocument()
        // Should show description
        expect(screen.getByText('View ENS name details')).toBeInTheDocument()
      })
    })
  })

  describe('Suggestion List Behavior', () => {
    it('should show ONLY address suggestion (not ENS name) for valid addresses', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, '0x205d2686da3bf33f64c17f21462c51b5ead462cf')

      await waitFor(() => {
        // Should show address suggestion
        expect(screen.getByText('View address details')).toBeInTheDocument()
        // Should NOT show ENS name suggestion
        expect(
          screen.queryByText('View ENS name details'),
        ).not.toBeInTheDocument()
      })
    })

    it('should not show suggestions when input is empty', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)

      render(<HomeSearchInput />)

      // Input is empty, should not show any suggestions
      expect(screen.queryByText('View address details')).not.toBeInTheDocument()
      expect(
        screen.queryByText('View ENS name details'),
      ).not.toBeInTheDocument()
    })

    it('should update suggestions when input changes', async () => {
      vi.mocked(useIsMobile).mockReturnValue(false)
      const user = userEvent.setup()

      render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, 'vitalik')

      await waitFor(() => {
        expect(screen.getByText('vitalik.eth')).toBeInTheDocument()
      })

      // Clear and type new value
      await user.clear(input)
      await user.type(input, 'nick')

      await waitFor(() => {
        expect(screen.getByText('nick.eth')).toBeInTheDocument()
        expect(screen.queryByText('vitalik.eth')).not.toBeInTheDocument()
      })
    })
  })

  describe('Mobile vs Desktop Consistency', () => {
    it('should show only address suggestion for addresses on both mobile and desktop', async () => {
      const testAddress = '0x205d2686da3bf33f64c17f21462c51b5ead462cf'
      const user = userEvent.setup()

      // Test mobile
      vi.mocked(useIsMobile).mockReturnValue(true)
      const { unmount } = render(<HomeSearchInput />)

      const input = screen.getByPlaceholderText('Search name or address...')
      await user.click(input)
      await user.type(input, testAddress)

      await waitFor(() => {
        expect(screen.getByText('View address details')).toBeInTheDocument()
        expect(
          screen.queryByText('View ENS name details'),
        ).not.toBeInTheDocument()
      })

      unmount()

      // Test desktop
      vi.mocked(useIsMobile).mockReturnValue(false)
      render(<HomeSearchInput />)

      const desktopInput = screen.getByPlaceholderText(
        'Search name or address...',
      )
      await user.click(desktopInput)
      await user.type(desktopInput, testAddress)

      await waitFor(() => {
        // Same descriptions should appear - only address
        expect(screen.getByText('View address details')).toBeInTheDocument()
        expect(
          screen.queryByText('View ENS name details'),
        ).not.toBeInTheDocument()
      })
    })
  })
})
