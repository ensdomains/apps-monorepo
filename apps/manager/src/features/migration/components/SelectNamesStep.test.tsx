import type { GasAffordability } from '@ens-apps/utils/gasAffordability'
import { fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationGasFundingStatus } from '@/features/migration/hooks/useMigrationGasFunding'
import type { MigrationPlan } from '@/features/migration/service/buildMigrationPlan'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import { render } from '@/utils/test-utils'
import type { ClassifiedName } from '../service/classifyNames'

const CONTROLLER = '0x00000000000000000000000000000000000000c1'

const makeName = (
  fullName: string,
  tokenType: ClassifiedName['tokenType'] | 'unlocked-child',
  action: 'copy' | 'migrate' = 'migrate',
  registryController: string | null = null,
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
    registryController,
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
  makeName('managed.eth', 'unwrapped', 'migrate', CONTROLLER),
]

vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => ({
    eligible: eligibleFixture,
    gracePeriodNames: [],
    unavailableNames: [],
    isPending: false,
    recoveryState: { status: 'none' },
  }),
}))

vi.mock('@/features/wallet/hooks/useConnectedReverseName', () => ({
  useConnectedReverseName: () => ({ data: 'sub1234.eth' }),
}))

// eslint-disable-next-line import/first
import { SelectNamesStep } from './SelectNamesStep'

const readyGasEstimate: MigrationGasEstimateState = {
  status: 'ready',
  plan: { stepDescriptors: [] } as unknown as MigrationPlan,
  formattedEth: '0.001',
  gasUnits: 1n,
  feeWei: 1n,
  transactionCount: 1,
}

const renderStep = ({
  gasEstimate = { status: 'idle' } as MigrationGasEstimateState,
  gasAffordability = { status: 'unknown' } as GasAffordability,
  gasFundingStatus = 'settled',
  onNext = vi.fn(),
}: {
  gasEstimate?: MigrationGasEstimateState
  gasAffordability?: GasAffordability
  gasFundingStatus?: MigrationGasFundingStatus
  onNext?: () => boolean | Promise<boolean>
} = {}) => {
  const onNamesChange = vi.fn<(names: string[]) => void>()
  const onManagerRestorationChange = vi.fn<(names: string[]) => void>()
  const utils = render(
    <SmartAccountContextProvider>
      <SelectNamesStep
        gasAffordability={gasAffordability}
        gasEstimate={gasEstimate}
        gasFundingStatus={gasFundingStatus}
        onManagerRestorationChange={onManagerRestorationChange}
        onNamesChange={onNamesChange}
        onNext={onNext}
      />
    </SmartAccountContextProvider>,
  )
  return { onManagerRestorationChange, onNamesChange, onNext, ...utils }
}

