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
  it.each(['{"legacy":true}', 'https://example.com/contract-abi.json'])(
    'allows an unrelated edit while preserving an unchanged legacy ABI: %s',
    async (abi) => {
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
          abi,
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
      )
    }
    const view = render(<Harness blockedKeys={['text:description']} />)
    expect(view.getByRole('alert')).toHaveTextContent('text:description')
    expect(view.getByText(warnings[0]!)).toBeVisible()
    expect(view.getByRole('checkbox')).toBeDisabled()
    const preview = view.getByRole('button', { name: 'Preview' })
    expect(preview).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(preview)
    expect(onPreview).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'Retry import' }))
    expect(onRetry).toHaveBeenCalledOnce()
    view.rerender(<Harness blockedKeys={[]} />)
    expect(view.getByRole('checkbox')).toBeEnabled()
    expect(preview).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(view.getByRole('checkbox'))
    expect(preview).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(preview)
    expect(onPreview).toHaveBeenCalledOnce()
  })
})
