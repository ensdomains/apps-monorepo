import { expect, it } from 'vitest'
import { getFlowViewEvents } from './flowView'

it('observes a returned screen without manufacturing another flow entry', () => {
  const view = {
    flow: 'registration',
    flow_id: 'flow',
    step: 'payment',
  } as const
  const first = getFlowViewEvents(undefined, view, 'anonymous')
  const active = getFlowViewEvents(first.observation, undefined, 'anonymous')
  const returned = getFlowViewEvents(active.observation, view, 'anonymous')
  expect(returned.events).toEqual([
    { name: 'registration:payment_view', properties: { flow_id: 'flow' } },
  ])
  expect(
    getFlowViewEvents(returned.observation, view, 'anonymous').events,
  ).toEqual([])
})

it('retains the actual renewal protocol on entry and payment observations', () => {
  const view = {
    flow: 'renewal',
    flow_id: 'renewal-flow',
    step: 'payment',
    protocol_version: 'v1',
  } as const
  const result = getFlowViewEvents(undefined, view, 'anonymous')
  expect(result.events).toEqual([
    {
      name: 'renewal:flow_view',
      properties: { flow_id: 'renewal-flow', protocol_version: 'v1' },
    },
    {
      name: 'renewal:payment_view',
      properties: { flow_id: 'renewal-flow', protocol_version: 'v1' },
    },
  ])
})
