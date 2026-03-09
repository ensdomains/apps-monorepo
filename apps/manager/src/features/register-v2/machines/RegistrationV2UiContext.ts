import { createActorContext } from '@xstate/react'
import { registrationV2UiMachine } from './registrationV2UiMachine'

export const RegistrationV2UiContext =
  createActorContext(registrationV2UiMachine)
