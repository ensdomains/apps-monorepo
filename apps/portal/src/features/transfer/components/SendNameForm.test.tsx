import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import type { TransferControls } from '../hooks/useTransferName'
import type {
  RegistryDetachImpact,
  TransferDetachTargets,
  TransferRoleRevocations,
} from '../types'
import { SendNameForm } from './SendNameForm'

// The modal needs the TransactionManager provider and renders nothing for an
// empty transaction list; the form's gating is what's under test.
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: () => null,
}))

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const REGISTRY = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address

/** Every option has something to detach, so the form offers all three. */
const ALL_TARGETS: TransferDetachTargets = {
  isOptionVisible: {
    setEthAddress: true,
    detachResolver: true,
    detachRegistry: true,
  },
  isSettled: true,
  hasFailed: false,
}

/** `parent.eth`'s registry holds one subname, owned by someone else. */
const THIRD_PARTY_SUBNAME: RegistryDetachImpact = {
  status: 'ready',
  subnameCount: 1,
  hasThirdPartySubnames: true,
  countedRegistry: REGISTRY,
  isRevalidating: false,
}

const EMPTY_REGISTRY: RegistryDetachImpact = {
  status: 'ready',
  subnameCount: 0,
  hasThirdPartySubnames: false,
  countedRegistry: null,
  isRevalidating: false,
}

const controls = (
  overrides: Partial<TransferControls> = {},
): TransferControls => ({
  startTransfer: vi.fn(),
  discardPreparation: vi.fn(),
  transactions: [],
  isPreparing: false,
  prepError: null,
  recordAheadOfMove: null,
  restoreEthAddress: vi.fn(),
  ...overrides,
})

const formWith = (
  impact: RegistryDetachImpact,
  transfer: TransferControls = controls(),
) => (
  <SendNameForm
    owner={OWNER}
    detachTargets={ALL_TARGETS}
    parentWarning={null}
    registryDetachImpact={impact}
    transfer={transfer}
  />
)

const renderForm = (impact: RegistryDetachImpact) =>
  render(formWith(impact), { wrapper: createTestWrapper() })

const enterRecipient = async () => {
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('textbox'),
    '0xcccccccccccccccccccccccccccccccccccccccc',
  )
  return user
}

describe('SendNameForm — detaching the registry (immunefi #93026)', () => {
  it('leaves the registry attached on a default-configured transfer', async () => {
    renderForm(THIRD_PARTY_SUBNAME)
    await enterRecipient()

    // The step that would break every subname under this name must not be
    // armed by simply opening the form.
    expect(
      await screen.findByRole('switch', { name: /detach the registry/i }),
    ).not.toBeChecked()
  })

  it('blocks the transfer until a detach that breaks subnames is acknowledged', async () => {
    renderForm(THIRD_PARTY_SUBNAME)
    const user = await enterRecipient()

    await user.click(
      await screen.findByRole('switch', { name: /detach the registry/i }),
    )

    // Count and third-party ownership are both stated, and the button is dead
    // until the separate acknowledgement is ticked.
    // Stated twice on purpose: once in the alert, once on the tickbox itself.
    expect(screen.getAllByText(/1 subname/)).toHaveLength(2)
    expect(screen.getByText(/belong to other people/i)).toBeInTheDocument()

    const transferButton = screen.getByRole('button', {
      name: /transfer name/i,
    })
    expect(transferButton).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))
    expect(transferButton).toBeEnabled()
  })

  it('asks again when the option is toggled off and back on', async () => {
    renderForm(THIRD_PARTY_SUBNAME)
    const user = await enterRecipient()

    const toggle = await screen.findByRole('switch', {
      name: /detach the registry/i,
    })
    await user.click(toggle)
    await user.click(screen.getByRole('checkbox'))
    await user.click(toggle)
    await user.click(toggle)

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })

  it('needs no acknowledgement when the registry is empty', async () => {
    renderForm(EMPTY_REGISTRY)
    const user = await enterRecipient()

    await user.click(
      await screen.findByRole('switch', { name: /detach the registry/i }),
    )

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /transfer name/i })).toBeEnabled()
  })
})

