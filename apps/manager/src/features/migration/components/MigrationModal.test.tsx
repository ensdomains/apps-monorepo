import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import type { ClassifiedName } from '../service/classifyNames'

const mocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  useEligibleV1Names: vi.fn(),
  useMigratedNamesCount: vi.fn(),
  useOpenModalOnFirstVisit: vi.fn(),
  useSmartAccountContext: vi.fn(),
}))

vi.mock('@/features/migration/components/GrainOverlay', () => ({
  GrainOverlay: () => <div />,
}))

vi.mock('@/features/migration/components/ProfileCardPreview', () => ({
  ProfileCardPreview: () => <div />,
}))

vi.mock('@/features/migration/components/UpgradeNamesButton', () => ({
  UpgradeNamesButton: () => <button type="button">Upgrade</button>,
}))

vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: mocks.useEligibleV1Names,
}))

vi.mock('@/features/migration/hooks/useMigratedNamesCount', () => ({
  useMigratedNamesCount: mocks.useMigratedNamesCount,
}))

vi.mock('@/features/migration/hooks/useOpenModalOnFirstVisit', () => ({
  useOpenModalOnFirstVisit: mocks.useOpenModalOnFirstVisit,
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))

// eslint-disable-next-line import/first
import { MigrationModal } from './MigrationModal'

const eligibleName = {
  domain: { id: 'alice', name: 'alice.eth' },
} as ClassifiedName

describe('MigrationModal', () => {
  it('does not open from classified fallback names', () => {
    mocks.useSmartAccountContext.mockReturnValue({ isConnected: true })
    mocks.useMigratedNamesCount.mockReturnValue({ data: 0, isPending: false })
    mocks.useOpenModalOnFirstVisit.mockReturnValue({
      open: false,
      dismiss: mocks.dismiss,
    })
    mocks.useEligibleV1Names.mockImplementation(
      (options?: { readonly fallbackToClassified?: boolean }) => ({
        eligible: options?.fallbackToClassified === false ? [] : [eligibleName],
        isPending: false,
      }),
    )

    render(<MigrationModal />)

    expect(mocks.useEligibleV1Names).toHaveBeenCalledWith({
      fallbackToClassified: false,
    })
    expect(mocks.useOpenModalOnFirstVisit).toHaveBeenCalledWith(true, false)
  })
})
