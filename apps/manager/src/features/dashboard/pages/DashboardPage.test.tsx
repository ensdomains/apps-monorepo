import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { useReducedMotion } from 'motion/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSmartAccountContext } from '@/lib/smart-account'
import { DashboardPage } from './DashboardPage'

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}))

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
  useReducedMotion: vi.fn(),
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: vi.fn(),
}))

vi.mock('@/features/dashboard/components/ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: () => null,
}))

vi.mock('@/features/dashboard/components/DashboardGraceBanner', () => ({
  DashboardGraceBanner: () => null,
}))

vi.mock('@/features/dashboard/components/EducationCarousel', () => ({
  EducationCarousel: () => null,
}))

vi.mock('@/features/dashboard/components/FaqSection', () => ({
  FaqSection: () => null,
}))

vi.mock('@/features/dashboard/components/NamesTable', () => ({
  NamesTable: () => null,
}))

vi.mock('@/features/dashboard/components/PrimaryNameCard', () => ({
  PrimaryNameCard: () => null,
}))

vi.mock('@/features/migration/components/MigrationModal', () => ({
  MigrationModal: () => null,
}))

vi.mock('@/features/migration/components/MigrationProgressBanner', () => ({
  MigrationProgressBanner: () => null,
}))

vi.mock('@/features/migration/components/UpgradeBanner', () => ({
  UpgradeBanner: () => null,
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useFeatureFlagEnabled).mockReturnValue(true)
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never)
    vi.mocked(useReducedMotion).mockReturnValue(false)
    vi.mocked(useSmartAccountContext).mockReturnValue({
      ownerAddress: '0x1111111111111111111111111111111111111111',
    } as never)
  })

  it('waits while migration access is unresolved', () => {
    vi.mocked(
      useFeatureFlagEnabled as (flag: string) => boolean | undefined,
    ).mockReturnValue(undefined)

    render(<DashboardPage />)

    expect(screen.getByTestId('dashboard-loading-spinner')).not.toBeNull()
  })
})