describe('SendNameForm — consent is tied to what was counted', () => {
  const armDetach = async (impact: RegistryDetachImpact) => {
    const view = renderForm(impact)
    const user = await enterRecipient()
    await user.click(
      await screen.findByRole('switch', { name: /detach the registry/i }),
    )
    return { user, view }
  }

  it('voids the tick when the counted registry changes under the form', async () => {
    const { user, view } = await armDetach(THIRD_PARTY_SUBNAME)
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /transfer name/i })).toBeEnabled()

    // The pointer moved: the sender agreed to break a different registry's
    // names than the one `setSubregistry(0)` would now zero.
    view.rerender(
      formWith({
        ...THIRD_PARTY_SUBNAME,
        countedRegistry:
          '0xcccccccccccccccccccccccccccccccccccccccc' as Address,
      }),
    )

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })

  it('voids the tick when the count changes under the form', async () => {
    const { user, view } = await armDetach(THIRD_PARTY_SUBNAME)
    await user.click(screen.getByRole('checkbox'))

    view.rerender(formWith({ ...THIRD_PARTY_SUBNAME, subnameCount: 9 }))

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })

  it('blocks a cached zero count that is being re-checked', async () => {
    // The registry was empty when last read and is being re-read now. A
    // retained zero must not read as "nothing to lose" — subnames may have been
    // registered since, and detaching would break them with no acknowledgement.
    renderForm({
      status: 'ready',
      subnameCount: 0,
      hasThirdPartySubnames: false,
      countedRegistry: REGISTRY,
      isRevalidating: true,
    })
    const user = await enterRecipient()
    await user.click(
      await screen.findByRole('switch', { name: /detach the registry/i }),
    )

    expect(screen.getByText(/checking how many subnames/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })

  it('blocks an already-given tick once a re-check starts', async () => {
    const { user, view } = await armDetach(THIRD_PARTY_SUBNAME)
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /transfer name/i })).toBeEnabled()

    // Focus returns, `staleTime: 0` refetches: the numbers on screen are the
    // previous answer and may be about to be replaced, so the tick can't stand.
    view.rerender(formWith({ ...THIRD_PARTY_SUBNAME, isRevalidating: true }))

    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })
})

