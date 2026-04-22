import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import type { ClassifiedName } from '../service/classifyNames'

const makeName = (
  fullName: string,
  tokenType: ClassifiedName['tokenType'],
): ClassifiedName => {
  const label = fullName.split('.')[0] ?? fullName
  const parentName = fullName.includes('.')
    ? fullName.split('.').slice(1).join('.')
    : null
  return {
    domain: {
      id: fullName,
      name: fullName,
      labelName: label,
    },
    tokenType,
    label,
    parentName,
    fuses: 0,
    tokenHolder: '0x0000000000000000000000000000000000000001',
    v1ResolverAddress: null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
  } as unknown as ClassifiedName
}

const eligibleFixture: readonly ClassifiedName[] = [
  makeName('sub1234.eth', 'unwrapped'),
  makeName('gm.sub1234.eth', 'locked-child'),
  makeName('sub123.eth', 'unwrapped'),
]

vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => ({ eligible: eligibleFixture, isPending: false }),
}))

// eslint-disable-next-line import/first
import { SelectNamesStep } from './SelectNamesStep'

const renderStep = () => {
  const onNamesChange = vi.fn<(names: string[]) => void>()
  const onNext = vi.fn()
  const utils = render(
    <SelectNamesStep onNamesChange={onNamesChange} onNext={onNext} />,
  )
  return { onNamesChange, onNext, ...utils }
}

describe('SelectNamesStep', () => {
  it('seeds all visible names as selected on mount', () => {
    const { onNamesChange, getByText } = renderStep()
    expect(getByText('sub1234.eth')).toBeInTheDocument()
    expect(getByText('gm.sub1234.eth')).toBeInTheDocument()
    expect(getByText('sub123.eth')).toBeInTheDocument()
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect([...lastCall].sort()).toEqual(
      ['gm.sub1234.eth', 'sub123.eth', 'sub1234.eth'].sort(),
    )
  })

  it('unselecting a parent unselects all its subnames', () => {
    const { onNamesChange, getByText } = renderStep()
    const parentRow = getByText('sub1234.eth').closest('button')
    if (!parentRow) throw new Error('parent row not found')
    fireEvent.click(parentRow)
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect(lastCall).not.toContain('sub1234.eth')
    expect(lastCall).not.toContain('gm.sub1234.eth')
    expect(lastCall).toContain('sub123.eth')
  })

  it('re-selecting a parent re-adds all its subnames', () => {
    const { onNamesChange, getByText } = renderStep()
    const parentRow = getByText('sub1234.eth').closest('button')
    if (!parentRow) throw new Error('parent row not found')
    fireEvent.click(parentRow)
    fireEvent.click(parentRow)
    const lastCall = onNamesChange.mock.calls.at(-1)?.[0] ?? []
    expect(lastCall).toContain('sub1234.eth')
    expect(lastCall).toContain('gm.sub1234.eth')
  })

  it('subname rows are not interactive', () => {
    const { onNamesChange, getByText } = renderStep()
    const subnameText = getByText('gm.sub1234.eth')
    expect(subnameText.closest('button')).toBeNull()
    const callsBefore = onNamesChange.mock.calls.length
    fireEvent.click(subnameText)
    expect(onNamesChange.mock.calls.length).toBe(callsBefore)
  })

  it('searching a subname keeps the parent visible for context', () => {
    const { getByLabelText, getByText, queryByText } = renderStep()
    const searchInput = getByLabelText('Search names')
    fireEvent.change(searchInput, { target: { value: 'gm' } })
    expect(getByText('gm.sub1234.eth')).toBeInTheDocument()
    expect(getByText('sub1234.eth')).toBeInTheDocument()
    expect(queryByText('sub123.eth')).toBeNull()
  })
})
