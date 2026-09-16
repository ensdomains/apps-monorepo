import { fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationGasFundingStatus } from '@/features/migration/hooks/useMigrationGasFunding'
import type { MigrationPlan } from '@/features/migration/service/buildMigrationPlan'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import { render } from '@/utils/test-utils'
import type { ClassifiedName } from '../service/classifyNames'

const makeName = (
  fullName: string,
  tokenType: ClassifiedName['tokenType'] | 'unlocked-child',
  action: 'copy' | 'migrate' = 'migrate',
): ClassifiedName => {
  const label = fullName.split('.')[0] ?? fullName
  const parentName = fullName.includes('.')
    ? fullName.split('.').slice(1).join('.')
    : null
  return {
    action,
    ...(action === 'copy'
      ? {
          copySource: 'name-wrapper' as const,
          sourceExpiry: 4_102_444_800n,
        }
      : {}),
    domain: {
      id: fullName,
      name: fullName,
      labelName: label,
    },
    tokenType,
    label,
    parentName,
    fuses: 0,
    tokenHolder: '0x0000000000000000000000000000000000000001',
    v1ResolverAddress: null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
  } as unknown as ClassifiedName
}

const eligibleFixture: readonly ClassifiedName[] = [
  makeName('sub1234.eth', 'unwrapped'),
  makeName('gm.sub1234.eth', 'unlocked-child', 'copy'),
  makeName('sub123.eth', 'unwrapped'),
  makeName('one.eth', 'unwrapped'),
  makeName('two.eth', 'unwrapped'),
  makeName('three.eth', 'unwrapped'),
  makeName('four.eth', 'unwrapped'),
  makeName('five.eth', 'unwrapped'),
  makeName('six.eth', 'unwrapped'),
]

const eligibleState = vi.hoisted(() => ({
  eligible: [] as readonly ClassifiedName[],
  isPending: false,
  recoveryState: { status: 'none' } as
    | { readonly status: 'none' }
    | { readonly status: 'stale'; readonly error: Error },
}))

vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => eligibleState,
}))

// eslint-disable-next-line import/first
import { SelectNamesStep } from './SelectNamesStep'

const readyGasEstimateWithSteps = (
  stepDescriptors: MigrationPlan['stepDescriptors'] = [],
): MigrationGasEstimateState => ({
  status: 'ready',
  plan: { stepDescriptors } as unknown as MigrationPlan,
  formattedEth: '0.001',
  gasUnits: 1n,
  feeWei: 1n,
  transactionCount: stepDescriptors.length,
})

const readyGasEstimate = readyGasEstimateWithSteps()

const renderStep = ({
  gasEstimate = { status: 'idle' } as MigrationGasEstimateState,
  gasFundingStatus = 'settled',
  onNext = vi.fn(),
}: {
  gasEstimate?: MigrationGasEstimateState
  gasFundingStatus?: MigrationGasFundingStatus
  onNext?: () => boolean | Promise<boolean>
} = {}) => {
  const onNamesChange = vi.fn<(names: string[]) => void>()
  const utils = render(
    <SmartAccountContextProvider>
      <SelectNamesStep
        gasEstimate={gasEstimate}
        gasFundingStatus={gasFundingStatus}
        onNamesChange={onNamesChange}
        onNext={onNext}
      />
    </SmartAccountContextProvider>,
  )
  return { onNamesChange, onNext, ...utils }
}