describe('SendNameForm — an unknown blast radius', () => {
  const renderAndArmDetach = async (impact: RegistryDetachImpact) => {
    renderForm(impact)
    const user = await enterRecipient()
    await user.click(
      await screen.findByRole('switch', { name: /detach the registry/i }),
    )
  }

  it('blocks while the count is still loading', async () => {
    // An uncounted registry is not an empty one — fail closed.
    await renderAndArmDetach({ status: 'pending' })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })

  it('blocks, and says why, when the count cannot be read at all', async () => {
    await renderAndArmDetach({ status: 'error' })

    expect(
      screen.getByText(/couldn’t check how many subnames/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })
})

describe('SendNameForm while a transfer is being prepared', () => {
  // Immunefi #91822: the recipient stayed editable while the click-time value
  // was being turned into a plan, so the form could show one address and send
  // to another.
  it('locks the recipient and the options', async () => {
    const transfer = controls()
    const { rerender } = render(formWith(EMPTY_REGISTRY, transfer), {
      wrapper: createTestWrapper(),
    })
    await enterRecipient()

    expect(screen.getByRole('textbox')).not.toBeDisabled()

    rerender(formWith(EMPTY_REGISTRY, { ...transfer, isPreparing: true }))

    expect(screen.getByRole('textbox')).toBeDisabled()
    for (const toggle of await screen.findAllByRole('switch')) {
      expect(toggle).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled()
  })

  it('invalidates the prepared plan on every recipient or option edit', async () => {
    const transfer = controls()
    render(formWith(EMPTY_REGISTRY, transfer), { wrapper: createTestWrapper() })

    const user = await enterRecipient()
    expect(transfer.discardPreparation).toHaveBeenCalled()

    const discardsAfterTyping = vi.mocked(transfer.discardPreparation).mock
      .calls.length
    await user.click(
      await screen.findByRole('switch', { name: /detach the registry/i }),
    )
    expect(vi.mocked(transfer.discardPreparation).mock.calls.length).toBe(
      discardsAfterTyping + 1,
    )
  })
})

describe('SendNameForm — ETH address without the resolver detach (immunefi #93008)', () => {
  /** Own resolver with an ETH record, but no ROLE_SET_RESOLVER to detach it. */
  const NO_RESOLVER_ROLE: TransferDetachTargets = {
    isOptionVisible: {
      setEthAddress: true,
      detachResolver: false,
      detachRegistry: false,
    },
    isSettled: true,
    hasFailed: false,
  }

  it('does not claim a resolver detach that is not in the plan', async () => {
    const transfer = controls()
    render(
      <SendNameForm
        owner={OWNER}
        detachTargets={NO_RESOLVER_ROLE}
        parentWarning={null}
        transfer={transfer}
      />,
      { wrapper: createTestWrapper() },
    )
    const user = await enterRecipient()

    // The repoint is a real write, so it's shown as one — live and described.
    const ethToggle = await screen.findByRole('switch', {
      name: /set the eth address/i,
    })
    expect(ethToggle).toBeEnabled()
    expect(
      screen.queryByText(/while the resolver is being detached/i),
    ).not.toBeInTheDocument()
    // And why the detach isn't offered is said, not left to be inferred.
    expect(
      screen.getByText(/isn’t allowed to detach this name’s resolver/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /transfer name/i }))
    expect(transfer.startTransfer).toHaveBeenCalledWith({
      recipientInput: '0xcccccccccccccccccccccccccccccccccccccccc',
      recipient: '0xcccccccccccccccccccccccccccccccccccccccc',
      options: {
        setEthAddress: true,
        detachResolver: false,
        detachRegistry: false,
        revokeRoles: false,
      },
      roleGrants: [],
      hasRemainingRoleHolders: false,
    })
  })

  it('still covers the ETH address when the detach really is planned', async () => {
    renderForm(EMPTY_REGISTRY)
    await enterRecipient()

    expect(
      await screen.findByRole('switch', { name: /set the eth address/i }),
    ).toBeDisabled()
    expect(
      screen.getByText(/while the resolver is being detached/i),
    ).toBeInTheDocument()
  })
})

describe('SendNameForm — a move that failed after the record landed (immunefi #93008)', () => {
  const RECIPIENT = '0xcccccccccccccccccccccccccccccccccccccccc' as Address

  const renderStranded = (previousEthAddress: Address | null) => {
    const transfer: TransferControls = {
      ...controls(),
      recordAheadOfMove: { recipient: RECIPIENT, previousEthAddress },
    }
    render(
      <SendNameForm
        owner={OWNER}
        detachTargets={ALL_TARGETS}
        parentWarning={null}
        transfer={transfer}
      />,
      { wrapper: createTestWrapper() },
    )
    return transfer
  }

  it('says the name was not moved but its ETH address was, and offers a revert', async () => {
    // e.g. the recipient contract started rejecting `onERC1155Received`
    // between the preflight and the move.
    const transfer = renderStranded(OWNER)

    expect(
      screen.getByText(/transfer didn’t go through, so you still own/i),
    ).toBeInTheDocument()
    expect(screen.getByText(RECIPIENT)).toBeInTheDocument()
    expect(screen.getByText(OWNER)).toBeInTheDocument()

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /restore eth address/i }))
    expect(transfer.restoreEthAddress).toHaveBeenCalledOnce()
  })

  it('still reports the changed record when there is nothing to restore to', () => {
    renderStranded(null)

    expect(screen.getByText(RECIPIENT)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /restore eth address/i }),
    ).not.toBeInTheDocument()
  })
})

/**
 * Immunefi #89627: registry roles are keyed on the label and ownership on the
 * token id, so a delegate the seller added through the Add User sheet keeps
 * write authority over the name after it is sold. The transfer form is where
 * the seller is offered the clean handoff, so it is where the grant has to go.
 */
