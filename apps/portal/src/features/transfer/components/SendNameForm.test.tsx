import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import type { RegistryDetachImpact, TransferDetachTargets } from '../types'
import { SendNameForm } from './SendNameForm'

// The modal needs the TransactionManager provider and renders nothing for an
// empty transaction list; the form's gating is what's under test.
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: () => null,
}))

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address

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
  subnameCount: 1,
  hasThirdPartySubnames: true,
  isLoading: false,
  isError: false,
}

const EMPTY_REGISTRY: RegistryDetachImpact = {
  subnameCount: 0,
  hasThirdPartySubnames: false,
  isLoading: false,
  isError: false,
}

const renderForm = (impact: RegistryDetachImpact) =>
  render(
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
    />,
    { wrapper: createTestWrapper() },
  )

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
    await renderAndArmDetach({ ...EMPTY_REGISTRY, isLoading: true })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })

  it('blocks, and says why, when the count cannot be read at all', async () => {
    await renderAndArmDetach({ ...EMPTY_REGISTRY, isError: true })

    expect(
      screen.getByText(/couldn’t check how many subnames/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /transfer name/i }),
    ).toBeDisabled()
  })
})
