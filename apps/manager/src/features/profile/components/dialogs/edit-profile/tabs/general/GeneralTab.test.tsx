import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { GeneralTab } from './GeneralTab'

const profileImageFieldMock = vi.hoisted(() => ({
  removeHandlers: new Map<string, () => void>(),
}))

vi.mock('../../EditProfileDialog.context', () => ({
  useEditProfileDialogActions: () => ({
    showField: vi.fn(),
    toggleField: vi.fn(),
  }),
  useEditProfileDialogStatus: () => ({ isSaving: false }),
  useEditProfileVisibleFields: () => new Set(['avatar', 'header']),
}))

vi.mock('./ProfileImageField', () => ({
  ProfileImageField: ({
    kind,
    onImageRemove,
  }: {
    readonly kind: string
    readonly onImageRemove: () => void
  }) => {
    profileImageFieldMock.removeHandlers.set(kind, onImageRemove)

    return (
      <button
        onClick={() => profileImageFieldMock.removeHandlers.get(kind)?.()}
        type="button"
      >
        remove {kind}
      </button>
    )
  },
}))

const ProfileImageRemovalHarness = () => {
  const [values, setValues] = useState<ProfileRecords>({
    ...newEmptyProfileRecords(),
    base: {
      avatar: 'https://example.com/avatar.png',
      header: 'https://example.com/banner.png',
    },
  })

  return (
    <>
      <GeneralTab
        name="test.eth"
        onBaseChange={(base) =>
          setValues((currentValues) => ({ ...currentValues, base }))
        }
        onContactChange={(contact) =>
          setValues((currentValues) => ({ ...currentValues, contact }))
        }
        preparedImageUploads={[]}
        values={values}
      />
      <output data-testid="base-records">{JSON.stringify(values.base)}</output>
    </>
  )
}

const getBaseRecords = () =>
  JSON.parse(screen.getByTestId('base-records').textContent ?? '{}') as Record<
    string,
    string
  >

describe('GeneralTab image removal', () => {
  beforeEach(() => {
    profileImageFieldMock.removeHandlers.clear()
  })

  it('keeps the avatar removed when removing the banner afterwards', () => {
    render(<ProfileImageRemovalHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'remove avatar' }))
    expect(getBaseRecords()).toEqual({
      avatar: '',
      header: 'https://example.com/banner.png',
    })

    fireEvent.click(screen.getByRole('button', { name: 'remove header' }))

    expect(getBaseRecords()).toEqual({
      avatar: '',
      header: '',
    })
  })
})
