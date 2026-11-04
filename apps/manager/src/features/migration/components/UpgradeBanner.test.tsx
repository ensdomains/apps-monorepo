import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
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
  useVisibleCommemorativeNftStatus: () => ({
    eligibility: undefined,
    isConfirmedUnclaimed: false,
  }),
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
})

describe('UpgradeBanner Explorer navigation', () => {
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
