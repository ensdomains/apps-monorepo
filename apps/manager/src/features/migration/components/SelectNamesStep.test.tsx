import type { GasAffordability } from '@ens-apps/utils/gasAffordability'
import { fireEvent, waitFor } from '@testing-library/react'
import { namehash, zeroHash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlockedSubnameMigration } from '@/features/migration/hooks/useMigrationEligibility'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationGasFundingStatus } from '@/features/migration/hooks/useMigrationGasFunding'
import type { MigrationPlan } from '@/features/migration/service/buildMigrationPlan'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import { render } from '@/utils/test-utils'
import type { GraceRenewalGasEstimateState } from '../hooks/useGraceRenewalGasEstimate'
import type { GraceRenewalQuoteState } from '../hooks/useGraceRenewalQuote'
import { makeDomain, OWNER } from '../service/_fixtures'
import type {
  ClassifiedName,
  CopyClassifiedName,
  IneligibleName,
} from '../service/classifyNames'

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

const eligibilityState = vi.hoisted(() => ({
  blockedSubnames: [] as BlockedSubnameMigration[],
  wrapperSyncNames: [] as ClassifiedName[],
  verifiedSubnames: [] as CopyClassifiedName[],
  recoveryStatus: 'none' as 'none' | 'recovering',
  gracePeriodNames: [] as IneligibleName[],
}))

vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => ({
    eligible: eligibleFixture.filter(
      ({ domain }) =>
        eligibilityState.recoveryStatus !== 'recovering' &&
        !eligibilityState.blockedSubnames.some(
          ({ name }) =>
            domain.name === name.domain.name ||
            domain.name.endsWith(`.${name.domain.name}`),
        ),
    ),
    blockedSubnames: eligibilityState.blockedSubnames,
    gracePeriodNames: eligibilityState.gracePeriodNames,
    unavailableNames: [],
    wrapperSyncNames: eligibilityState.wrapperSyncNames,
    verifiedSubnames: eligibilityState.verifiedSubnames,
    isPending: false,
    recoveryState: { status: eligibilityState.recoveryStatus },
  }),
}))

vi.mock('@/features/wallet/hooks/useConnectedReverseName', () => ({
  useConnectedReverseName: () => ({ data: 'sub1234.eth' }),
}))

vi.mock(
  '../commemorative-nft/useVisibleCommemorativeNftEligibility',
  async () => {
    const { createCommemorativeNftPreviewEligibility } = await import(
      '../commemorative-nft/eligibility.fixture'
    )
    return {
      useVisibleCommemorativeNftStatus: () => ({
        eligibility: createCommemorativeNftPreviewEligibility({
          ownerAddress: OWNER,
        }),
        isConfirmedUnclaimed: true,
      }),
    }
  },
)

const impactState = vi.hoisted(() => ({
  selectionKey: 'fixture-selection',
  status: 'ready',
  impact: { parents: [] as { name: string; affectedCount: number }[] },
}))

vi.mock('@/features/migration/hooks/useSubnameMigrationImpact', () => ({
  useSubnameMigrationImpact: () => impactState,
}))

const wrapperSync = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: null,
}))

vi.mock('@/features/migration/hooks/useWrapperSync', () => ({
  useWrapperSync: () => wrapperSync,
}))

beforeEach(() => {
  wrapperSync.mutate.mockReset()
  eligibilityState.wrapperSyncNames = []
  eligibilityState.verifiedSubnames = []
  impactState.status = 'ready'
  impactState.impact.parents = []
  eligibilityState.blockedSubnames = []
  eligibilityState.recoveryStatus = 'none'
  eligibilityState.gracePeriodNames = []
})

// eslint-disable-next-line import/first
import { SelectNamesStep } from './SelectNamesStep'

const readyGasEstimate: MigrationGasEstimateState = {
  status: 'ready',
  plan: {
    stepDescriptors: [],
    classified: [],
    profiles: new Map(),
  } as unknown as MigrationPlan,
  formattedEth: '0.001',
  gasUnits: 1n,
  feeWei: 1n,
  transactionCount: 1,
}

