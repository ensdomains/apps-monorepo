import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { createCommemorativeNftPreviewEligibility } from '../commemorative-nft/eligibility.fixture'
import { useVisibleCommemorativeNftStatus } from '../commemorative-nft/useVisibleCommemorativeNftEligibility'
import { makeClassified } from '../service/_fixtures'
import { UpgradeBanner } from './UpgradeBanner'

const getExplorerUrl = vi.hoisted(() => vi.fn<() => string | null>())

vi.mock('@/constants', () => ({
  get EXPLORER_URL() {
    return getExplorerUrl()
  },
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({ isConnected: true }),
}))
vi.mock('../commemorative-nft/useVisibleCommemorativeNftEligibility', () => ({
  useVisibleCommemorativeNftStatus: vi.fn(),
}))
vi.mock('../hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: vi.fn(),
}))
vi.mock('../hooks/useMigratedNamesCount', () => ({
  useMigratedNamesCount: () => ({ data: 0, isPending: false }),
}))

import { useEligibleV1Names } from '../hooks/useEligibleV1Names'

const makeNames = (
  overrides: Partial<ReturnType<typeof useEligibleV1Names>> = {},
): ReturnType<typeof useEligibleV1Names> => ({
  eligible: [makeClassified({ name: '🦊.eth' })],
  eligibilityUpdatedAt: 0,
  gracePeriodNames: [],
  unavailableNames: [],
  blockedSubnames: [],
  verifiedSubnames: [],
  unrecoverableSubnames: [],
  isEligibilityError: false,
  retryEligibility: vi.fn(),
  wrapperSyncNames: [],
  recoveryState: { status: 'none' },
  isPending: false,
  ...overrides,
})

beforeEach(() => {
  getExplorerUrl.mockReturnValue('https://sepolia.explorer.ens.domains')
  vi.mocked(useEligibleV1Names).mockReturnValue(makeNames())
  vi.mocked(useVisibleCommemorativeNftStatus).mockReturnValue({
    eligibility: undefined,
    isConfirmedUnclaimed: false,
  })
})

describe('UpgradeBanner Explorer navigation', () => {
  it.each([true, false])(
    'preserves the profile NFT offer only with visible eligibility (%s)',
    (isEligible) => {
      vi.mocked(useVisibleCommemorativeNftStatus).mockReturnValue({
        eligibility: isEligible
          ? createCommemorativeNftPreviewEligibility({
              ownerAddress: '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF',
            })
          : undefined,
        isConfirmedUnclaimed: isEligible,
      })
      const view = render(<UpgradeBanner profileName="🦊.eth" />)

      expect(view.queryByText(/claim your personalized NFT/) !== null).toBe(
        isEligible,
      )
      expect(view.getByRole('link', { name: 'ENS Explorer' })).toHaveAttribute(
        'href',
        'https://sepolia.explorer.ens.domains/%F0%9F%A6%8A.eth',
      )
    },
  )

  it('opens the profile name in the configured Explorer', () => {
    const view = render(<UpgradeBanner profileName="🦊.eth" />)

    expect(view.getByRole('link', { name: 'ENS Explorer' })).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/%F0%9F%A6%8A.eth',
    )
  })

  it('keeps dashboard guidance separate from profile navigation', () => {
    const view = render(<UpgradeBanner />)

    expect(view.getByText('Welcome to the new ENS app')).toBeInTheDocument()
    expect(view.queryByRole('link', { name: 'ENS Explorer' })).toBeNull()
  })

  it('retains syncing guidance alongside the profile Explorer link', () => {
    vi.mocked(useEligibleV1Names).mockReturnValue(
      makeNames({
        eligible: [],
        wrapperSyncNames: [makeClassified({ name: '🦊.eth' })],
      }),
    )
    const view = render(<UpgradeBanner profileName="🦊.eth" />)

    expect(view.getByRole('button', { name: 'Sync Names' })).toBeInTheDocument()
    expect(view.getByRole('link', { name: 'ENS Explorer' })).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/%F0%9F%A6%8A.eth',
    )
  })

  it('omits Explorer navigation when the network has no deployment', () => {
    getExplorerUrl.mockReturnValue(null)
    const view = render(<UpgradeBanner profileName="🦊.eth" />)

    expect(
      view.getByRole('button', { name: 'Upgrade Names' }),
    ).toBeInTheDocument()
    expect(view.queryByRole('link')).toBeNull()
  })
})
