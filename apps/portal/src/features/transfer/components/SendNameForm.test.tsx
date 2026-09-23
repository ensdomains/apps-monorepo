import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
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

const formWith = (impact: RegistryDetachImpact) => (
  <SendNameForm
    owner={OWNER}
    detachTargets={ALL_TARGETS}
    parentWarning={null}
    registryDetachImpact={impact}
    transfer={{
      startTransfer: vi.fn(),
      transactions: [],
      isPreparing: false,
      prepError: null,
    }}
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
        transfer={{
          startTransfer,
          transactions: [],
          isPreparing: false,
          prepError: null,
        }}
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
      expect.objectContaining({ roleGrants: [] }),
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
