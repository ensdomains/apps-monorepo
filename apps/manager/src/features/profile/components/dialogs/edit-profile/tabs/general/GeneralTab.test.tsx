import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { GeneralTab } from './GeneralTab'

const profileImageFieldMock = vi.hoisted(() => ({
  removeHandlers: new Map<string, () => void>(),
  themeColors: new Map<string, string | null | undefined>(),
}))

vi.mock('../../EditProfileDialog.context', () => ({
  useEditProfileDialogActions: () => ({
    showField: vi.fn(),
    toggleField: vi.fn(),
  }),
  useEditProfileDialogStatus: () => ({ isSaving: false }),
  useEditProfileVisibleFields: () =>
    new Set(['avatar', 'header', 'description']),
}))

vi.mock('./ProfileImageField', () => ({
  ProfileImageField: ({
    kind,
    onImageRemove,
    themeColor,
  }: {
    readonly kind: string
    readonly onImageRemove: () => void
    readonly themeColor?: string | null
  }) => {
    profileImageFieldMock.removeHandlers.set(kind, onImageRemove)
    profileImageFieldMock.themeColors.set(kind, themeColor)

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
      theme: '#984D1B',
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

const LegacyDescriptionHarness = () => {
  const savedDescription = 'A'.repeat(700)
  const [values, setValues] = useState<ProfileRecords>({
    ...newEmptyProfileRecords(),
    base: { description: savedDescription },
  })

  return (
    <GeneralTab
      name="test.eth"
      onBaseChange={(base) =>
        setValues((currentValues) => ({ ...currentValues, base }))
      }
      onContactChange={(contact) =>
        setValues((currentValues) => ({ ...currentValues, contact }))
      }
      preparedImageUploads={[]}
      savedDescription={savedDescription}
      values={values}
    />
  )
}

describe('GeneralTab image removal', () => {
  beforeEach(() => {
    profileImageFieldMock.removeHandlers.clear()
    profileImageFieldMock.themeColors.clear()
  })

  it('passes the profile theme to the avatar image field', () => {
    render(<ProfileImageRemovalHarness />)

    expect(profileImageFieldMock.themeColors.get('avatar')).toBe('#984D1B')
  })

  it('keeps the avatar removed when removing the banner afterwards', () => {
    render(<ProfileImageRemovalHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'remove avatar' }))
    expect(getBaseRecords()).toEqual({
      avatar: '',
      header: 'https://example.com/banner.png',
      theme: '#984D1B',
    })

    fireEvent.click(screen.getByRole('button', { name: 'remove header' }))

    expect(getBaseRecords()).toEqual({
      avatar: '',
      header: '',
      theme: '#984D1B',
    })
  })
})

describe('GeneralTab description', () => {
  it('keeps a legacy description intact but flags an over-limit edit', () => {
    render(<LegacyDescriptionHarness />)

    const description = screen.getByRole('textbox', { name: 'Description' })
    expect(description).toHaveValue('A'.repeat(700))
    expect(description).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(description, { target: { value: 'A'.repeat(699) } })

    expect(description).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Description must be 500 characters or fewer',
    )
  })
})
