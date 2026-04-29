import { Intercom } from '@intercom/messenger-js-sdk'
import { createIsomorphicFn } from '@tanstack/react-start'

const CLIENT_initializeIntercom = () => {
  Intercom({
    app_id: 're9q5yti',
  })
}

export const initializeIntercom = createIsomorphicFn().client(
  CLIENT_initializeIntercom,
)