describe('SendNameForm — third-party role grants (immunefi #89627)', () => {
  const DELEGATE = '0x1111111111111111111111111111111111111111' as Address

  const ONE_DELEGATE: TransferRoleRevocations = {
    status: 'ready',
    holders: [{ account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] }],
    revocable: [{ account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] }],
    unrevocable: [],
  }

  const renderWithRoles = (revocations: TransferRoleRevocations) => {
    const startTransfer = vi.fn()
    render(
      <SendNameForm
        owner={OWNER}
        detachTargets={ALL_TARGETS}
        parentWarning={null}
        registryDetachImpact={EMPTY_REGISTRY}
        roleRevocations={revocations}
        transfer={controls({ startTransfer })}
      />,
      { wrapper: createTestWrapper() },
    )
    return startTransfer
  }

  it('revokes a delegate’s grant on a default-configured transfer', async () => {
    const startTransfer = renderWithRoles(ONE_DELEGATE)
    const user = await enterRecipient()

    expect(
      await screen.findByRole('switch', { name: /revoke everyone else/i }),
    ).toBeChecked()

    await user.click(screen.getByRole('button', { name: /transfer name/i }))

    expect(startTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ revokeRoles: true }),
        roleGrants: [{ account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] }],
        hasRemainingRoleHolders: false,
      }),
    )
  })

  it('names the delegate and what it holds', async () => {
    renderWithRoles(ONE_DELEGATE)
    await enterRecipient()

    expect(await screen.findByText(/0x1111/)).toBeInTheDocument()
    expect(screen.getByText(/Set Resolver/)).toBeInTheDocument()
  })

  it('warns, and sends no grants, when the sender turns it off', async () => {
    const startTransfer = renderWithRoles(ONE_DELEGATE)
    const user = await enterRecipient()

    await user.click(
      await screen.findByRole('switch', { name: /revoke everyone else/i }),
    )
    expect(screen.getByText(/keep their permissions/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /transfer name/i }))

    expect(startTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ revokeRoles: false }),
        roleGrants: [],
        // The registry refuses a plain transfer with the delegate still on
        // the name, so the plan needs to know it is staying.
        hasRemainingRoleHolders: true,
      }),
    )
  })

  // No toggle to offer, and nothing for the sender to decide.
  it('offers nothing when nobody else holds a role', async () => {
    renderWithRoles({
      status: 'ready',
      holders: [],
      revocable: [],
      unrevocable: [],
    })
    await enterRecipient()

    // Waited on rather than read once: the recipient's own resolution keeps the
    // button disabled for a tick, and it is the settled state that matters.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /transfer name/i }),
      ).toBeEnabled(),
    )
    expect(
      screen.queryByRole('switch', { name: /revoke everyone else/i }),
    ).not.toBeInTheDocument()
  })

  // A grant the sender holds no admin role for survives the transfer whatever
  // the toggle says, so it is called out rather than silently attempted.
  it('says which grants it cannot revoke, and leaves them out', async () => {
    const startTransfer = renderWithRoles({
      status: 'ready',
      holders: [{ account: DELEGATE, roles: ['ROLE_RENEW'] }],
      revocable: [],
      unrevocable: [{ account: DELEGATE, roles: ['ROLE_RENEW'] }],
    })
    const user = await enterRecipient()

    expect(
      await screen.findByText(/doesn’t hold the admin permission/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /transfer name/i }))
    expect(startTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        roleGrants: [],
        hasRemainingRoleHolders: true,
      }),
    )
  })

  // An unread answer must never pass for "nobody else holds roles": that is
  // exactly the state that would hand the name over with the grants live.
  it('blocks while the grants are still being read', async () => {
    renderWithRoles({ status: 'pending' })
    await enterRecipient()

    expect(
      await screen.findByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })

  it('blocks, and says why, when the grants cannot be read', async () => {
    renderWithRoles({ status: 'error' })
    await enterRecipient()

    expect(
      await screen.findByText(/couldn’t check who else holds permissions/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })
})
