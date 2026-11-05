import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, waitFor } from '@testing-library/react'
import { useActorRef } from '@xstate/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Tabs } from '@/components/ui/tabs'
import type { RecordType } from '@/features/profile/service/recordTypeLocks'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { EditProfileDialogProvider } from './EditProfileDialog.context'
import { editProfileDialogMachine } from './EditProfileDialog.machine'
import { EditProfileDialogTabs } from './EditProfileDialogTabs'

const getExplorerUrl = vi.hoisted(() => vi.fn<() => string | null>())
vi.mock('@/constants', () => ({
  get EXPLORER_URL() {
    return getExplorerUrl()
  },
}))

beforeEach(() => {
  getExplorerUrl.mockReturnValue('https://sepolia.explorer.ens.domains')
})

const renderAdvanced = (
  records = newEmptyProfileRecords(),
  {
    lockedRecordTypes = new Set<RecordType>(),
    tab = 'other',
  }: {
    readonly lockedRecordTypes?: ReadonlySet<RecordType>
    readonly tab?: string
  } = {},
) => {
  const onOtherChange = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false } },
  })
  const Harness = () => {
    const [values, setValues] = useState(records)
    const actor = useActorRef(editProfileDialogMachine, {
      input: { name: '🦊.eth', records },
    })
    return (
      <QueryClientProvider client={queryClient}>
        <EditProfileDialogProvider
          actor={actor}
          lockedRecordTypes={lockedRecordTypes}
        >
          <Tabs defaultValue={tab}>
            <EditProfileDialogTabs
              isMobileNavOpen={false}
              name="🦊.eth"
              onAddressesChange={vi.fn()}
              onBaseChange={vi.fn()}
              onContactChange={vi.fn()}
              onDraftLinkValidationIssuesChange={vi.fn()}
              onLinksChange={vi.fn()}
              onMobileNavOpenChange={vi.fn()}
              onOtherChange={(value) => {
                onOtherChange(value)
                setValues((current) => ({ ...current, ...value }))
              }}
              onSocialChange={vi.fn()}
              preparedImageUploads={[]}
              values={values}
            />
          </Tabs>
        </EditProfileDialogProvider>
      </QueryClientProvider>
    )
  }
  return { ...render(<Harness />), onOtherChange }
}

describe('Advanced profile navigation', () => {
  it('offers the Explorer landing page and equivalent name and history views', () => {
    const view = renderAdvanced()

    expect(view.getByRole('tab', { name: 'Advanced' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      view.getByRole('link', { name: 'ENS Explorer app' }),
    ).toHaveAttribute('href', 'https://sepolia.explorer.ens.domains')
    expect(view.getByRole('link', { name: '🦊.eth' })).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/%F0%9F%A6%8A.eth',
    )
    expect(view.getByRole('link', { name: 'View history' })).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/%F0%9F%A6%8A.eth/history',
    )
    expect(view.getByRole('link', { name: 'ENS docs' })).toHaveAttribute(
      'href',
      'https://docs.ens.domains',
    )
  })

  it('copies the complete name from its entity actions', async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue()
    const view = renderAdvanced()

    fireEvent.focus(view.getByRole('link', { name: '🦊.eth' }))
    fireEvent.click(view.getByRole('button', { name: 'Copy name' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('🦊.eth'))
    writeText.mockRestore()
  })

  it('keeps local custom record editing available', () => {
    const view = renderAdvanced()

    fireEvent.click(view.getByText('Edit records here'))
    fireEvent.click(view.getByRole('button', { name: 'Add custom record' }))

    expect(view.onOtherChange).toHaveBeenCalledWith(
      expect.objectContaining({ unknown: [{ key: '', value: '' }] }),
    )
  })

  it('opens local controls automatically when record validation needs attention', () => {
    const view = renderAdvanced({
      ...newEmptyProfileRecords(),
      unknown: [{ key: '', value: 'A recovered record' }],
    })

    expect(view.getByRole('textbox', { name: 'Record 1 key' })).toBeVisible()
    expect(view.getByRole('alert')).toHaveTextContent('Enter a key')
  })

  it('keeps the local editor open while correcting an imported record key', () => {
    const view = renderAdvanced({
      ...newEmptyProfileRecords(),
      unknown: [{ key: '', value: 'A recovered record' }],
    })
    view.getByRole('textbox', { name: 'Record 1 key' }).focus()

    for (const key of ['o', 'org.', 'org.ens']) {
      fireEvent.change(view.getByRole('textbox', { name: 'Record 1 key' }), {
        target: { value: key },
      })
    }

    expect(view.getByRole('textbox', { name: 'Record 1 key' })).toHaveValue(
      'org.ens',
    )
    expect(view.getByRole('textbox', { name: 'Record 1 key' })).toHaveFocus()
    expect(view.queryByRole('alert')).toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'Edit records here' }))
    expect(view.queryByRole('textbox', { name: 'Record 1 key' })).toBeNull()
  })

  it('keeps editing available without cross-network links when Explorer is unavailable', () => {
    getExplorerUrl.mockReturnValue(null)
    const view = renderAdvanced()

    expect(view.queryByRole('link', { name: '🦊.eth' })).toBeNull()
    expect(view.queryByRole('link', { name: 'ENS Explorer app' })).toBeNull()
    expect(
      view.getByRole('button', { name: 'Add custom record' }),
    ).toBeVisible()
    expect(view.getByRole('link', { name: 'ENS docs' })).toHaveAttribute(
      'href',
      'https://docs.ens.domains',
    )
  })

  it('dismisses entity actions with Escape and restores them on focus', () => {
    const view = renderAdvanced()
    const nameLink = view.getByRole('link', { name: '🦊.eth' })

    fireEvent.focus(nameLink)
    fireEvent.keyDown(nameLink, { key: 'Escape' })
    expect(view.queryByRole('button', { name: 'Copy name' })).toBeNull()

    fireEvent.focus(nameLink)
    expect(view.getByRole('button', { name: 'Copy name' })).toBeInTheDocument()
  })
})

describe('Locked record types', () => {
  it('disables the address fields when addresses are locked', () => {
    const view = renderAdvanced(newEmptyProfileRecords(), {
      lockedRecordTypes: new Set(['address']),
      tab: 'addresses',
    })

    expect(
      view.getByRole('textbox', { name: 'Your Ethereum Address' }),
    ).toBeDisabled()
  })

  it('disables only the locked record types in the local editor', () => {
    const view = renderAdvanced(newEmptyProfileRecords(), {
      lockedRecordTypes: new Set(['abi']),
    })

    fireEvent.click(view.getByText('Edit records here'))

    expect(
      view.getByRole('textbox', { name: 'Contract ABI (JSON)' }),
    ).toBeDisabled()
    expect(view.getByRole('textbox', { name: 'Content hash' })).toBeEnabled()
    expect(
      view.getByRole('button', { name: 'Add custom record' }),
    ).toBeEnabled()
  })
})
