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

export const gracePeriodRowFixtures = [
  makeClassified({ name: 'allada.eth', id: 'allada.eth' }),
  makeClassified({ name: 'allana.eth', id: 'allana.eth' }),
]

export const longGracePeriodRowFixture = makeClassified({
  name: 'a-very-long-name-in-grace-period.eth',
})
