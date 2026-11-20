import { expect, it } from 'vitest'
import { getRegistrationFlowViewEvents } from './registrationFlowView'

const WALLET_A = '0x1111111111111111111111111111111111111111'
const WALLET_B = '0x2222222222222222222222222222222222222222'
const previous = { flowId: 'flow', identity: WALLET_A, hasPayment: true }
const entry = ['registration:flow_view', 'registration:duration_view']

it.each([
  { current: previous, expected: [] },
  {
    current: { ...previous, identity: WALLET_B },
    expected: [...entry, 'registration:payment_view'],
  },
  {
    current: { ...previous, flowId: 'another-flow' },
    expected: [...entry, 'registration:payment_view'],
  },
  {
    current: {
      ...previous,
      identity: 'new-anonymous-browser',
      hasPayment: false,
    },
    expected: entry,
  },
])('observes $current as $expected', ({ current, expected }) => {
  expect(getRegistrationFlowViewEvents(previous, current)).toEqual(expected)
})

it('observes payment again after the picker was hidden', () => {
  const hidden = { ...previous, hasPayment: false }
  expect(getRegistrationFlowViewEvents(previous, hidden)).toEqual([])
  expect(getRegistrationFlowViewEvents(hidden, previous)).toEqual([
    'registration:payment_view',
  ])
})
