import type { AiAction } from './intent'
import {
  type AiHandoffInputs,
  type AiHandoffPreparation,
  prepareAiHandoff,
} from './prepareAiHandoff'

export type AiDetailField = Extract<
  AiHandoffPreparation,
  { status: 'needs_input' }
>['field']

type AiDetailPreparation =
  | {
      readonly status: 'accepted'
      readonly inputs: AiHandoffInputs
      readonly preparation: AiHandoffPreparation
    }
  | { readonly status: 'invalid'; readonly message: string }

export const prepareAiDetail = (
  action: AiAction,
  inputs: AiHandoffInputs,
  field: AiDetailField,
  value: string,
): AiDetailPreparation => {
  const current = prepareAiHandoff(action, inputs)
  if (current.status !== 'needs_input' || current.field !== field) {
    return {
      status: 'invalid',
      message: 'This request no longer needs that detail.',
    }
  }
  if (
    current.options &&
    !current.options.some((option) => option.value === value)
  ) {
    return {
      status: 'invalid',
      message: 'Choose one of the available options.',
    }
  }
  const nextInputs: AiHandoffInputs = {
    ...inputs,
    [field]:
      field === 'durationDays' || field === 'durationYears'
        ? Number(value)
        : value,
  }
  const preparation = prepareAiHandoff(action, nextInputs)
  if (
    preparation.status === 'invalid' ||
    (preparation.status === 'needs_input' && preparation.field === field)
  ) {
    return { status: 'invalid', message: preparation.message }
  }
  return { status: 'accepted', inputs: nextInputs, preparation }
}