const renderStep = ({
  gasEstimate = { status: 'idle' } as MigrationGasEstimateState,
  gasAffordability = { status: 'unknown' } as GasAffordability,
  gasFundingStatus = 'settled',
  renewal = { status: 'idle' },
  renewalGasEstimate = { status: 'idle' },
  onNext = vi.fn(),
}: {
  gasEstimate?: MigrationGasEstimateState
  gasAffordability?: GasAffordability
  gasFundingStatus?: MigrationGasFundingStatus
  renewal?: GraceRenewalQuoteState
  renewalGasEstimate?: GraceRenewalGasEstimateState
  onNext?: () => boolean | Promise<boolean>
} = {}) => {
  const onNamesChange = vi.fn<(names: string[]) => void>()
  const onManagerRestorationChange = vi.fn<(names: string[]) => void>()
  const step = (
    estimate: MigrationGasEstimateState,
    renewalState = renewal,
  ) => (
    <SmartAccountContextProvider>
      <SelectNamesStep
        gasAffordability={gasAffordability}
        gasEstimate={estimate}
        gasFundingStatus={gasFundingStatus}
        onManagerRestorationChange={onManagerRestorationChange}
        onNamesChange={onNamesChange}
        onNext={onNext}
        renewal={renewalState}
        renewalGasEstimate={renewalGasEstimate}
      />
    </SmartAccountContextProvider>
  )
  const utils = render(step(gasEstimate))
  return {
    onManagerRestorationChange,
    onNamesChange,
    onNext,
    ...utils,
    rerenderGasEstimate: (estimate: MigrationGasEstimateState) =>
      utils.rerender(step(estimate)),
    rerenderRenewal: (renewalState: GraceRenewalQuoteState) =>
      utils.rerender(step(gasEstimate, renewalState)),
  }
}

