import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useEligibleV1Names: vi.fn(),
  useFeatureFlag: vi.fn(),
  useMigratedNamesCount: vi.fn(),
  useSmartAccountContext: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: mocks.useEligibleV1Names,
}))

vi.mock('@/features/migration/hooks/useMigratedNamesCount', () => ({
  useMigratedNamesCount: mocks.useMigratedNamesCount,
}))

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: mocks.useFeatureFlag,
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))

// eslint-disable-next-line import/first
import { UpgradeBanner } from './UpgradeBanner'

const eligibleName = { domain: { id: 'alice', name: 'alice.eth' } }

describe('UpgradeBanner', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('does not render names from the classified fallback', () => {
    mocks.useFeatureFlag.mockReturnValue(true)
    mocks.useSmartAccountContext.mockReturnValue({ isConnected: true })
    mocks.useMigratedNamesCount.mockReturnValue({ data: 0, isPending: false })
    mocks.useEligibleV1Names.mockImplementation(
      (options?: { readonly fallbackToClassified?: boolean }) => ({
        eligible: options?.fallbackToClassified === false ? [] : [eligibleName],
        isPending: false,
      }),
    )

    const { queryByText } = render(<UpgradeBanner />)

    expect(queryByText('Welcome to the new ENS app')).toBeNull()
    expect(mocks.useEligibleV1Names).toHaveBeenCalledWith({
      enabled: true,
      fallbackToClassified: false,
    })
  })

  it('renders when strict eligibility returns names', () => {
    mocks.useFeatureFlag.mockReturnValue(true)
    mocks.useSmartAccountContext.mockReturnValue({ isConnected: true })
    mocks.useMigratedNamesCount.mockReturnValue({ data: 0, isPending: false })
    mocks.useEligibleV1Names.mockReturnValue({
      eligible: [eligibleName],
      isPending: false,
    })

    const { getByText } = render(<UpgradeBanner />)

    expect(getByText('Welcome to the new ENS app')).toBeInTheDocument()
  })
})
