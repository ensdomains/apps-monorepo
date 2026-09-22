import { makeClassified } from '../service/_fixtures'

const name = makeClassified({ name: 'lunaverse.eth' })

export const nameRowFixture = {
  ...name,
  domain: { ...name.domain, labelName: 'lunaverse' },
}

export const nameRowStates = [
  { id: 'selected', isSelected: true, isPrimary: false },
  { id: 'selected-primary', isSelected: true, isPrimary: true },
  { id: 'unselected', isSelected: false, isPrimary: false },
  { id: 'unselected-primary', isSelected: false, isPrimary: true },
]
