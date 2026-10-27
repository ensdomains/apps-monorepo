import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { useAppForm } from '../../form'
import { EditProfileDialogBody } from './EditProfileDialogBody'

// Keep the real review controls, validation, preview gating and footer; tabs
// and media fetching are unrelated to whether an incomplete import can publish.
vi.mock('./EditProfileDialogTabs', () => ({
  EditProfileDialogTabs: () => null,
  editProfileTabs: [],
}))
vi.mock('./EditProfileDialogHeader', () => ({
  EditProfileDialogHeader: () => null,
}))

describe('resolver import review in the profile editor', () => {
  it.each([
    {
      records: {
        ...newEmptyProfileRecords(),
        base: { description: 'Old description' },
      },
      key: 'text:description',
    },
    {
      records: {
        ...newEmptyProfileRecords(),
        unknown: [{ key: 'custom', value: 'Old custom record' }],
      },
      key: 'text:custom',
    },
    {
      records: {
        ...newEmptyProfileRecords(),
        addresses: [
          { coinType: 60, value: '0x1111111111111111111111111111111111111111' },
        ],
      },
      key: 'addr:60',
    },
  ])('previews a deletion-only replacement for $key', ({ records, key }) => {
    const onPreview = vi.fn()
    const Harness = () => {
      const form = useAppForm({ defaultValues: records })
      return (
        <>
          <button
            onClick={() => form.reset(newEmptyProfileRecords())}
            type="button"
          >
            Clear records
          </button>
          <EditProfileDialogBody
            form={form}
            isFinalizingImageSave={false}
            isResolverAccessPending={false}
            name="transferred.eth"
            onCancel={vi.fn()}
            onImageUploadPrepared={vi.fn()}
            onPreview={onPreview}
            onRecheckPermissions={vi.fn()}
            open
            preparedImageUploads={[]}
            requiresResolverPreparation
            savedRecords={records}
          />
        </>
      )
    }
    const view = render(<Harness />)
    const preview = view.getByRole('button', { name: 'Preview' })
    expect(preview).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(view.getByRole('button', { name: 'Clear records' }))
    expect(preview).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(preview)
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        base: {},
        social: [],
        unknown: [],
        addresses: [],
      }),
      expect.objectContaining({
        editedRecordKeys: [key],
        hasRecordChanges: true,
      }),
    )
  })

  it('preserves an explicitly edited raw links record in the replacement preview', () => {
    const rawLinks =
      '[{"name":"Website","url":"https://example.com","custom":true}]'
    const records = newEmptyProfileRecords()
    const onPreview = vi.fn()
    const Harness = () => {
      const form = useAppForm({
        defaultValues: {
          ...records,
          unknown: [{ key: 'links', value: rawLinks }],
        },
      })
      return (
        <EditProfileDialogBody
          form={form}
          isFinalizingImageSave={false}
          isResolverAccessPending={false}
          name="alice.eth"
          onCancel={vi.fn()}
          onImageUploadPrepared={vi.fn()}
          onPreview={onPreview}
          onRecheckPermissions={vi.fn()}
          open
          preparedImageUploads={[]}
          requiresResolverPreparation
          savedRecords={records}
        />
      )
    }
    const view = render(<Harness />)
    fireEvent.click(view.getByRole('button', { name: 'Preview' }))
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ unknown: [{ key: 'links', value: rawLinks }] }),
      expect.anything(),
    )
  })

  it('previews only explicit edits for resolver replacement and captures their keys before normalization', () => {
    const records = {
      ...newEmptyProfileRecords(),
      social: [
        { key: 'com.twitter', value: 'https://twitter.com/previousowner' },
      ],
    }
    const onPreview = vi.fn()
    const Harness = () => {
      const form = useAppForm({ defaultValues: records })
      return (
        <>
          <button
            onClick={() =>
              form.setFieldValue('base.description', 'My description')
            }
            type="button"
          >
            Change description
          </button>
          <EditProfileDialogBody
            form={form}
            isFinalizingImageSave={false}
            isResolverAccessPending={false}
            name="transferred.eth"
            onCancel={vi.fn()}
            onImageUploadPrepared={vi.fn()}
            onPreview={onPreview}
            onRecheckPermissions={vi.fn()}
            open
            preparedImageUploads={[]}
            requiresResolverPreparation
            savedRecords={records}
          />
        </>
      )
    }
    const view = render(<Harness />)
    expect(view.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    fireEvent.click(view.getByRole('button', { name: 'Change description' }))
    fireEvent.click(view.getByRole('button', { name: 'Preview' }))
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        social: [],
        base: { description: 'My description' },
      }),
      expect.objectContaining({ editedRecordKeys: ['text:description'] }),
    )
  })

  it.each([
    { abi: '{"legacy":true}', replacement: false },
    { abi: 'https://example.com/contract-abi.json', replacement: false },
    { abi: '{"legacy":true}', replacement: true },
    { abi: 'https://example.com/contract-abi.json', replacement: true },
  ])(
    'allows an unrelated edit with unchanged legacy ABI, replacement=$replacement: $abi',
    async ({ abi, replacement }) => {
      const records: ReturnType<typeof newEmptyProfileRecords> = {
        ...newEmptyProfileRecords(),
        abi,
      }
      const onPreview = vi.fn()
      const Harness = () => {
        const form = useAppForm({ defaultValues: records })
        return (
          <>
            <button
              onClick={() =>
                form.setFieldValue('base.description', 'Updated description')
              }
              type="button"
            >
              Change description
            </button>
            <EditProfileDialogBody
              form={form}
              isFinalizingImageSave={false}
              isResolverAccessPending={false}
              name="alice.eth"
              onCancel={vi.fn()}
              onImageUploadPrepared={vi.fn()}
              onPreview={onPreview}
              onRecheckPermissions={vi.fn()}
              open
              preparedImageUploads={[]}
              requiresResolverPreparation={replacement}
              savedRecords={records}
            />
          </>
        )
      }
      const view = render(<Harness />)
      fireEvent.click(view.getByRole('button', { name: 'Change description' }))
      const preview = view.getByRole('button', { name: 'Preview' })
      expect(preview).toHaveAttribute('aria-disabled', 'false')
      fireEvent.click(preview)
      expect(onPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          abi: replacement ? undefined : abi,
          base: expect.objectContaining({ description: 'Updated description' }),
        }),
        expect.anything(),
      )
    },
  )
  it('blocks confirmation and preview for a failed key, offers retry, then requires a fresh review', () => {
    const onPreview = vi.fn()
    const onRetry = vi.fn()
    const warnings = ['Review recovered records before replacing the resolver.']
    const records = newEmptyProfileRecords()
    const Harness = ({ blockedKeys }: { blockedKeys: readonly string[] }) => {
      const form = useAppForm({ defaultValues: records })
      return (
        <>
          <button
            onClick={() =>
              form.setFieldValue('base.description', 'My description')
            }
            type="button"
          >
            Change description
          </button>
          <EditProfileDialogBody
            form={form}
            importBlockedKeys={blockedKeys}
            importWarnings={warnings}
            isFinalizingImageSave={false}
            isResolverAccessPending={false}
            name="alice.eth"
            onCancel={vi.fn()}
            onImageUploadPrepared={vi.fn()}
            onPreview={onPreview}
            onRecheckPermissions={vi.fn()}
            onRetryImport={onRetry}
            open
            preparedImageUploads={[]}
            requiresResolverPreparation
            savedRecords={records}
          />
        </>
      )
    }
    const view = render(<Harness blockedKeys={['text:description']} />)
    expect(view.getByRole('alert')).toHaveTextContent('text:description')
    const [warning] = warnings
    if (warning === undefined) throw new Error('Missing import warning')
    expect(view.getByText(warning)).toBeVisible()
    expect(view.getByRole('checkbox')).toBeDisabled()
    const preview = view.getByRole('button', { name: 'Preview' })
    expect(preview).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(preview)
    expect(onPreview).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'Retry import' }))
    expect(onRetry).toHaveBeenCalledOnce()
    view.rerender(<Harness blockedKeys={[]} />)
    expect(view.getByRole('checkbox')).toBeEnabled()
    fireEvent.click(view.getByRole('button', { name: 'Change description' }))
    expect(preview).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(view.getByRole('checkbox'))
    expect(preview).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(preview)
    expect(onPreview).toHaveBeenCalledOnce()
  })
})