describe('SelectNamesStep', () => {
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
    const { onNamesChange, getByRole } = renderStep()
    const parentRow = getByRole('checkbox', { name: 'sub1234.eth' })
    fireEvent.click(parentRow)
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect(lastCall).not.toContain('sub1234.eth')
    expect(lastCall).not.toContain('gm.sub1234.eth')
    expect(lastCall).toContain('sub123.eth')
  })

  it('subname rows are not individually interactive', () => {
    const { onNamesChange, getByText, queryByRole } = renderStep()
    const subnameText = getByText('gm.sub1234.eth')
    expect(
      queryByRole('checkbox', { name: 'gm.sub1234.eth' }),
    ).not.toBeInTheDocument()
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

  it('blocks upgrade while gas funding is still in flight', () => {
    const onNext = vi.fn(async () => true)
    const { getByRole } = renderStep({
      gasEstimate: readyGasEstimate,
      gasFundingStatus: 'funding',
      onNext,
    })

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
    expect(getByRole('button', { name: 'Upgrade 10 names' })).not.toBeDisabled()
  })

  it('allows retrying when upgrade start exits without transitioning', async () => {
    const onNext = vi.fn(async () => false)
    const { getByRole } = renderStep({
      gasEstimate: readyGasEstimate,
      onNext,
    })

    const button = getByRole('button', { name: 'Upgrade 10 names' })
    fireEvent.click(button)

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(
        getByRole('button', { name: 'Upgrade 10 names' }),
      ).not.toBeDisabled()
    })
  })

  it('warns instead of quoting a fee when the wallet is short of gas', () => {
    const { getByText, queryByText } = renderStep({
      gasEstimate: readyGasEstimate,
      gasAffordability: {
        status: 'short',
        requiredWei: 5_000_000_000_000_000n,
        balanceWei: 1_000_000_000_000_000n,
        shortfallWei: 4_000_000_000_000_000n,
      },
    })

    expect(getByText(/Not enough ETH for gas/i)).toBeInTheDocument()
    // The fee quote would read as "you can proceed", so it must not also show.
    expect(queryByText(/Estimated network fee/i)).not.toBeInTheDocument()
  })

  it('keeps the fee in the requests dialog when the balance cannot be read', () => {
    // An unreadable balance is not evidence the user cannot pay.
    const { getByRole, queryByText } = renderStep({
      gasEstimate: readyGasEstimate,
      gasAffordability: { status: 'unknown' },
    })

    expect(queryByText(/Not enough ETH for gas/i)).not.toBeInTheDocument()
    expect(queryByText(/Estimated network fee/i)).not.toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: '1 request' }))
    expect(getByRole('dialog')).toHaveTextContent('Estimated network fee')
    expect(getByRole('dialog')).toHaveTextContent('~0.001 ETH')
  })
})

describe('SelectNamesStep manager restoration (WEB-1528)', () => {
  /** The opt-in sits inside the only label titled with the manager address. */
  const managerCheckbox = (utils: ReturnType<typeof renderStep>) =>
    utils
      .getByTitle(CONTROLLER)
      .querySelector<HTMLInputElement>('input[type="checkbox"]')

  /** Each row selects through a visually-hidden checkbox named after the name. */
  const rowCheckbox = (utils: ReturnType<typeof renderStep>, name: string) =>
    utils.container.querySelector<HTMLInputElement>(
      `input[aria-label="${name}"]`,
    )

  it('offers the opt-in only for a name whose v1 controller differs from its registrant', () => {
    const utils = renderStep()

    expect(utils.getAllByTitle(CONTROLLER)).toHaveLength(1)
    expect(managerCheckbox(utils)).toBeInTheDocument()
  })

  it('shows the address that would gain control, truncated', () => {
    const { getByTitle } = renderStep()
    expect(getByTitle(CONTROLLER)).toBeInTheDocument()
  })

  it('reports nothing to restore until the owner opts in', () => {
    const { onManagerRestorationChange } = renderStep()
    const lastCall = onManagerRestorationChange.mock.calls.at(-1)?.[0]
    expect(lastCall ?? []).toEqual([])
  })

  it('reports the opted-in name once the checkbox is ticked', () => {
    const utils = renderStep()
    const checkbox = managerCheckbox(utils)
    if (!checkbox) throw new Error('manager opt-in not found')

    fireEvent.click(checkbox)

    expect(utils.onManagerRestorationChange.mock.calls.at(-1)?.[0]).toEqual([
      'managed.eth',
    ])
  })

  it('explains the temporary permission only once a name is opted in', async () => {
    const utils = renderStep()
    const notice = /requires temporary\s+permission/
    expect(utils.queryByText(notice)).not.toBeInTheDocument()

    const checkbox = managerCheckbox(utils)
    if (!checkbox) throw new Error('manager opt-in not found')
    fireEvent.click(checkbox)

    await waitFor(() => expect(utils.getByText(notice)).toBeInTheDocument())
  })

  it('withdraws the opt-in when the name is deselected', async () => {
    const utils = renderStep()
    const checkbox = managerCheckbox(utils)
    if (!checkbox) throw new Error('manager opt-in not found')
    fireEvent.click(checkbox)

    const row = rowCheckbox(utils, 'managed.eth')
    if (!row) throw new Error('name row not found')
    fireEvent.click(row)

    await waitFor(() =>
      expect(utils.onManagerRestorationChange.mock.calls.at(-1)?.[0]).toEqual(
        [],
      ),
    )
  })
})