describe('SelectNamesStep', () => {
  beforeEach(() => {
    eligibleState.eligible = eligibleFixture
    eligibleState.isPending = false
    eligibleState.recoveryState = { status: 'none' }
  })

  it('seeds all visible names (parent + subnames + orphans) as selected', () => {
    const { onNamesChange, getByText } = renderStep()
    expect(getByText('sub1234.eth')).toBeInTheDocument()
    expect(getByText('gm.sub1234.eth')).toBeInTheDocument()
    expect(getByText('sub123.eth')).toBeInTheDocument()
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect([...lastCall].sort()).toEqual(
      eligibleFixture.map((item) => item.domain.name).sort(),
    )
  })

  it('unselecting a parent unselects all its subnames', () => {
    const { onNamesChange, getByText } = renderStep()
    const parentRow = getByText('sub1234.eth').closest('button')
    if (!parentRow) throw new Error('parent row not found')
    fireEvent.click(parentRow)
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect(lastCall).not.toContain('sub1234.eth')
    expect(lastCall).not.toContain('gm.sub1234.eth')
    expect(lastCall).toContain('sub123.eth')
  })

  it('re-selecting a parent re-adds all its subnames', () => {
    const { onNamesChange, getByText } = renderStep()
    const parentRow = getByText('sub1234.eth').closest('button')
    if (!parentRow) throw new Error('parent row not found')
    fireEvent.click(parentRow)
    fireEvent.click(parentRow)
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect(lastCall).toContain('sub1234.eth')
    expect(lastCall).toContain('gm.sub1234.eth')
  })

  it('subname rows are not individually interactive', () => {
    const { onNamesChange, getByText } = renderStep()
    const subnameText = getByText('gm.sub1234.eth')
    expect(subnameText.closest('button')).toBeNull()
    const callsBefore = onNamesChange.mock.calls.length
    fireEvent.click(subnameText)
    expect(onNamesChange.mock.calls.length).toBe(callsBefore)
  })

  it('searching a subname keeps the parent visible for context', () => {
    const { getByLabelText, getByText, queryByText } = renderStep()
    const searchInput = getByLabelText('Search names')
    fireEvent.change(searchInput, { target: { value: 'gm' } })
    expect(getByText('gm.sub1234.eth')).toBeInTheDocument()
    expect(getByText('sub1234.eth')).toBeInTheDocument()
    expect(queryByText('sub123.eth')).toBeNull()
  })

  it('shows wallet preparation copy and blocks upgrade while funding is in flight', () => {
    const onNext = vi.fn(async () => true)
    const { getByRole, getByText } = renderStep({
      gasEstimate: readyGasEstimate,
      gasFundingStatus: 'funding',
      onNext,
    })

    expect(getByText('Getting your wallet ready...')).toBeInTheDocument()
    const button = getByRole('button', { name: 'Preparing wallet...' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('enables upgrade once gas funding has settled', () => {
    const { getByRole } = renderStep({
      gasEstimate: readyGasEstimate,
      gasFundingStatus: 'settled',
    })
    expect(getByRole('button', { name: 'Upgrade 9 names' })).not.toBeDisabled()
  })

  it('allows retrying when upgrade start exits without transitioning', async () => {
    const onNext = vi.fn(async () => false)
    const { getByRole } = renderStep({
      gasEstimate: readyGasEstimate,
      onNext,
    })

    const button = getByRole('button', { name: 'Upgrade 9 names' })
    fireEvent.click(button)

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(
        getByRole('button', { name: 'Upgrade 9 names' }),
      ).not.toBeDisabled()
    })
  })

  it('renders loading and estimating copy', () => {
    const { getByRole, getByText } = renderStep({
      gasEstimate: { status: 'loading' },
    })

    expect(getByText('Estimating the network fee...')).toBeInTheDocument()
    expect(getByRole('button', { name: 'Estimating...' })).toBeDisabled()
  })

  it.each([
    [
      'without account detail',
      { status: 'error' } as const,
      "Couldn't estimate the network fee",
    ],
    [
      'with account detail',
      { status: 'error', message: 'Account setup failed' } as const,
      "Couldn't estimate the network fee: Account setup failed",
    ],
  ])('renders the network-fee error $s', (_, gasEstimate, expected) => {
    const { getByText } = renderStep({ gasEstimate })
    expect(getByText(expected)).toBeInTheDocument()
  })

  it('renders the one-name CTA and one-request fee copy', () => {
    eligibleState.eligible = eligibleFixture.slice(3, 4)
    const gasEstimate = readyGasEstimateWithSteps([
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 1,
        migrateCount: 1,
        copyCount: 0,
      },
    ])
    const { getByRole } = renderStep({ gasEstimate })

    expect(getByRole('button', { name: 'Upgrade 1 name' })).not.toBeDisabled()
    const request = getByRole('button', { name: '1 request' })
    expect(request.closest('p')).toHaveTextContent(
      "Estimated network fee: ~0.001 ETH. You'll approve 1 request.",
    )
    expect(request.closest('p')).toHaveTextContent(
      'Your wallet shows the final fee before you approve.',
    )
  })

  it('renders the many-request fee copy', () => {
    const descriptor = {
      type: 'deploy-hca' as const,
    }
    const gasEstimate = readyGasEstimateWithSteps([
      descriptor,
      { type: 'approval', approvalId: 'base-registrar:hca' },
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 9,
        migrateCount: 9,
        copyCount: 0,
      },
    ])
    const { getByRole } = renderStep({ gasEstimate })

    const request = getByRole('button', { name: '3 requests' })
    expect(request.closest('p')).toHaveTextContent(
      "Estimated network fee: ~0.001 ETH. You'll approve 3 requests.",
    )
  })

  it('shows the kept starting label while the upgrade starts', async () => {
    const onNext = vi.fn(() => new Promise<boolean>(() => undefined))
    const { getByRole } = renderStep({
      gasEstimate: readyGasEstimate,
      onNext,
    })

    fireEvent.click(getByRole('button', { name: 'Upgrade 9 names' }))

    await waitFor(() =>
      expect(getByRole('button', { name: 'Starting...' })).toBeDisabled(),
    )
  })

  it('renders the approved stale saved-state notice and keeps upgrade disabled', () => {
    eligibleState.recoveryState = {
      status: 'stale',
      error: new Error('stale recovery'),
    }
    const { getByRole, getByText } = renderStep({
      gasEstimate: readyGasEstimate,
    })

    expect(getByRole('alert')).toBeInTheDocument()
    expect(getByText('Your saved upgrade needs attention')).toBeInTheDocument()
    expect(
      getByText(
        "Something about your names changed since you last tried, so we can't safely pick up where you left off.",
      ),
    ).toBeInTheDocument()
    expect(
      getByText(
        'Nothing has been lost. Contact ENS support before trying again.',
      ),
    ).toBeInTheDocument()
    expect(getByRole('button', { name: 'Upgrade 9 names' })).toBeDisabled()
  })

  it('keeps the uncited selection helper unchanged', () => {
    const { getByText } = renderStep()
    expect(
      getByText(
        'Your names, text records, and addresses will be carried over during the upgrade',
      ),
    ).toBeInTheDocument()
  })
})
