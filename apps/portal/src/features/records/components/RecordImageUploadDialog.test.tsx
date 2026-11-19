// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { okAsync, ResultAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { cropImageFile } from '@/features/records/helpers/recordImageCanvas'
import { RecordImageUploadDialog } from './RecordImageUploadDialog'

const CROPPED = new File(['jpeg'], 'a-cropped.jpg', { type: 'image/jpeg' })

// Canvas encoding has its own tests; happy-dom cannot decode images.
vi.mock('@/features/records/helpers/recordImageCanvas', () => ({
  cropImageFile: vi.fn(() => okAsync(CROPPED)),
}))

const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve: () => resolve() }
}

const renderDialog = (onConfirm: (file: File) => Promise<void>) => {
  const onClose = vi.fn()
  const view = render(
    <RecordImageUploadDialog
      kind="avatar"
      mode="replace"
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  )
  // The parent unmounts the dialog when it closes.
  onClose.mockImplementation(() => view.unmount())
  return { onClose }
}

const chooseAndLoadImage = async () => {
  await userEvent.upload(
    screen.getByLabelText('Upload avatar file'),
    new File(['x'], 'a.png', { type: 'image/png' }),
  )
  const preview = await screen.findByRole('img', { name: 'Crop preview' })
  Object.defineProperties(preview, {
    naturalHeight: { value: 400 },
    naturalWidth: { value: 400 },
  })
  fireEvent.load(preview)
}

describe('RecordImageUploadDialog', () => {
  it('shows a rejected upload and lets the user retry the same crop', async () => {
    const onConfirm = vi
      .fn<(file: File) => Promise<void>>()
      .mockRejectedValueOnce(new Error('User rejected the request.'))
      .mockResolvedValueOnce(undefined)
    const { onClose } = renderDialog(onConfirm)
    await chooseAndLoadImage()

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign and upload' }),
    )

    expect((await screen.findByRole('alert')).textContent).toBe(
      'User rejected the request.',
    )
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign and upload' }),
    )

    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onConfirm).toHaveBeenLastCalledWith(CROPPED)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close again when an upload finishes after the user cancelled', async () => {
    const upload = deferred()
    const { onClose } = renderDialog(() => upload.promise)
    await chooseAndLoadImage()

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign and upload' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    upload.resolve()
    // Let the pending handler run to completion.
    await new Promise((settled) => setTimeout(settled, 0))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not start the upload if the user cancels while the crop is encoding', async () => {
    const crop = deferred()
    vi.mocked(cropImageFile).mockReturnValueOnce(
      ResultAsync.fromSafePromise(crop.promise.then(() => CROPPED)),
    )
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    renderDialog(onConfirm)
    await chooseAndLoadImage()

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign and upload' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    crop.resolve()
    await new Promise((settled) => setTimeout(settled, 0))

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
