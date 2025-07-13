import {
  createFormHook,
  createFormHookContexts,
  formOptions,
} from '@tanstack/react-form'
import type { ProfileRecords } from '@/features/profile/types'

const { fieldContext, formContext } = createFormHookContexts()

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {},
})

export const sharedOptions = formOptions({
  defaultValues: {} as ProfileRecords,
})
