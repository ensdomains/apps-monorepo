import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { GeneralTab } from './GeneralTab'
import { profileLanguageOptions } from './profileLanguages'

const profileImageFieldMock = vi.hoisted(() => ({
  removeHandlers: new Map<string, () => void>(),
  themeColors: new Map<string, string | null | undefined>(),
}))

const visibleFieldsMock = vi.hoisted(() => ({
  fields: ['avatar', 'header', 'description'] as readonly string[],
}))

vi.mock('../../EditProfileDialog.context', () => ({
  useEditProfileDialogActions: () => ({
    showField: vi.fn(),
    toggleField: vi.fn(),
  }),
  useEditProfileDialogStatus: () => ({ isSaving: false }),
  useEditProfileVisibleFields: () => new Set(visibleFieldsMock.fields),
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

    const description = screen.getByRole('textbox', {
      name: 'Profile Description',
    })
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

const SelectorsHarness = ({
  initial = {},
}: {
  readonly initial?: ProfileRecords['base']
}) => {
  const [values, setValues] = useState<ProfileRecords>({
    ...newEmptyProfileRecords(),
    base: initial,
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
      <output data-testid="contact-records">
        {JSON.stringify(values.contact)}
      </output>
    </>
  )
}

describe('GeneralTab language and timezone selectors', () => {
  beforeEach(() => {
    visibleFieldsMock.fields = ['timezone', 'language']
  })

  it('filters languages as the user types and stores the picked code', async () => {
    render(<SelectorsHarness />)

    const language = screen.getByRole('combobox', { name: 'Language' })
    fireEvent.change(language, { target: { value: 'fren' } })

    const option = await screen.findByRole('option', { name: 'French' })
    expect(screen.queryByRole('option', { name: 'German' })).toBeNull()

    fireEvent.click(option)

    expect(
      JSON.parse(screen.getByTestId('base-records').textContent ?? '{}'),
    ).toMatchObject({ language: 'fr' })
    expect(language).toHaveValue('French')
  })

  it('shows the saved language label and keeps a value outside the list', () => {
    render(<SelectorsHarness initial={{ language: 'xx-custom' }} />)

    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue(
      'xx-custom',
    )
  })

  it('clears the record when the text is removed', () => {
    render(<SelectorsHarness initial={{ language: 'fr' }} />)

    const language = screen.getByRole('combobox', { name: 'Language' })
    expect(language).toHaveValue('French')

    fireEvent.change(language, { target: { value: '' } })

    expect(
      JSON.parse(screen.getByTestId('base-records').textContent ?? '{}'),
    ).toEqual({ language: '' })
  })

  it('picks the highlighted option with the keyboard', async () => {
    render(<SelectorsHarness />)

    const language = screen.getByRole('combobox', { name: 'Language' })
    fireEvent.change(language, { target: { value: 'germ' } })
    await screen.findByRole('option', { name: 'German' })

    fireEvent.keyDown(language, { key: 'ArrowDown' })
    fireEvent.keyDown(language, { key: 'Enter' })

    expect(
      JSON.parse(screen.getByTestId('base-records').textContent ?? '{}'),
    ).toMatchObject({ language: 'de' })
  })

  it('lists every option from the chevron', async () => {
    render(<SelectorsHarness />)

    const language = screen.getByRole('combobox', { name: 'Language' })
    const trigger = language.parentElement?.querySelector('button')
    if (!trigger) throw new Error('missing combobox trigger')

    fireEvent.click(trigger)

    expect(await screen.findAllByRole('option')).toHaveLength(
      profileLanguageOptions.length,
    )
  })

  it('tells the user when nothing matches', async () => {
    render(<SelectorsHarness />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'zzz' },
    })

    expect(await screen.findByText('No matches')).toBeInTheDocument()
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('filters timezones by offset text', async () => {
    render(<SelectorsHarness />)

    const timezone = screen.getByRole('combobox', { name: 'Timezone' })
    fireEvent.change(timezone, { target: { value: '+5:4' } })

    fireEvent.click(await screen.findByRole('option', { name: 'UTC+5:45' }))

    expect(
      JSON.parse(screen.getByTestId('contact-records').textContent ?? '[]'),
    ).toEqual([{ key: 'timezone', value: 'UTC+5:45' }])
  })
})