describe('SelectNamesStep', () => {
  it('waits for the default impact check before selecting names', () => {
    impactState.status = 'loading'
    const { onNamesChange } = renderStep()
    expect(onNamesChange).not.toHaveBeenCalled()
  })

  it('offers a sync for names whose wrapper expiry is behind the registrar', () => {
    const stale = eligibleFixture[0]
    if (!stale) throw new Error('Missing fixture')
    eligibilityState.wrapperSyncNames = [stale]
    const { getByRole } = renderStep()

    fireEvent.click(getByRole('button', { name: 'Sync names' }))

    expect(wrapperSync.mutate).toHaveBeenCalledOnce()
  })

  it.each([
    ['deeper-subnames', /Upgrading the whole tree is not supported yet/],
  ] as const)(
    'keeps a blocked %s group visible and unavailable for selection',
    (reason, message) => {
      impactState.impact.parents = [{ name: 'sub1234.eth', affectedCount: 1 }]
      const parent = eligibleFixture[0]
      if (!parent) throw new Error('Missing parent fixture')
      eligibilityState.blockedSubnames = [{ name: parent, reason }]
      const { onNamesChange, queryByRole, getByText, rerenderGasEstimate } =
        renderStep()
      const selected = onNamesChange.mock.calls.at(-1)?.[0] ?? []
      expect(selected).not.toContain('sub1234.eth')
      expect(selected).not.toContain('gm.sub1234.eth')
      expect(selected).toContain('one.eth')
      expect(
        queryByRole('checkbox', { name: 'sub1234.eth' }),
      ).not.toBeInTheDocument()
      expect(getByText('sub1234.eth')).toBeInTheDocument()
      expect(getByText(message)).toBeInTheDocument()
      eligibilityState.blockedSubnames = [
        {
          name: parent,
          reason: 'parent-not-upgraded',
          parentName: 'external.eth',
        },
      ]
      rerenderGasEstimate(readyGasEstimate)
      expect(
        queryByRole('checkbox', { name: 'sub1234.eth' }),
      ).not.toBeInTheDocument()
      expect(
        getByText(
          'The parent name external.eth must be upgraded before this subname.',
        ),
      ).toBeInTheDocument()
    },
  )

  it('does not default-select names when impact cannot be checked', () => {
    impactState.status = 'error'
    const { onNamesChange } = renderStep()
    expect(onNamesChange).toHaveBeenLastCalledWith([])
  })

  it('selects eligible names while leaving grace names opt-in at the top', () => {
    const graceName: IneligibleName = {
      domain: makeDomain({
        name: 'renew.eth',
        id: namehash('renew.eth'),
        labelName: 'renew',
      }),
      reason: 'expired-registration',
    }
    eligibilityState.gracePeriodNames = [graceName]
    const renewal: Extract<GraceRenewalQuoteState, { status: 'ready' }> = {
      status: 'ready',
      quote: {
        ownerAddress: OWNER,
        chainId: 1,
        paymentToken: OWNER,
        renewerAddress: OWNER,
        items: [
          {
            domain: graceName.domain,
            label: 'renew',
            registrationExpiry: 0n,
            duration: 604800n,
            targetExpiry: 604800n,
            amount: 1_000_000n,
          },
        ],
        totalAmount: 1_000_000n,
        balance: 0n,
        expiresAt: 4_102_444_800n,
        quotedAtMs: Date.now(),
      },
    }
    const {
      onNamesChange,
      getByText,
      getByRole,
      getAllByRole,
      queryByText,
      rerenderRenewal,
    } = renderStep({
      renewalGasEstimate: {
        status: 'error',
        stage: 'fee',
        reason: 'fee-unavailable',
        cause: new Error('insufficient balance'),
      },
    })
    expect(getByText('sub1234.eth')).toBeInTheDocument()
    expect(getByText('gm.sub1234.eth')).toBeInTheDocument()
    expect(getByText('sub123.eth')).toBeInTheDocument()
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect([...lastCall].sort()).toEqual(
      eligibleFixture.map((item) => item.domain.name).sort(),
    )
    const renewalCheckbox = getByRole('checkbox', { name: 'renew.eth' })
    expect(getAllByRole('checkbox')[0]).toBe(renewalCheckbox)
    expect(renewalCheckbox).not.toBeChecked()
    expect(renewalCheckbox).not.toHaveAccessibleDescription()
    const graceHeading = getByRole('heading', { name: '1 name in grace' })
    const eligibleHeading = getByRole('heading', {
      name: 'All 10 eligible names selected',
    })
    expect(
      graceHeading.compareDocumentPosition(renewalCheckbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(
      renewalCheckbox.compareDocumentPosition(eligibleHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(queryByText(/Not enough USDC/)).not.toBeInTheDocument()
    expect(
      queryByText('Upgrade all names to receive NFT'),
    ).not.toBeInTheDocument()
    const activeCheckbox = getByRole('checkbox', { name: 'sub1234.eth' })
    fireEvent.click(activeCheckbox)
    expect(getByText('Upgrade all names to receive NFT')).toBeInTheDocument()
    fireEvent.click(activeCheckbox)
    expect(
      queryByText('Upgrade all names to receive NFT'),
    ).not.toBeInTheDocument()
    fireEvent.click(renewalCheckbox)
    rerenderRenewal(renewal)
    expect(
      queryByText('Upgrade all names to receive NFT'),
    ).not.toBeInTheDocument()
    expect(renewalCheckbox).toHaveAccessibleDescription(/Not enough USDC/)
    expect(
      getByText(
        /Not enough USDC to renew the selected names/,
      ).compareDocumentPosition(renewalCheckbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(getByText('Not enough USDC to renew')).toHaveAttribute(
      'role',
      'alert',
    )
    expect(getByText('1 USDC')).toBeInTheDocument()
    expect(
      queryByText("Couldn't estimate the network fee"),
    ).not.toBeInTheDocument()
    rerenderRenewal({
      status: 'ready',
      quote: { ...renewal.quote, balance: renewal.quote.totalAmount },
    })
    expect(queryByText(/Not enough USDC/)).not.toBeInTheDocument()
    expect(getAllByRole('checkbox')[0]).toBe(renewalCheckbox)
    rerenderRenewal({
      status: 'ready',
      quote: {
        ...renewal.quote,
        items: renewal.quote.items.map((item) => ({
          ...item,
          duration: 0n,
          amount: 0n,
        })),
        totalAmount: 0n,
      },
    })
    expect(queryByText(/Renewing/)).not.toBeInTheDocument()
    rerenderRenewal({ status: 'loading' })
    expect(queryByText(/Not enough USDC/)).not.toBeInTheDocument()
    rerenderRenewal(renewal)
    fireEvent.click(renewalCheckbox)
    rerenderRenewal({ status: 'idle' })
    expect(queryByText(/Not enough USDC/)).not.toBeInTheDocument()

    eligibilityState.gracePeriodNames = Array.from(
      { length: 15 },
      (_, index) => ({
        ...graceName,
        domain: makeDomain({
          name: `grace${index}.eth`,
          id: namehash(`grace${index}.eth`),
          labelName: `grace${index}`,
        }),
      }),
    )
    rerenderRenewal({ status: 'idle' })
    fireEvent.change(getByRole('textbox', { name: 'Search names' }), {
      target: { value: 'grace' },
    })
    expect(
      queryByText('All 10 eligible names selected'),
    ).not.toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: 'Select all' }))
    expect(getAllByRole('checkbox')).toHaveLength(15)
    for (const checkbox of getAllByRole('checkbox'))
      expect(checkbox).toBeChecked()
    expect(getByRole('button', { name: 'Deselect all' })).toBeInTheDocument()
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

  it('shows verified subnames before fees are ready and enables upgrade after preparation', async () => {
    const parent = makeName('sub1234.eth', 'unwrapped')
    impactState.impact.parents = [
      { name: parent.domain.name, affectedCount: 1 },
    ]
    const child = {
      ...makeName('verified.sub1234.eth', 'registry-child', 'copy'),
      recreationRoot: parent.domain.name,
      tokenHolder: CONTROLLER,
      v1ResolverAddress: '0x00000000000000000000000000000000000000a1',
    } as CopyClassifiedName
    eligibilityState.verifiedSubnames = [child]
    const onNext = vi.fn(async () => true)
    const { getByRole, getByText, queryByRole, rerenderGasEstimate } =
      renderStep({
        gasEstimate: { status: 'loading' },
        gasFundingStatus: 'settled',
        onNext,
      })
    expect(getByText(child.domain.name)).toBeInTheDocument()
    expect(getByRole('checkbox', { name: parent.domain.name })).toBeChecked()
    expect(getByRole('button', { name: 'Estimating...' })).toBeDisabled()

    rerenderGasEstimate({
      ...readyGasEstimate,
      plan: {
        ...readyGasEstimate.plan,
        classified: [parent, child],
        subnameRecreation: {
          version: 5,
          roots: [parent.domain.name],
          names: [parent.domain.name, child.domain.name],
          blockNumber: '123',
          blockHash: zeroHash,
          timestamp: '1792886400',
        },
      },
    })
    const button = getByRole('button', { name: 'Upgrade 10 names' })
    expect(getByRole('checkbox', { name: parent.domain.name })).toBeChecked()
    expect(
      queryByRole('checkbox', {
        name: 'I have reviewed these owners, resolvers and snapshot timing.',
      }),
    ).not.toBeInTheDocument()
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
  })

  it('allows finishing a cleanup-only recovery and retrying if start exits without transitioning', async () => {
    eligibilityState.recoveryStatus = 'recovering'
    const onNext = vi.fn(async () => false)
    const { getByRole } = renderStep({
      gasEstimate: readyGasEstimate,
      onNext,
    })

    const button = getByRole('button', { name: 'Finish upgrade' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(getByRole('button', { name: 'Finish upgrade' })).not.toBeDisabled()
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

  it('warns which names will lose their public key record', () => {
    const { getByRole } = renderStep({
      gasEstimate: {
        ...readyGasEstimate,
        plan: {
          stepDescriptors: [],
          classified: [
            {
              domain: { name: 'status.eth' },
              resolverStrategy: 'to-owned-permres',
            },
          ],
          profiles: new Map([
            [
              namehash('status.eth'),
              { pubkey: { x: `0x${'aa'.repeat(32)}`, y: zeroHash } },
            ],
          ]),
        } as unknown as MigrationPlan,
      },
    })

    expect(getByRole('note')).toHaveTextContent(
      /Public key records can.t be carried over .* for status\.eth\./i,
    )
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

  it('keeps the manager checked by default', () => {
    const { onManagerRestorationChange } = renderStep()
    const lastCall = onManagerRestorationChange.mock.calls.at(-1)?.[0]
    expect(lastCall).toEqual(['managed.eth'])
  })

  it('allows the manager to be unchecked', () => {
    const utils = renderStep()
    const checkbox = managerCheckbox(utils)
    if (!checkbox) throw new Error('manager opt-in not found')

    fireEvent.click(checkbox)

    expect(checkbox).not.toBeChecked()
    expect(utils.onManagerRestorationChange.mock.calls.at(-1)?.[0]).toEqual([])
  })

  it('explains the default manager permission and clears it when unchecked', async () => {
    const utils = renderStep()
    const notice = /requires temporary\s+permission/
    expect(utils.getByText(notice)).toBeInTheDocument()

    const checkbox = managerCheckbox(utils)
    if (!checkbox) throw new Error('manager opt-in not found')
    fireEvent.click(checkbox)

    await waitFor(() =>
      expect(utils.queryByText(notice)).not.toBeInTheDocument(),
    )
  })

  it('withdraws the opt-in when the name is deselected', async () => {
    const utils = renderStep()
    const checkbox = managerCheckbox(utils)
    if (!checkbox) throw new Error('manager opt-in not found')
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
