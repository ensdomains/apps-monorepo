import { FormApi } from '@tanstack/react-form'
import { describe, expect, it, vi } from 'vitest'
import { parseJevAiResponse } from '@/features/ai/intent'
import type { PreparedManagerAction } from '@/features/ai/managerActions'
import { openManagerAction } from '@/features/ai/openManagerAction'
import { prepareAiHandoff } from '@/features/ai/prepareAiHandoff'
import { getNotificationEmailDefaults } from './emailProposal'

const choice = (value: string) => ({
  type: 'choice',
  choice: value,
  confidence: 0.99,
})

describe('notification email proposal defaults', () => {
  it('uses the exact proposal as the native form input value', () => {
    const form = new FormApi({
      defaultValues: getNotificationEmailDefaults('ai-demo@example.test'),
    })
    expect(form.state.values.email).toBe('ai-demo@example.test')
  })

  it('keeps ordinary notification settings empty without a proposal', () => {
    expect(getNotificationEmailDefaults()).toEqual({ email: '' })
  })

  it('retains the locally extracted email through interpretation, preparation, review and native form initialization', async () => {
    const interpreted = parseJevAiResponse(
      {
        answers: {
          fully_supported: { type: 'noul', noul: 0.99 },
          unsupported_requirement: { type: 'noul', noul: 0.01 },
          multi_action: { type: 'noul', noul: 0.01 },
          intent: choice('manager_action'),
          next_intent: choice('none'),
          request_mode: choice('requested'),
          action_count: choice('one'),
          manager_action: choice('email_add'),
          manager_constraints: choice('represented'),
        },
      },
      'Add ai-demo@example.test as my notification email',
    )
    expect(interpreted?.action).toEqual({
      intent: 'manager_action',
      kind: 'email_add',
      email: 'ai-demo@example.test',
    })
    if (!interpreted) throw new Error('The email request must be interpreted')
    const prepared = prepareAiHandoff(interpreted.action, {})
    expect(prepared.status).toBe('ready')
    if (
      prepared.status !== 'ready' ||
      prepared.action.intent !== 'manager_action'
    )
      throw new Error('The exact email must be ready without another input')
    const formValues: Array<{ email: string }> = []
    const navigate = vi.fn()
    await openManagerAction(prepared.action, {
      isCurrent: () => true,
      navigate,
      openManagerReview: (proposal: PreparedManagerAction) => {
        const form = new FormApi({
          defaultValues: getNotificationEmailDefaults(proposal.email),
        })
        formValues.push(form.state.values)
      },
    })
    expect(formValues).toEqual([{ email: 'ai-demo@example.test' }])
    expect(navigate).not.toHaveBeenCalled()
  })
})
